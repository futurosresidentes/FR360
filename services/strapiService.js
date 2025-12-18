const axios = require('axios');

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
        const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`⏱️ Esperando ${delay}ms antes del próximo intento...`);
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
      console.log('🔍 Consultando descripción para producto:', productName);
      if (raw.length === 0) {
        console.log('❌ No se encontró el producto');
        return null;
      }
      const product = raw[0].attributes || raw[0];
      const description = product.sub_categoria || product.nombre;
      console.log('✅ Descripción encontrada:', description);
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
 * Fetch CRM record from Strapi by identity document
 * @param {string} uid - Identity document number
 * @returns {Promise<Object|null>} CRM record or null
 */
async function fetchCrmStrapiOnly(uid) {
  const url = `${STRAPI_BASE_URL}/api/crms?filters[numero_documento][$eq]=${uid}`;

  return retryWithBackoff(async (attempt) => {
    console.log(`🔄 CRM Strapi intento ${attempt}/5 para UID: ${uid}`);

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    console.log(`📡 CRM Strapi respuesta intento ${attempt}: HTTP ${response.status}`);

    if (response.status === 200) {
      console.log(`✅ CRM Strapi exitoso en intento ${attempt}`);

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

  console.log(`📝 URL construida (primeros 200 chars): ${url.substring(0, 200)}...`);

  try {
    return await retryWithBackoff(async (attempt) => {
      console.log(`🔄 CRM Strapi BATCH intento ${attempt}/5 para ${uids.length} cédulas`);

      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`
        }
      });

      console.log(`📡 CRM Strapi BATCH respuesta intento ${attempt}: HTTP ${response.status}`);

      if (response.status === 200) {
        console.log(`✅ CRM Strapi BATCH exitoso en intento ${attempt}`);

        const list = Array.isArray(response.data.data) ? response.data.data : [];
        console.log(`📊 CRM Strapi BATCH encontró ${list.length} registros de ${uids.length} solicitados`);

        const result = {};
        list.forEach(record => {
          console.log(`🔍 record:`, JSON.stringify(record, null, 2));
          const att = record.attributes || record;
          console.log(`🔍 att:`, JSON.stringify(att, null, 2));
          const numDoc = String(att.numero_documento || '').trim();
          if (numDoc) {
            result[numDoc] = {
              correo: att.correo || '',
              celular: att.celular || '',
              nombres: att.nombres || '',
              apellidos: att.apellidos || '',
              numero_documento: numDoc
            };
            console.log(`✅ Agregado a result[${numDoc}]:`, result[numDoc]);
          }
        });

        return result;
      } else {
        throw new Error(`Strapi GET BATCH falló (HTTP ${response.status})`);
      }
    });
  } catch (error) {
    console.log(`💥 CRM Strapi BATCH falló después de 5 intentos`);
    console.log(`🔴 Último error: ${error.message}`);
    console.log(`⚠️ Retornando objeto vacío para permitir continuar el proceso`);
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

  const q = String(email).trim().toLowerCase();
  const url = `${STRAPI_BASE_URL}/api/crms?filters[correo][$eq]=${encodeURIComponent(q)}&pagination[pageSize]=1`;

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

  console.log(`🔍 Buscando CRM por celular: ${normalized}`);

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
    if (!row) {
      console.log(`❌ No se encontró CRM con celular: ${normalized}`);
      return null;
    }

    const a = row.attributes || row;
    const uid = String(a.numero_documento || a.identityDocument || '').replace(/\D/g, '');

    console.log(`✅ CRM encontrado por celular. Documento: ${uid}`);

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
    console.log(`📞 Actualizando celular en CRM para correo: ${correo}`);

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
    console.log('✅ Celular actualizado en CRM correctamente');
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
    console.log(`📞 Actualizando celular en Strapi Carteras para cédula: ${cedula}`);

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
      console.log('⚠️ No se encontraron carteras para actualizar');
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
    console.log(`✅ Celular actualizado en ${carterasData.data.length} carteras de Strapi`);
    return { updated: carterasData.data.length };
  } catch (error) {
    console.error('❌ Error actualizando celular en Strapi Carteras:', error.message);
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
    console.log(`📞 Actualizando celular en FR360 Links para cédula: ${cedula}`);

    // 1. Obtener links del usuario usando axios (igual que getLinksByIdentityDocument)
    const linksUrl = `${FR360_BASE_URL}/api/v1/payment-links/list?pageSize=100&page=1&identityDocument=${encodeURIComponent(cedula)}`;
    const linksResponse = await axios.get(linksUrl, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`
      }
    });

    if (linksResponse.status !== 200 || linksResponse.data.status !== 'success' || !Array.isArray(linksResponse.data.data)) {
      console.log('⚠️ No se encontraron links para actualizar');
      return { updated: 0 };
    }

    const linksData = linksResponse.data.data;

    if (linksData.length === 0) {
      console.log('⚠️ No se encontraron links para actualizar');
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
    console.log(`✅ Celular actualizado en ${linksData.length} links de FR360`);
    return { updated: linksData.length };
  } catch (error) {
    console.error('❌ Error actualizando celular en FR360 Links:', error.message);
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

  console.log('📝 Guardando registro de confianza en Strapi:', data);

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

    console.log('📤 Payload para Strapi:', JSON.stringify(payload, null, 2));

    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Registro guardado exitosamente en Strapi:', response.status);
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
    console.log('Consultando acuerdo:', nroAcuerdo);

    const url = `${STRAPI_BASE_URL}/api/carteras?populate=*&filters[nro_acuerdo][$eq]=${encodeURIComponent(nroAcuerdo)}`;

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

    console.log('Respuesta de la API:', response.data);

    if (!response.data.data || response.data.data.length === 0) {
      console.log('No se encontró el acuerdo');
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'No se encontró ningún acuerdo con ese número'
      };
    }

    const acuerdo = response.data.data[0];
    const attributes = acuerdo.attributes || acuerdo;

    const resultado = {
      success: true,
      data: {
        numero_documento: attributes.numero_documento || '',
        producto: attributes.producto?.data?.attributes?.nombre || attributes.producto?.nombre || '',
        comercial: attributes.comercial?.data?.attributes?.nombre || attributes.comercial?.nombre || '',
        fechaInicio: attributes.inicio_plataforma || '',
        estado: attributes.estado_firma || '',
        correo: attributes.correo || '',
        celular: attributes.celular || ''
      }
    };

    console.log('Acuerdo encontrado:', resultado.data);
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
 * Crear acuerdo (agreement)
 * @param {...any} args - Agreement creation arguments
 * @returns {Promise<Object>} Created agreement
 */
async function crearAcuerdo(...args) {
  console.log('⚠️ crearAcuerdo needs full implementation');
  console.log('📝 Args received:', args);

  throw new Error('crearAcuerdo not fully implemented yet - requires Strapi POST integration');
}

/**
 * Fetch UDEA 2026 facturaciones from Strapi
 * @returns {Promise<Array>} Array of facturaciones
 */
async function fetchUdea2026Facturaciones() {
  const url = `${STRAPI_BASE_URL}/api/facturaciones?populate=*&filters[producto][nombre][$startsWith]=Curso Intensivo UDEA 2026&filters[fecha][$gte]=2025-10-22&pagination[pageSize]=10000`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      throw new Error(`Error al obtener facturaciones UDEA 2026: HTTP ${response.status}`);
    }

    const arr = Array.isArray(response.data.data) ? response.data.data : [];
    return arr.map(it => it.attributes ? ({ id: it.id, documentId: it.documentId, ...it.attributes }) : it);
  } catch (error) {
    console.log('❌ Error fetching UDEA 2026 facturaciones:', error.message);
    throw error;
  }
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
    console.log('📋 Fetching comerciales from Strapi...');
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

    console.log(`✅ Fetched ${comerciales.length} comerciales`);
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
    console.log(`📝 Updating facturacion ${documentId} with comercial ${comercialId}...`);

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
      console.log('✅ Facturacion updated successfully');
      return {
        success: true,
        data: response.data
      };
    } else {
      console.error('❌ Unexpected response status:', response.status);
      return {
        success: false,
        error: `Unexpected status: ${response.status}`
      };
    }

  } catch (error) {
    console.error('❌ Error updating facturacion:', error.message);

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
    console.log(`📝 Updating facturacion ${documentId} with data:`, data);

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

    console.log('📤 Sending payload to Strapi:', JSON.stringify(payload, null, 2));

    const response = await axios.put(url, payload, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log('✅ Facturacion updated successfully');
      return {
        success: true,
        data: response.data
      };
    } else {
      console.error('❌ Unexpected response status:', response.status);
      return {
        success: false,
        error: `Unexpected status: ${response.status}`
      };
    }

  } catch (error) {
    console.error('❌ Error updating facturacion:', error.message);

    if (error.response) {
      console.error('Response data:', error.response.data);
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

module.exports = {
  getProducts,
  fetchVentas,
  fetchAcuerdos,
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
  fetchUdea2026Facturaciones,
  fetchCarteraByAcuerdo,
  getComerciales,
  updateFacturacionComercial,
  updateFacturacion
};
