const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Puppeteer: usar chromium en producción, puppeteer normal en desarrollo
const isProduction = process.env.NODE_ENV === 'production';
let puppeteer, chromium;
if (isProduction) {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} else {
  puppeteer = require('puppeteer');
}

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Strapi API configuration
const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

// FR360 API configuration
const FR360_BASE_URL = process.env.FR360_BASE_URL;
const FR360_TOKEN = process.env.FR360_BEARER_TOKEN;

// Validate required environment variables
if (!STRAPI_BASE_URL || !STRAPI_TOKEN) {
  console.error('❌ Missing required Strapi environment variables');
  console.error('Required: STRAPI_BASE_URL, STRAPI_TOKEN');
}

/**
 * Retry helper with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Initial retry delay in milliseconds
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 5, retryDelay = 1000) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Get products from Strapi with different modes
 * @param {Object} options - Options for product retrieval
 * @param {string} options.mode - Mode: 'names', 'catalog', 'description'
 * @param {string} options.productName - Product name (for description mode)
 * @param {boolean} options.includeMetadata - Include metadata
 * @returns {Promise<Array|string|null>} Products array, names array, or description
 */
async function getProducts(options = {}) {
  const {
    mode = 'names',
    productName = null,
    includeMetadata = false
  } = options;

  const url = productName
    ? `${STRAPI_BASE_URL}/api/productos?filters[nombre][$eq]=${encodeURIComponent(productName)}`
    : `${STRAPI_BASE_URL}/api/productos?filters[disponible_venta_comercial_fr][$eq]=true&pagination[pageSize]=200&sort=nombre:asc`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      if (mode === 'description') {
        console.log('❌ Error HTTP al consultar producto');
        return null;
      }
      return [];
    }

    const raw = Array.isArray(response.data.data) ? response.data.data : [];

    if (mode === 'description') {
      if (raw.length === 0) {
        return null;
      }
      const product = raw[0].attributes || raw[0];
      const description = product.sub_categoria || product.nombre;
      return description;
    }

    const rows = raw
      .map(it => it.attributes ? ({ id: it.id, documentId: it.documentId, ...it.attributes }) : it)
      .filter(p => p.vigente !== false && p.disponible_venta_comercial_fr);

    if (mode === 'names') {
      return rows.map(p => p.nombre).filter(Boolean);
    }

    if (mode === 'catalog') {
      return rows.map(p => ({
        id: p.id,
        documentId: p.documentId,
        nombre: p.nombre,
        categoria: p.categoria,
        sub_categoria: p.sub_categoria,
        sku: p.sku,
        marca: p.marca,
        es_estudiante_nuevo: !!p.es_estudiante_nuevo,
        precio: (p.precio == null ? null : Number(p.precio)),
        precio_contado_comercial: (p.precio_contado_comercial == null ? null : Number(p.precio_contado_comercial)),
        precio_financiado_comercial: (p.precio_financiado_comercial == null ? null : Number(p.precio_financiado_comercial)),
        max_financiacion: (p.max_financiacion == null ? null : Number(p.max_financiacion))
      }));
    }

    return rows;
  } catch (error) {
    if (mode === 'description') {
      console.log('❌ Error al consultar producto:', error.message);
      return null;
    }
    return [];
  }
}

/**
 * Fetch sales records (ventas) by identity document
 * @param {string} uid - Identity document number
 * @returns {Promise<Array>} Array of sales records
 */
async function fetchVentas(uid) {
  const filtro = `filters[numero_documento][$eq]=${encodeURIComponent(uid)}`;
  const url = `${STRAPI_BASE_URL}/api/facturaciones?${filtro}&populate=*&pagination[pageSize]=200`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) return [];

    const arr = Array.isArray(response.data.data) ? response.data.data : [];
    return arr.map(it => it.attributes ? ({ id: it.id, documentId: it.documentId, ...it.attributes }) : it);
  } catch (error) {
    console.log('❌ Error fetching ventas:', error.message);
    return [];
  }
}

/**
 * Fetch agreements (acuerdos) by identity document
 * @param {string} uid - Identity document number
 * @returns {Promise<Array>} Array of agreements
 */
async function fetchAcuerdos(uid) {
  const filtro = `filters[numero_documento][$eq]=${encodeURIComponent(uid)}`;
  const url = `${STRAPI_BASE_URL}/api/carteras?${filtro}&populate=*`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      throw new Error(`Error al obtener acuerdos: HTTP ${response.status}`);
    }

    return Array.isArray(response.data.data) ? response.data.data : [];
  } catch (error) {
    console.log('❌ Error fetching acuerdos:', error.message);
    throw error;
  }
}

/**
 * Actualizar cuotas de un acuerdo (Otrosí - renegociación)
 * @param {string} nroAcuerdo - Número del acuerdo
 * @param {Array} changes - Array de cambios [{documentId, valor_cuota, fecha_limite}]
 * @returns {Promise<Object>} Resultado de la operación
 */
async function actualizarCuotasOtrosi(nroAcuerdo, changes) {
  console.log(`[Otrosí] Actualizando ${changes.length} cuota(s) del acuerdo ${nroAcuerdo}`);

  try {
    const results = [];

    for (const change of changes) {
      const { documentId, valor_cuota, fecha_limite } = change;

      const url = `${STRAPI_BASE_URL}/api/carteras/${documentId}`;
      const payload = {
        data: {
          valor_cuota: valor_cuota,
          fecha_limite: fecha_limite
        }
      };

      console.log(`[Otrosí] Actualizando cuota ${documentId}: valor=${valor_cuota}, fecha=${fecha_limite}`);

      const response = await axios.put(url, payload, {
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      results.push({
        documentId,
        success: response.status === 200,
        status: response.status
      });
    }

    const allSuccess = results.every(r => r.success);
    console.log(`[Otrosí] Resultado: ${allSuccess ? '✅ Todo OK' : '⚠️ Algunos fallaron'}`);

    return {
      success: allSuccess,
      message: `${results.filter(r => r.success).length} de ${results.length} cuota(s) actualizadas.`,
      results
    };
  } catch (error) {
    console.error('[Otrosí] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Elaborar documento Otrosí, actualizar cuotas en Strapi y guardar en Supabase
 * @param {Object} data - Datos del otrosí
 * @param {string} data.nroAcuerdo - Número del acuerdo
 * @param {string} data.nombre - Nombre completo del deudor
 * @param {string} data.cedula - Cédula del deudor
 * @param {Array} data.cuotas - Cuotas [{documentId, cuotaNro, valor_cuota, fecha_limite}]
 * @returns {Promise<Object>} { success, documentUrl, error }
 */
async function elaborarOtrosi(data) {
  const { nroAcuerdo, nombre, cedula, cuotas } = data;
  console.log(`[Otrosí] Elaborando otrosí para acuerdo ${nroAcuerdo} - ${nombre}`);

  try {
    // 1. Leer template HTML (NO se modifican cuotas en Strapi)
    const templatePath = path.join(__dirname, '..', 'templates', 'otrosi.html');
    let html = fs.readFileSync(templatePath, 'utf8');

    // 2. Obtener fecha actual en Colombia
    const now = new Date();
    const col = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
    const dia = col.getDate();
    const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
                   'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const mes = meses[col.getMonth()];
    const ano = col.getFullYear();

    // 3. Generar tabla de cuotas HTML
    let tablaCuotas = '';
    cuotas.forEach(c => {
      const fechaParts = c.fecha_limite.split('-');
      const fechaFormateada = `${fechaParts[2]}/${fechaParts[1]}/${fechaParts[0]}`;
      const valorFormateado = `$${Number(c.valor_cuota).toLocaleString('es-CO')}`;
      tablaCuotas += `
        <tr>
          <td>${c.cuotaNro}</td>
          <td>${fechaFormateada}</td>
          <td>${valorFormateado}</td>
        </tr>
      `;
    });

    // 4. Reemplazar placeholders
    // Cargar logo como base64
    let logoBase64 = '';
    try {
      const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo-futuros-residentes.jpg');
      const buffer = fs.readFileSync(logoPath);
      logoBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    } catch (err) {
      console.log('[Otrosí] Logo no encontrado, usando URL externa');
      logoBase64 = 'https://cursofuturosresidentes.com/wp-content/uploads/2024/07/FR-logo-2.png';
    }

    html = html
      .replace(/\{\{acuerdo\}\}/g, nroAcuerdo)
      .replace(/\{\{nombre\}\}/g, nombre)
      .replace(/\{\{cedula\}\}/g, cedula)
      .replace(/\{\{tablaCuotas\}\}/g, tablaCuotas)
      .replace(/\{\{dia\}\}/g, dia)
      .replace(/\{\{mes\}\}/g, mes)
      .replace(/\{\{ano\}\}/g, ano)
      .replace(/\{\{logo\}\}/g, logoBase64);

    // 5. Subir a Supabase Storage
    const bucketName = 'otrosi-documents';
    const fileName = `otrosi-${nroAcuerdo}-${Date.now()}.html`;

    // Asegurar que el bucket existe
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(b => b.name === bucketName);

    if (!bucketExists) {
      console.log('[Otrosí] Creando bucket otrosi-documents...');
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 10485760
      });
      if (createError && !createError.message.includes('already exists')) {
        throw new Error(`Error creando bucket: ${createError.message}`);
      }
    }

    // Subir archivo
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, Buffer.from(html, 'utf8'), {
        contentType: 'text/html',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Error subiendo documento: ${uploadError.message}`);
    }

    // Obtener URL pública
    const { data: publicUrl } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    console.log(`[Otrosí] ✅ HTML subido: ${publicUrl.publicUrl}`);

    // 6. Generar PDF con Puppeteer
    console.log('[Otrosí] Generando PDF...');
    let browser;
    if (isProduction) {
      // Producción: usar @sparticuz/chromium
      browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless
      });
    } else {
      // Desarrollo: usar puppeteer normal
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }

    let pdfBase64 = '';
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdfBuffer = await page.pdf({
        format: 'Letter',
        printBackground: true,
        margin: { top: '15mm', bottom: '15mm', left: '20mm', right: '20mm' }
      });
      pdfBase64 = Buffer.from(pdfBuffer).toString('base64');
      console.log(`[Otrosí] ✅ PDF generado: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
    } finally {
      await browser.close();
    }

    return {
      success: true,
      documentUrl: publicUrl.publicUrl,
      htmlContent: html,
      pdfBase64: pdfBase64,
      message: 'Otrosí generado exitosamente'
    };

  } catch (error) {
    console.error('[Otrosí] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetch CRM record from Strapi by identity document
 * @param {string} uid - Identity document number
 * @returns {Promise<Object|null>} CRM record or null
 */
async function fetchCrmStrapiOnly(uid) {
  const url = `${STRAPI_BASE_URL}/api/crms?filters[numero_documento][$eq]=${uid}`;

  return retryWithBackoff(async (attempt) => {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status === 200) {
      const list = Array.isArray(response.data.data) ? response.data.data : [];
      if (!list.length) return null;

      const record = list[0];
      const att = record.attributes || record;

      return {
        correo: att.correo || '',
        celular: att.celular || ''
      };
    } else {
      throw new Error(`Strapi GET falló (HTTP ${response.status})`);
    }
  });
}

/**
 * Fetch multiple CRM records from Strapi in batch
 * @param {string[]} uids - Array of identity document numbers
 * @returns {Promise<Object>} Object with format { 'cedula': {correo, celular}, ... }
 */
async function fetchCrmStrapiBatch(uids) {
  if (!Array.isArray(uids) || uids.length === 0) {
    return {};
  }

  // Build URL with Strapi v4 syntax for $in with array
  const baseUrl = `${STRAPI_BASE_URL}/api/crms`;
  const filterParams = uids.map((uid, index) =>
    `filters[numero_documento][$in][${index}]=${encodeURIComponent(uid)}`
  ).join('&');
  const url = `${baseUrl}?${filterParams}`;

  try {
    return await retryWithBackoff(async (attempt) => {
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`
        }
      });

      if (response.status === 200) {
        const list = Array.isArray(response.data.data) ? response.data.data : [];

        const result = {};
        list.forEach(record => {
          const att = record.attributes || record;
          const numDoc = String(att.numero_documento || '').trim();
          if (numDoc) {
            result[numDoc] = {
              correo: att.correo || '',
              celular: att.celular || '',
              nombres: att.nombres || '',
              apellidos: att.apellidos || '',
              numero_documento: numDoc
            };
          }
        });

        return result;
      } else {
        throw new Error(`Strapi GET BATCH falló (HTTP ${response.status})`);
      }
    });
  } catch (error) {
    console.error('[CRM Batch] Error:', error.message);
    return {};
  }
}

/**
 * Fetch CRM record by email
 * @param {string} email - Email address
 * @returns {Promise<Object|null>} CRM record or null
 */
async function fetchCrmByEmail(email) {
  if (!email) return null;

  const q = String(email).trim();
  // Usar $eqi para búsqueda case-insensitive
  const url = `${STRAPI_BASE_URL}/api/crms?filters[correo][$eqi]=${encodeURIComponent(q)}&pagination[pageSize]=1`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      throw new Error(`Strapi HTTP ${response.status}`);
    }

    const row = response.data?.data?.[0];
    if (!row) return null;

    const a = row.attributes || row;
    const uid = String(a.numero_documento || a.identityDocument || '').replace(/\D/g, '');

    return {
      uid: uid,
      nombres: a.nombres || '',
      apellidos: a.apellidos || '',
      correo: a.correo || q,
      celular: (a.celular || '').replace(/[^\d+]/g, '')
    };
  } catch (error) {
    console.log('❌ Error fetching CRM by email:', error.message);
    return null;
  }
}

/**
 * Fetch CRM by celular (phone number)
 * Normalizes Colombian phone numbers and searches using 'contains' filter
 * @param {string} celular - Phone number (can be 10, 12, or 13 digits)
 * @returns {Promise<Object|null>} CRM record with numero_documento
 */
async function fetchCrmByCelular(celular) {
  if (!celular) return null;

  // Normalizar: quitar espacios, guiones, paréntesis
  let normalized = String(celular).trim().replace(/[\s\-()]/g, '');

  // Detectar si es celular colombiano y normalizar a 10 dígitos
  // Formato: 10 dígitos (3XXXXXXXXX), 12 dígitos (573XXXXXXXXX), 13 dígitos (+573XXXXXXXXX)
  if (normalized.startsWith('+573') && normalized.length === 13) {
    normalized = normalized.substring(3); // Quitar +57
  } else if (normalized.startsWith('573') && normalized.length === 12) {
    normalized = normalized.substring(2); // Quitar 57
  } else if (normalized.startsWith('3') && normalized.length === 10) {
    // Ya está normalizado
  } else {
    // No es un celular colombiano válido
    return null;
  }


  const url = `${STRAPI_BASE_URL}/api/crms?filters[celular][$contains]=${encodeURIComponent(normalized)}&pagination[pageSize]=1`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      throw new Error(`Strapi HTTP ${response.status}`);
    }

    const row = response.data?.data?.[0];
    if (!row) return null;

    const a = row.attributes || row;
    const uid = String(a.numero_documento || a.identityDocument || '').replace(/\D/g, '');

    return {
      uid: uid,
      nombres: a.nombres || '',
      apellidos: a.apellidos || '',
      correo: a.correo || '',
      celular: (a.celular || '').replace(/[^\d+]/g, '')
    };
  } catch (error) {
    console.log('❌ Error fetching CRM by celular:', error.message);
    return null;
  }
}

/**
 * Update celular in ActiveCampaign CRM
 * @param {string} correo - Email address
 * @param {string} nuevoCelular - New phone number in format +573XXXXXXXXX
 * @returns {Promise<Object>} Result object
 */
async function updateCelularCRM(correo, nuevoCelular) {
  const API_TOKEN = process.env.ACTIVECAMPAIGN_API_TOKEN;
  const AC_BASE_URL = 'https://sentiretaller.api-us1.com/api/3';

  if (!API_TOKEN) {
    throw new Error('ACTIVECAMPAIGN_API_TOKEN no está configurado');
  }

  try {

    // 1. Obtener contact ID
    const getContactUrl = `${AC_BASE_URL}/contacts?email=${encodeURIComponent(correo)}`;
    const getResponse = await fetch(getContactUrl, {
      headers: { 'Api-Token': API_TOKEN }
    });

    if (!getResponse.ok) {
      throw new Error(`HTTP ${getResponse.status} al buscar contacto`);
    }

    const getData = await getResponse.json();

    if (!getData.scoreValues || getData.scoreValues.length === 0) {
      throw new Error('No se encontró contacto en CRM');
    }

    const contactId = getData.scoreValues[0].contact;

    // 2. Actualizar teléfono
    const updateUrl = `${AC_BASE_URL}/contacts/${contactId}`;
    const updateResponse = await fetch(updateUrl, {
      method: 'PUT',
      headers: {
        'Api-Token': API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contact: {
          phone: nuevoCelular
        }
      })
    });

    if (!updateResponse.ok) {
      throw new Error(`HTTP ${updateResponse.status} al actualizar contacto`);
    }

    const result = await updateResponse.json();
    return result;
  } catch (error) {
    console.error('❌ Error actualizando celular en CRM:', error.message);
    throw error;
  }
}

/**
 * Update celular in Strapi Carteras
 * @param {string} cedula - Número de documento
 * @param {string} nuevoCelular - New phone number in format +573XXXXXXXXX
 * @returns {Promise<Object>} Result object
 */
async function updateCelularStrapiCarteras(cedula, nuevoCelular) {
  try {

    // 1. Obtener carteras del usuario
    const carterasUrl = `${STRAPI_BASE_URL}/api/carteras?filters[numero_documento][$eq]=${encodeURIComponent(cedula)}`;
    const carterasResponse = await fetch(carterasUrl, {
      headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
    });

    if (!carterasResponse.ok) {
      throw new Error(`HTTP ${carterasResponse.status} al obtener carteras`);
    }

    const carterasData = await carterasResponse.json();

    if (!carterasData.data || carterasData.data.length === 0) {
      return { updated: 0 };
    }

    // 2. Actualizar cada cartera
    const updates = [];
    for (const cartera of carterasData.data) {
      const updateUrl = `${STRAPI_BASE_URL}/api/carteras/${cartera.documentId}`;
      const updatePromise = fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            celular: nuevoCelular
          }
        })
      });
      updates.push(updatePromise);
    }

    await Promise.all(updates);
    return { updated: carterasData.data.length };
  } catch (error) {
    console.error('[updateCelularStrapiCarteras] Error:', error.message);
    throw error;
  }
}

/**
 * Update celular in FR360 Payment Links
 * @param {string} cedula - Número de documento
 * @param {string} nuevoCelular - New phone number in format +573XXXXXXXXX
 * @returns {Promise<Object>} Result object
 */
async function updateCelularFR360Links(cedula, nuevoCelular) {
  try {

    // 1. Obtener links del usuario usando axios (igual que getLinksByIdentityDocument)
    const linksUrl = `${FR360_BASE_URL}/api/v1/payment-links/list?pageSize=100&page=1&identityDocument=${encodeURIComponent(cedula)}`;
    const linksResponse = await axios.get(linksUrl, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`
      }
    });

    if (linksResponse.status !== 200 || linksResponse.data.status !== 'success' || !Array.isArray(linksResponse.data.data)) {
      return { updated: 0 };
    }

    const linksData = linksResponse.data.data;

    if (linksData.length === 0) {
      return { updated: 0 };
    }

    // 2. Actualizar cada link
    const updates = [];
    for (const link of linksData) {
      const updateUrl = `${FR360_BASE_URL}/api/v1/payment-links`;
      const updatePromise = axios.put(updateUrl, {
        externalId: link.externalId,
        phone: nuevoCelular
      }, {
        headers: {
          'Authorization': `Bearer ${FR360_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      updates.push(updatePromise);
    }

    await Promise.all(updates);
    return { updated: linksData.length };
  } catch (error) {
    console.error('[updateCelularFR360Links] Error:', error.message);
    throw error;
  }
}

/**
 * Save confianza record to Strapi
 * @param {Object} data - Confianza record data
 * @returns {Promise<Object>} Result object
 */
async function saveConfianzaRecord(data) {
  const ENDPOINT = `${STRAPI_BASE_URL}/api/confianzas`;

  console.log('[Confianza] Guardando registro para:', data.cedula);

  try {
    // Obtener fecha actual en zona horaria de Colombia
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-based
    const day = now.getDate();
    const fecha = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    // Obtener productos y comerciales dinámicamente desde Strapi
    const [productos, comerciales] = await Promise.all([
      getProducts({ mode: 'catalog' }),
      getComerciales()
    ]);

    // Buscar producto por nombre
    const producto = productos.find(p => p.nombre === data.producto);
    const productoId = producto ? producto.id : null;

    // Buscar comercial por nombre
    const comercial = comerciales.find(c => c.nombre === data.comercial);
    const comercialId = comercial ? comercial.id : null;

    if (!productoId) {
      console.warn(`⚠️ Producto no encontrado en Strapi: "${data.producto}"`);
    }
    if (!comercialId) {
      console.warn(`⚠️ Comercial no encontrado en Strapi: "${data.comercial}"`);
    }

    // Construir payload para Strapi
    const payload = {
      data: {
        fecha: fecha,
        nombres: data.nombres || '',
        apelidos: data.apellidos || '',
        numero_documento: data.cedula || '',
        celular: data.celular || '',
        correo: data.correo || '',
        producto: productoId ? { id: productoId } : null,
        comercial: comercialId ? { id: comercialId } : null,
        nro_acuerdo: data.nroAcuerdo || '',
        inicio_plataforma: data.fechaInicio || ''
      }
    };

    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    return { success: true, data: response.data };

  } catch (error) {
    console.error('❌ Error guardando registro de confianza en Strapi:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Consult an agreement by agreement number
 * @param {string} nroAcuerdo - Agreement number
 * @returns {Promise<Object>} Agreement data or error
 */
async function consultarAcuerdo(nroAcuerdo) {
  try {

    const url = `${STRAPI_BASE_URL}/api/carteras?populate=*&filters[nro_acuerdo][$eq]=${encodeURIComponent(nroAcuerdo)}&pagination[pageSize]=100`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status !== 200) {
      console.error('Error HTTP:', response.status);
      return {
        success: false,
        error: `Error HTTP: ${response.status}`,
        message: 'Error al consultar la API de Strapi'
      };
    }

    if (!response.data.data || response.data.data.length === 0) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'No se encontró ningún acuerdo con ese número'
      };
    }

    // Obtener datos del primer registro para info general
    const primerRegistro = response.data.data[0];
    const attrPrimero = primerRegistro.attributes || primerRegistro;

    // Obtener nombre del producto
    const productoNombre = attrPrimero.producto?.data?.attributes?.nombre
      || attrPrimero.producto?.nombre
      || 'Producto';

    // Mapear TODAS las cuotas del acuerdo
    const cuotas = response.data.data.map(registro => {
      const attr = registro.attributes || registro;
      return {
        id: registro.id,
        nro_cuota: attr.cuota_nro,
        estado_pago: attr.estado_pago,
        valor_cuota: attr.valor_cuota,
        fecha_limite: attr.fecha_limite,
        link_pago: attr.link_pago,
        producto: productoNombre
      };
    });

    // Ordenar por número de cuota
    cuotas.sort((a, b) => a.nro_cuota - b.nro_cuota);

    // Obtener IDs de producto y comercial
    const productoId = attrPrimero.producto?.data?.id || attrPrimero.producto?.id || null;
    const comercialId = attrPrimero.comercial?.data?.id || attrPrimero.comercial?.id || null;
    const comercialNombre = attrPrimero.comercial?.data?.attributes?.nombre || attrPrimero.comercial?.nombre || '';

    // Buscar productos específicos por cuota (ej: "Élite - 9 meses - Cuota 1")
    try {
      const prodSearchUrl = `${STRAPI_BASE_URL}/api/productos?filters[nombre][$contains]=${encodeURIComponent(productoNombre)}&pagination[pageSize]=50`;
      const prodResponse = await axios.get(prodSearchUrl, {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
      });
      const productosRelacionados = (prodResponse.data?.data || []).map(p => ({
        id: p.id,
        nombre: p.attributes?.nombre || p.nombre
      }));

      // Asignar productoId específico a cada cuota
      cuotas.forEach(cuota => {
        const nombreCuota = `${productoNombre} - Cuota ${cuota.nro_cuota}`;
        const prodCuota = productosRelacionados.find(p => p.nombre === nombreCuota);
        cuota.productoId = prodCuota ? prodCuota.id : productoId;
      });
    } catch (prodError) {
      console.warn('[consultarAcuerdo] No se pudieron buscar productos por cuota:', prodError.message);
      cuotas.forEach(cuota => { cuota.productoId = productoId; });
    }

    const resultado = {
      success: true,
      data: {
        numero_documento: attrPrimero.numero_documento || '',
        nombres: attrPrimero.nombres || '',
        apellidos: attrPrimero.apellidos || '',
        producto: productoNombre,
        productoId: productoId,
        comercial: comercialNombre,
        comercialId: comercialId,
        fechaInicio: attrPrimero.inicio_plataforma || '',
        estado: attrPrimero.estado_firma || '',
        correo: attrPrimero.correo || '',
        celular: attrPrimero.celular || ''
      },
      cuotas: cuotas,
      producto: productoNombre,
      productoId: productoId,
      comercialId: comercialId
    };

    return resultado;

  } catch (error) {
    console.error('Error al consultar acuerdo:', error);
    return {
      success: false,
      error: 'FETCH_ERROR',
      message: 'Error de conexión al consultar el acuerdo',
      details: error.toString()
    };
  }
}

/**
 * Sincronizar CRM por número de documento
 * @param {string} uid - Identity document number
 * @returns {Promise<Object>} Synchronized CRM data
 */
async function sincronizarCrmPorNumeroDocumento(uid) {
  // This would normally sync with external CRM systems
  // For now, just return Strapi data
  try {
    const data = await fetchCrmStrapiOnly(uid);
    return {
      estado: data ? 'success' : 'error',
      mensaje: data ? 'Datos sincronizados' : 'No se encontró en CRM',
      datos: data ? { attributes: data } : null
    };
  } catch (error) {
    return {
      estado: 'error',
      mensaje: error.message
    };
  }
}

/**
 * Genera nro_acuerdo único con formato: yymmdd + 8 dígitos de milisegundos
 * Ejemplo: 26012746991184 (2026-01-27 + 46991184ms)
 * @returns {string} Número de acuerdo
 */
function generarNroAcuerdo() {
  const now = new Date();
  const col = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const yy = String(col.getFullYear()).slice(-2);
  const mm = String(col.getMonth() + 1).padStart(2, '0');
  const dd = String(col.getDate()).padStart(2, '0');
  const ms = String(Date.now() % 100000000).padStart(8, '0');
  return `${yy}${mm}${dd}${ms}`;
}

/**
 * Crear acuerdo de pago con registros de cartera en Strapi
 * @param {string} nombres
 * @param {string} apellidos
 * @param {string} cedula
 * @param {string} correo
 * @param {string} celular
 * @param {string|number} valor - Valor total
 * @param {string} comercialNombre - Nombre del comercial
 * @param {Array} planPagos - [{fecha, valor}]
 * @param {string} productoNombre - Nombre del producto
 * @param {string} inicioTipo - 'primerPago' o 'fecha'
 * @param {string} inicioFecha - Fecha de inicio (si inicioTipo es 'fecha')
 * @returns {Promise<Object>}
 */
async function crearAcuerdo(nombres, apellidos, cedula, correo, celular, valor, comercialNombre, planPagos, productoNombre, inicioTipo, inicioFecha) {
  console.log('[crearAcuerdo] Iniciando creación de acuerdo...');
  console.log('[crearAcuerdo] Estudiante:', nombres, apellidos, '- CC:', cedula);
  console.log('[crearAcuerdo] Producto:', productoNombre, '- Valor:', valor);
  console.log('[crearAcuerdo] Comercial:', comercialNombre);
  console.log('[crearAcuerdo] Inicio:', inicioTipo, inicioFecha || '');
  console.log('[crearAcuerdo] Cuotas:', planPagos.length);

  // 1. Buscar producto y comercial en Strapi
  const [productos, comerciales] = await Promise.all([
    getProducts({ mode: 'catalog' }),
    getComerciales()
  ]);

  const producto = productos.find(p => p.nombre === productoNombre);
  const comercial = comerciales.find(c => c.nombre === comercialNombre);

  if (!producto) {
    throw new Error(`Producto no encontrado en Strapi: "${productoNombre}"`);
  }
  if (!comercial) {
    throw new Error(`Comercial no encontrado en Strapi: "${comercialNombre}"`);
  }

  console.log('[crearAcuerdo] Producto ID:', producto.id);
  console.log('[crearAcuerdo] Comercial ID:', comercial.id);

  // 2. Generar nro_acuerdo (yymmdd + 8 dígitos ms)
  const nroAcuerdo = generarNroAcuerdo();
  console.log('[crearAcuerdo] Nro acuerdo generado:', nroAcuerdo);

  // 3. Determinar inicio_plataforma (null si no hay fecha, Strapi no acepta string vacío para campos date)
  const inicioPlataforma = inicioFecha || null;

  // 4. Buscar productos específicos por cuota (ej: "Élite - 9 meses - Cuota 1")
  let productosCuota = [];
  try {
    const prodSearchUrl = `${STRAPI_BASE_URL}/api/productos?filters[nombre][$contains]=${encodeURIComponent(productoNombre)}&pagination[pageSize]=50`;
    const prodResponse = await axios.get(prodSearchUrl, {
      headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
    });
    productosCuota = (prodResponse.data?.data || []).map(p => ({
      id: p.id,
      nombre: p.attributes?.nombre || p.nombre
    }));
    console.log('[crearAcuerdo] Productos cuota encontrados:', productosCuota.length);
  } catch (err) {
    console.warn('[crearAcuerdo] No se pudieron buscar productos por cuota:', err.message);
  }

  // 5. Calcular valores totales para el acuerdo
  const nroCuotas = planPagos.length;
  const valorTotalAcuerdo = planPagos.reduce((sum, c) => sum + Number(c.valor), 0);
  const fechaFirma = new Date().toISOString().substring(0, 10); // Fecha de hoy YYYY-MM-DD

  // 6. Crear registros de cartera (uno por cuota)
  const carterasCreadas = [];
  for (let i = 0; i < planPagos.length; i++) {
    const cuota = planPagos[i];
    const nroCuota = i + 1;

    // Buscar producto específico para esta cuota
    const nombreCuota = `${productoNombre} - Cuota ${nroCuota}`;
    const prodCuota = productosCuota.find(p => p.nombre === nombreCuota);
    const prodId = prodCuota ? prodCuota.id : producto.id;

    // Formatear fecha_limite (de ISO a YYYY-MM-DD)
    const fechaLimite = cuota.fecha ? cuota.fecha.substring(0, 10) : '';
    const valorCuota = Number(cuota.valor);

    const payloadData = {
      numero_documento: cedula,
      nombres: nombres,
      apellidos: apellidos,
      correo: correo,
      celular: celular,
      nro_acuerdo: nroAcuerdo,
      cuota_nro: nroCuota,
      nro_cuotas: nroCuotas,
      estado_pago: 'al_dia',
      valor_cuota: valorCuota,
      valor_cuota_original: valorCuota,
      fecha_limite: fechaLimite,
      fecha_limite_original: fechaLimite,
      valor_total_acuerdo: valorTotalAcuerdo,
      valor_total_acuerdo_original: valorTotalAcuerdo,
      fecha_firma: fechaFirma,
      valor_pagado: 0,
      estado_firma: 'sin_firmar',
      producto: { id: prodId },
      comercial: { id: comercial.id }
    };

    // Solo incluir inicio_plataforma si tiene valor (Strapi no acepta null/vacío para campos date)
    if (inicioPlataforma) {
      payloadData.inicio_plataforma = inicioPlataforma;
    }

    const payload = { data: payloadData };

    console.log(`[crearAcuerdo] Creando cartera cuota ${nroCuota}/${planPagos.length} - Producto ID: ${prodId} - Fecha: ${fechaLimite} - Valor: ${cuota.valor}`);

    try {
      const response = await axios.post(`${STRAPI_BASE_URL}/api/carteras`, payload, {
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      carterasCreadas.push(response.data);
      console.log(`[crearAcuerdo] Cartera cuota ${nroCuota} creada OK`);
    } catch (postError) {
      console.error(`[crearAcuerdo] Error creando cuota ${nroCuota}:`, postError.response?.data ? JSON.stringify(postError.response.data) : postError.message);
      throw postError;
    }
  }

  console.log(`[crearAcuerdo] ${carterasCreadas.length} carteras creadas para acuerdo ${nroAcuerdo}`);

  return {
    success: true,
    nroAcuerdo,
    carterasCreadas: carterasCreadas.length,
    productoId: producto.id,
    comercialId: comercial.id,
    comercialNombre: comercial.nombre
  };
}

/**
 * Fetch cartera by agreement number
 * @param {string} nroAcuerdo - Agreement number
 * @returns {Promise<Object|null>} Cartera data or null
 */
async function fetchCarteraByAcuerdo(nroAcuerdo) {
  const url = `${STRAPI_BASE_URL}/api/carteras?filters[nro_acuerdo][$eq]=${encodeURIComponent(nroAcuerdo)}&populate=*`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      return null;
    }

    const arr = Array.isArray(response.data.data) ? response.data.data : [];
    if (arr.length === 0) return null;

    const cartera = arr[0];
    const attributes = cartera.attributes || cartera;

    return {
      id: cartera.id,
      documentId: cartera.documentId,
      ...attributes
    };
  } catch (error) {
    console.log(`❌ Error fetching cartera for acuerdo ${nroAcuerdo}:`, error.message);
    return null;
  }
}

/**
 * Get all comerciales from Strapi
 * @returns {Promise<Array>} Array of comerciales with id and nombre
 */
async function getComerciales() {
  const url = `${STRAPI_BASE_URL}/api/comerciales?pagination[pageSize]=200&sort=nombre:asc`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      console.error('❌ Error fetching comerciales:', response.status);
      return [];
    }

    const raw = Array.isArray(response.data.data) ? response.data.data : [];
    const comerciales = raw.map(item => {
      const attributes = item.attributes || item;
      return {
        id: item.id,
        documentId: item.documentId,
        nombre: attributes.nombre || `Comercial ${item.id}`
      };
    });

    return comerciales;

  } catch (error) {
    console.error('❌ Error fetching comerciales:', error.message);
    return [];
  }
}

/**
 * Update comercial field of a facturacion
 * @param {string} documentId - Document ID of the facturacion
 * @param {number} comercialId - ID of the new comercial
 * @returns {Promise<Object>} Update result
 */
async function updateFacturacionComercial(documentId, comercialId) {
  const url = `${STRAPI_BASE_URL}/api/facturaciones/${documentId}`;

  try {
    const payload = {
      data: {
        comercial: comercialId
      }
    };

    const response = await axios.put(url, payload, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return {
        success: false,
        error: `Unexpected status: ${response.status}`
      };
    }

  } catch (error) {
    console.error('[updateFacturacionComercial] Error:', error.message);

    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error?.message || error.message,
        status: error.response.status
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Update facturacion (multiple fields) - Solo para usuarios autorizados
 * @param {string} documentId - Document ID de la facturación
 * @param {Object} data - Datos a actualizar
 * @returns {Promise<Object>} Result object
 */
async function updateFacturacion(documentId, data) {
  const url = `${STRAPI_BASE_URL}/api/facturaciones/${documentId}`;

  try {

    // Construir payload solo con campos permitidos
    const payload = {
      data: {}
    };

    // Mapear campos del frontend a campos de Strapi
    if (data.comercial !== undefined) payload.data.comercial = data.comercial;
    if (data.fecha !== undefined) payload.data.fecha = data.fecha;
    if (data.transaccion !== undefined) payload.data.transaccion = data.transaccion;
    if (data.valor_neto !== undefined) payload.data.valor_neto = data.valor_neto;
    if (data.fecha_inicio !== undefined) payload.data.fecha_inicio = data.fecha_inicio;
    if (data.paz_y_salvo !== undefined) payload.data.paz_y_salvo = data.paz_y_salvo;
    if (data.acuerdo !== undefined) payload.data.acuerdo = data.acuerdo;
    if (data.producto !== undefined) payload.data.producto = data.producto;

    const response = await axios.put(url, payload, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return {
        success: false,
        error: `Unexpected status: ${response.status}`
      };
    }

  } catch (error) {
    console.error('[updateFacturacion] Error:', error.message);

    if (error.response) {
      return {
        success: false,
        error: error.response.data?.error?.message || error.message,
        status: error.response.status
      };
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetch students with 2+ pending installments (al_dia or en_mora)
 * Groups by numero_documento and returns aggregated data
 * @returns {Promise<Object>} Object with students array and totals
 */
async function fetchAnticipadosPendientes() {
  // Traer todas las carteras con estado al_dia o en_mora, solo acuerdos firmados
  const url = `${STRAPI_BASE_URL}/api/carteras?filters[$and][0][$or][0][estado_pago][$eq]=al_dia&filters[$and][0][$or][1][estado_pago][$eq]=en_mora&filters[$and][1][estado_firma][$eq]=firmado&pagination[pageSize]=5000&populate=*`;

  try {

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const raw = Array.isArray(response.data.data) ? response.data.data : [];

    // Agrupar por numero_documento
    const byDocument = {};

    for (const item of raw) {
      const attrs = item.attributes || item;
      const doc = attrs.numero_documento;

      if (!doc) continue;

      // Construir nombre completo desde nombres + apellidos
      const nombreCompleto = [attrs.nombres, attrs.apellidos].filter(Boolean).join(' ').trim();

      if (!byDocument[doc]) {
        byDocument[doc] = {
          documento: doc,
          nombre: nombreCompleto,
          correo: attrs.correo || '',
          celular: attrs.celular || '',
          cuotas: [],
          totalAdeudado: 0,
          totalAlDia: 0  // Solo cuotas al_dia
        };
      }

      // Calcular valor adeudado de esta cuota
      const valorCuota = Number(attrs.valor_cuota) || 0;
      const valorPagado = Number(attrs.valor_pagado) || 0;
      const adeudado = Math.max(0, valorCuota - valorPagado);
      const estadoPago = attrs.estado_pago || '';

      byDocument[doc].cuotas.push({
        nroAcuerdo: attrs.nro_acuerdo,
        cuotaNro: attrs.cuota_nro,
        estadoPago: estadoPago,
        valorCuota: valorCuota,
        valorPagado: valorPagado,
        adeudado: adeudado
      });

      byDocument[doc].totalAdeudado += adeudado;

      // Sumar solo si está al_dia (no en mora)
      if (estadoPago === 'al_dia') {
        byDocument[doc].totalAlDia += adeudado;
      }

      // Actualizar datos del estudiante si están vacíos
      if (!byDocument[doc].nombre && nombreCompleto) byDocument[doc].nombre = nombreCompleto;
      if (!byDocument[doc].correo && attrs.correo) byDocument[doc].correo = attrs.correo;
      if (!byDocument[doc].celular && attrs.celular) byDocument[doc].celular = attrs.celular;
    }

    // Filtrar solo los que tienen 2 o más cuotas pendientes
    const estudiantes = Object.values(byDocument)
      .filter(est => est.cuotas.length >= 2)
      .sort((a, b) => b.totalAdeudado - a.totalAdeudado); // Ordenar por mayor deuda

    // Calcular totales
    const totalEstudiantes = estudiantes.length;
    const totalAdeudado = estudiantes.reduce((sum, est) => sum + est.totalAdeudado, 0);
    const totalAlDia = estudiantes.reduce((sum, est) => sum + est.totalAlDia, 0);

    return {
      success: true,
      estudiantes,
      totales: {
        totalEstudiantes,
        totalAdeudado,
        totalAlDia
      }
    };

  } catch (error) {
    console.error('❌ Error fetching anticipados pendientes:', error.message);
    return {
      success: false,
      error: error.message,
      estudiantes: [],
      totales: { totalEstudiantes: 0, totalAdeudado: 0, totalAlDia: 0 }
    };
  }
}

/**
 * Guardar venta en cuenta corriente en Strapi
 * @param {Object} data - Datos de la venta
 * @returns {Promise<Object>} Resultado de la operación
 */
async function guardarVentaCorriente(data) {
  const ENDPOINT = `${STRAPI_BASE_URL}/api/ventas-corrientes`;

  console.log('[Strapi] Guardando venta corriente para:', data.numero_documento);

  try {
    // Construir payload con todos los campos de ventas-corrientes
    const payloadData = {
      numero_documento: data.numero_documento || '',
      nombres: data.nombres || '',
      apellidos: data.apellidos || '',
      correo: data.correo || '',
      celular: data.celular || '',
      nro_acuerdo: data.nro_acuerdo || '',
      valor: data.valor ? Number(data.valor) : 0,
      estado: 'pendiente',
      comprobante_url: data.comprobante_url || '',
      direccion: data.direccion || '',
      ciudad: data.ciudad || '',
      // Relaciones (formato Strapi v4)
      producto: data.productoId ? { id: Number(data.productoId) } : null,
      comercial: data.comercialId ? { id: Number(data.comercialId) } : null
    };

    const payload = { data: payloadData };

    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    return { success: true, data: response.data };

  } catch (error) {
    console.error('❌ [Strapi] Error guardando venta corriente:', error.message);
    if (error.response) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
      console.error('Response status:', error.response.status);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Normaliza el teléfono agregando +57 si es necesario
 * @param {string} telefono - Número de teléfono
 * @returns {string} - Teléfono normalizado
 */
function normalizePhone(telefono) {
  if (!telefono) return '';

  const cleanPhone = telefono.trim();

  // Si ya tiene +57 o +, retornar tal cual
  if (cleanPhone.startsWith('+')) {
    return cleanPhone;
  }

  // Si es un número de 10 dígitos que empieza con 3 (celular colombiano)
  if (/^3\d{9}$/.test(cleanPhone)) {
    return '+57' + cleanPhone;
  }

  return cleanPhone;
}

/**
 * Crear o actualizar contacto en ActiveCampaign CRM
 * Estrategia Create-First: Intenta crear primero, si existe entonces actualiza
 * @param {Object} data - Datos del contacto
 * @param {string} data.correo - Email
 * @param {string} data.nombres - Nombre
 * @param {string} data.apellidos - Apellido
 * @param {string} data.celular - Teléfono
 * @param {string} data.cedula - Cédula
 * @returns {Promise<Object>} - Resultado de la operación
 */
async function createOrUpdateCRMContact(data) {
  const API_TOKEN = process.env.ACTIVECAMPAIGN_API_TOKEN;
  const AC_BASE_URL = 'https://sentiretaller.api-us1.com/api/3';

  if (!API_TOKEN) {
    throw new Error('ACTIVECAMPAIGN_API_TOKEN no está configurado');
  }

  console.log('[CRM] Create-or-update para:', data.correo);

  // Función interna para crear contacto
  async function createContact() {
    const url = `${AC_BASE_URL}/contacts`;

    const fieldValues = [];

    // Campo 2: Cédula (siempre presente)
    if (data.cedula) {
      fieldValues.push({
        field: '2',
        value: data.cedula
      });
    }

    const contactData = {
      contact: {
        email: data.correo,
        firstName: data.nombres || '',
        lastName: data.apellidos || '',
        phone: normalizePhone(data.celular),
        fieldValues
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Token': API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contactData)
    });

    const responseData = await response.json().catch(() => ({}));

    // Si fue creado exitosamente
    if (response.ok) {
      return {
        created: true,
        contact: responseData.contact
      };
    }

    // Si es un error de duplicado
    if (response.status === 422 || response.status === 400) {
      const errors = responseData.errors || [];
      const isDuplicate = errors.some(err =>
        err.code === 'duplicate' ||
        err.title?.toLowerCase().includes('correo') ||
        err.title?.toLowerCase().includes('email')
      );

      if (isDuplicate) {
        return {
          created: false,
          duplicate: true,
          email: data.correo
        };
      }
    }

    // Cualquier otro error
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(responseData)}`);
  }

  // Función interna para buscar contacto por email
  async function findContactByEmail(email) {
    const url = `${AC_BASE_URL}/contacts?email=${encodeURIComponent(email)}`;

    const response = await fetch(url, {
      headers: {
        'Api-Token': API_TOKEN
      }
    });

    if (response.ok) {
      const result = await response.json();

      if (result.contacts && result.contacts.length > 0) {
        return result.contacts[0];
      } else {
        return null;
      }
    }

    const errorData = await response.json().catch(() => ({}));
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
  }

  // Función interna para actualizar contacto
  async function updateContact(contactId) {
    const url = `${AC_BASE_URL}/contacts/${contactId}`;

    const fieldValues = [];

    // Campo 2: Cédula
    if (data.cedula) {
      fieldValues.push({
        field: '2',
        value: data.cedula
      });
    }

    const contactData = {
      contact: {
        firstName: data.nombres || '',
        lastName: data.apellidos || '',
        phone: normalizePhone(data.celular),
        fieldValues
      }
    };


    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Api-Token': API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contactData)
    });

    if (response.ok) {
      const result = await response.json();
      return result.contact;
    }

    const errorData = await response.json().catch(() => ({}));
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
  }

  // Ejecutar estrategia create-first con retry
  return await retryWithBackoff(async (attempt) => {

    // 1. Intentar crear primero
    const createResult = await createContact();

    // Si se creó exitosamente, retornar
    if (createResult.created) {
      return {
        success: true,
        action: 'created',
        contact: createResult.contact
      };
    }

    // 2. Si es duplicado, buscar y actualizar
    if (createResult.duplicate) {
      const existingContact = await findContactByEmail(data.correo);

      if (!existingContact) {
        throw new Error(`[CRM] Contacto reportado como duplicado pero no encontrado: ${data.correo}`);
      }

      // Actualizar el contacto existente
      const updatedContact = await updateContact(existingContact.id);

      return {
        success: true,
        action: 'updated',
        contact: updatedContact
      };
    }

    throw new Error(`[CRM] Resultado inesperado en createOrUpdateContact`);
  }, 3, 1000); // 3 reintentos, 1 segundo inicial
}

/**
 * Actualiza el codigo_auco en todas las carteras de un acuerdo
 * @param {string} nroAcuerdo - Número del acuerdo
 * @param {string} codigoAuco - ID del documento en AUCO
 * @returns {Promise<Object>} Resultado de la actualización
 */
async function actualizarCodigoAuco(nroAcuerdo, codigoAuco) {
  console.log(`[actualizarCodigoAuco] Actualizando acuerdo ${nroAcuerdo} con codigo_auco: ${codigoAuco}`);

  try {
    // 1. Obtener todas las carteras del acuerdo
    const url = `${STRAPI_BASE_URL}/api/carteras?filters[nro_acuerdo][$eq]=${encodeURIComponent(nroAcuerdo)}&pagination[pageSize]=50`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
    });

    const carteras = response.data?.data || [];
    if (carteras.length === 0) {
      console.warn(`[actualizarCodigoAuco] No se encontraron carteras para acuerdo ${nroAcuerdo}`);
      return { success: false, error: 'No se encontraron carteras' };
    }

    // 2. Actualizar cada cartera con el codigo_auco
    let actualizadas = 0;
    for (const cartera of carteras) {
      const documentId = cartera.documentId;
      const updateUrl = `${STRAPI_BASE_URL}/api/carteras/${documentId}`;

      await axios.put(updateUrl, {
        data: { codigo_auco: codigoAuco }
      }, {
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      actualizadas++;
    }

    console.log(`[actualizarCodigoAuco] ${actualizadas} carteras actualizadas con codigo_auco`);
    return { success: true, carterasActualizadas: actualizadas };

  } catch (error) {
    console.error(`[actualizarCodigoAuco] Error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene la suma de valor_neto de facturaciones por mes y año
 * @param {number} year - Año a consultar
 * @param {number} month - Mes a consultar (1-12)
 * @param {number} endDay - Día límite (exclusivo) para consultas parciales. Si es null, trae el mes completo.
 * @returns {Promise<Object>} { total: number, count: number }
 */
async function getFacturacionByMonth(year, month, endDay = null) {
  // Construir rango de fechas para el mes
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

  let endDate;
  if (endDay && endDay > 1) {
    // Consulta parcial: hasta el día indicado (exclusivo)
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  } else {
    // Mes completo
    const endMonth = month === 12 ? 1 : month + 1;
    const endYear = month === 12 ? year + 1 : year;
    endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
  }

  console.log(`[Finanzas] Consultando facturación ${month}/${year}: ${startDate} a ${endDate}${endDay ? ' (parcial)' : ''}`);

  try {
    // Consultar facturaciones del mes con paginación
    // Usar campo 'fecha' (fecha de la facturación)
    let allRecords = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      // Filtrar por fecha y por producto.marca = "Futuros Residentes"
      const url = `${STRAPI_BASE_URL}/api/facturaciones?filters[fecha][$gte]=${startDate}&filters[fecha][$lt]=${endDate}&filters[producto][marca][$eq]=${encodeURIComponent('Futuros Residentes')}&fields[0]=valor_neto&pagination[page]=${page}&pagination[pageSize]=${pageSize}`;

      console.log(`[Finanzas] Query page ${page}: ${url}`);

      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
      });

      const records = response.data?.data || [];
      allRecords = allRecords.concat(records);

      // Debug: mostrar primer registro para verificar estructura
      if (page === 1 && records.length > 0) {
        console.log(`[Finanzas] Estructura registro:`, JSON.stringify(records[0]).substring(0, 200));
      }

      const pagination = response.data?.meta?.pagination;
      hasMore = pagination && page < pagination.pageCount;
      page++;
    }

    // Sumar valor_neto
    let total = 0;
    allRecords.forEach(record => {
      const valorNeto = record.attributes?.valor_neto || record.valor_neto || 0;
      total += Number(valorNeto) || 0;
    });

    console.log(`[Finanzas] ${month}/${year}: ${allRecords.length} registros, total: $${total.toLocaleString('es-CO')}`);

    return {
      year,
      month,
      total,
      count: allRecords.length
    };
  } catch (error) {
    console.error(`[Finanzas] Error consultando ${month}/${year}:`, error.message);
    if (error.response) {
      console.error(`[Finanzas] Response status:`, error.response.status);
      console.error(`[Finanzas] Response data:`, JSON.stringify(error.response.data).substring(0, 500));
    }
    return { year, month, total: 0, count: 0, error: error.message };
  }
}

/**
 * Obtiene la suma de valor_neto de facturaciones para un día específico
 * @param {number} year - Año a consultar
 * @param {number} month - Mes a consultar (1-12)
 * @param {number} day - Día a consultar
 * @returns {Promise<Object>} { total: number, count: number }
 */
async function getFacturacionByDay(year, month, day) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const nextDay = day + 1;
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`;

  console.log(`[Finanzas] Consultando día ${day}/${month}/${year}: ${startDate} a ${endDate}`);

  try {
    const url = `${STRAPI_BASE_URL}/api/facturaciones?filters[fecha][$gte]=${startDate}&filters[fecha][$lt]=${endDate}&filters[producto][marca][$eq]=${encodeURIComponent('Futuros Residentes')}&fields[0]=valor_neto&pagination[pageSize]=100`;

    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
    });

    const records = response.data?.data || [];
    let total = 0;
    records.forEach(record => {
      const valorNeto = record.attributes?.valor_neto || record.valor_neto || 0;
      total += Number(valorNeto) || 0;
    });

    console.log(`[Finanzas] Día ${day}/${month}/${year}: ${records.length} registros, total: $${total.toLocaleString('es-CO')}`);

    return { year, month, day, total, count: records.length };
  } catch (error) {
    console.error(`[Finanzas] Error consultando día ${day}/${month}/${year}:`, error.message);
    return { year, month, day, total: 0, count: 0, error: error.message };
  }
}

/**
 * Obtiene el desglose diario de facturación para un mes
 * @param {number} year - Año
 * @param {number} month - Mes (1-12)
 * @param {number} maxDay - Día máximo a consultar (para meses en curso)
 * @returns {Promise<Array>} Array de {day, total} para cada día
 */
async function getFacturacionDailyBreakdown(year, month, maxDay = 31) {
  const daysInMonth = new Date(year, month, 0).getDate(); // Días del mes
  const lastDay = Math.min(maxDay, daysInMonth);

  console.log(`[Finanzas] Obteniendo desglose diario ${month}/${year} (días 1-${lastDay})`);

  // Consultar todo el rango de una vez y agrupar por día
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;

  // Calcular fecha fin correctamente (primer día del mes siguiente)
  let endDate;
  if (lastDay >= daysInMonth) {
    // Mes completo: usar primer día del mes siguiente
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  } else {
    // Mes parcial: usar día siguiente
    endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay + 1).padStart(2, '0')}`;
  }

  try {
    let allRecords = [];
    let page = 1;
    const pageSize = 100;
    let hasMore = true;

    while (hasMore) {
      const url = `${STRAPI_BASE_URL}/api/facturaciones?filters[fecha][$gte]=${startDate}&filters[fecha][$lt]=${endDate}&filters[producto][marca][$eq]=${encodeURIComponent('Futuros Residentes')}&fields[0]=valor_neto&fields[1]=fecha&pagination[page]=${page}&pagination[pageSize]=${pageSize}`;

      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
      });

      const records = response.data?.data || [];
      allRecords = allRecords.concat(records);

      const pagination = response.data?.meta?.pagination;
      hasMore = pagination && page < pagination.pageCount;
      page++;
    }

    // Agrupar por día
    const dailyTotals = {};
    for (let d = 1; d <= lastDay; d++) {
      dailyTotals[d] = 0;
    }

    allRecords.forEach(record => {
      const fecha = record.attributes?.fecha || record.fecha;
      const valorNeto = record.attributes?.valor_neto || record.valor_neto || 0;
      if (fecha) {
        const day = parseInt(fecha.substring(8, 10), 10);
        if (day >= 1 && day <= lastDay) {
          dailyTotals[day] += Number(valorNeto) || 0;
        }
      }
    });

    // Convertir a array
    const result = [];
    for (let d = 1; d <= lastDay; d++) {
      result.push({ day: d, total: dailyTotals[d] });
    }

    console.log(`[Finanzas] Desglose ${month}/${year}: ${allRecords.length} registros en ${lastDay} días`);
    return result;

  } catch (error) {
    console.error(`[Finanzas] Error obteniendo desglose diario ${month}/${year}:`, error.message);
    return [];
  }
}

/**
 * Compara facturación de enero y febrero entre múltiples años
 * Febrero se calcula parcialmente hasta el día anterior a hoy (para comparación justa)
 * @param {Array<number>} years - Array de años a comparar
 * @returns {Promise<Object>} Datos de comparación
 */
async function getFacturacionComparison(years = [2024, 2025, 2026]) {
  // Obtener fecha actual en Colombia
  const now = new Date();
  const colombiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));
  const currentMonth = colombiaTime.getMonth() + 1; // 1-12
  const currentDay = colombiaTime.getDate();

  console.log(`[Finanzas] Fecha Colombia: ${colombiaTime.toISOString().substring(0, 10)}, día: ${currentDay}`);

  const results = {};

  for (const year of years) {
    // Enero: siempre completo
    results[year] = {
      enero: await getFacturacionByMonth(year, 1),
      enero_daily: await getFacturacionDailyBreakdown(year, 1, 31)
    };

    // Febrero completo (todo el mes)
    results[year].febrero = await getFacturacionByMonth(year, 2);

    // Febrero parcial: incluyendo el día de hoy (para comparar y saber cuánto falta)
    if (currentMonth >= 2) {
      results[year].febrero_parcial = await getFacturacionByMonth(year, 2, currentDay + 1);
      // Febrero hoy: solo el día actual (desde currentDay hasta currentDay+1)
      results[year].febrero_hoy = await getFacturacionByDay(year, 2, currentDay);
      // Desglose diario de febrero (incluyendo hoy)
      results[year].febrero_daily = await getFacturacionDailyBreakdown(year, 2, currentDay);
    } else {
      // Estamos en enero, febrero parcial/hoy no tiene datos aún
      results[year].febrero_parcial = { year, month: 2, total: 0, count: 0 };
      results[year].febrero_hoy = { year, month: 2, total: 0, count: 0 };
      results[year].febrero_daily = [];
    }
  }

  // Incluir metadata sobre la fecha actual
  results._meta = {
    currentMonth,
    currentDay,
    fechaColombia: colombiaTime.toISOString().substring(0, 10)
  };

  return results;
}

/**
 * Obtener resumen de cartera total
 * @returns {Promise<Object>} Resumen con totales y desglose por canal
 */
async function getCarteraResumen() {
  console.log('[getCarteraResumen] Iniciando consulta de carteras...');

  try {
    // Traer todas las carteras con paginación
    let allCarteras = [];
    let page = 1;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
      const url = `${STRAPI_BASE_URL}/api/carteras?pagination[page]=${page}&pagination[pageSize]=${pageSize}&fields[0]=valor_cuota&fields[1]=valor_pagado&fields[2]=estado_pago&fields[3]=acuerdo`;

      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` }
      });

      const data = response.data?.data || [];
      allCarteras = allCarteras.concat(data);

      const pagination = response.data?.meta?.pagination;
      hasMore = pagination && page < pagination.pageCount;
      page++;
    }

    console.log(`[getCarteraResumen] Total carteras obtenidas: ${allCarteras.length}`);

    // Función para calcular resumen de un conjunto de carteras
    function calcularResumen(carteras, nombreGrupo) {
      let carteraTotal = 0;
      let pagada = 0;
      let enMora = 0;

      carteras.forEach(c => {
        const attrs = c.attributes || c;
        const valorCuota = Number(attrs.valor_cuota) || 0;
        const valorPagado = Number(attrs.valor_pagado) || 0;
        const estadoPago = attrs.estado_pago || '';

        carteraTotal += valorCuota;
        pagada += valorPagado;

        if (estadoPago === 'en_mora') {
          enMora += valorCuota;
        }
      });

      const porPagar = carteraTotal - pagada;

      return {
        nombre: nombreGrupo,
        carteraTotal,
        pagada,
        pagadaPct: carteraTotal > 0 ? (pagada / carteraTotal * 100) : 0,
        porPagar,
        porPagarPct: carteraTotal > 0 ? (porPagar / carteraTotal * 100) : 0,
        enMora,
        enMoraPct: carteraTotal > 0 ? (enMora / carteraTotal * 100) : 0,
        registros: carteras.length
      };
    }

    // Separar por canal: Whatsapp vs Auco (todo lo demás)
    const carterasWhatsapp = allCarteras.filter(c => {
      const attrs = c.attributes || c;
      return attrs.acuerdo === 'Whatsapp';
    });

    const carterasAuco = allCarteras.filter(c => {
      const attrs = c.attributes || c;
      return attrs.acuerdo !== 'Whatsapp';
    });

    // Calcular resúmenes
    const resumenTotal = calcularResumen(allCarteras, 'Total');
    const resumenAuco = calcularResumen(carterasAuco, 'Auco');
    const resumenWhatsapp = calcularResumen(carterasWhatsapp, 'Whatsapp');

    console.log(`[getCarteraResumen] Resumen calculado - Total: ${resumenTotal.registros}, Auco: ${resumenAuco.registros}, Whatsapp: ${resumenWhatsapp.registros}`);

    return {
      success: true,
      total: resumenTotal,
      auco: resumenAuco,
      whatsapp: resumenWhatsapp
    };

  } catch (error) {
    console.error('[getCarteraResumen] Error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  getProducts,
  fetchVentas,
  fetchAcuerdos,
  actualizarCuotasOtrosi,
  elaborarOtrosi,
  fetchCrmStrapiOnly,
  fetchCrmStrapiBatch,
  fetchCrmByEmail,
  fetchCrmByCelular,
  updateCelularCRM,
  updateCelularStrapiCarteras,
  updateCelularFR360Links,
  saveConfianzaRecord,
  consultarAcuerdo,
  sincronizarCrmPorNumeroDocumento,
  crearAcuerdo,
  fetchCarteraByAcuerdo,
  getComerciales,
  updateFacturacionComercial,
  updateFacturacion,
  fetchAnticipadosPendientes,
  guardarVentaCorriente,
  createOrUpdateCRMContact,
  actualizarCodigoAuco,
  getFacturacionByMonth,
  getFacturacionComparison,
  getCarteraResumen
};
