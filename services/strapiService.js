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

    console.log('Respuesta de la API - total registros:', response.data?.data?.length);

    if (!response.data.data || response.data.data.length === 0) {
      console.log('No se encontró el acuerdo');
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

    console.log('Acuerdo encontrado con', cuotas.length, 'cuotas');
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
    if (data.producto !== undefined) payload.data.producto = data.producto;

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

/**
 * Fetch students with 2+ pending installments (al_dia or en_mora)
 * Groups by numero_documento and returns aggregated data
 * @returns {Promise<Object>} Object with students array and totals
 */
async function fetchAnticipadosPendientes() {
  // Traer todas las carteras con estado al_dia o en_mora, solo acuerdos firmados
  const url = `${STRAPI_BASE_URL}/api/carteras?filters[$and][0][$or][0][estado_pago][$eq]=al_dia&filters[$and][0][$or][1][estado_pago][$eq]=en_mora&filters[$and][1][estado_firma][$eq]=firmado&pagination[pageSize]=5000&populate=*`;

  try {
    console.log('📊 Consultando carteras pendientes para Anticipados 2026...');

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`
      }
    });

    if (response.status !== 200) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const raw = Array.isArray(response.data.data) ? response.data.data : [];
    console.log(`📋 Total de cuotas pendientes encontradas: ${raw.length}`);

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

    console.log(`✅ Encontrados ${totalEstudiantes} estudiantes con 2+ cuotas pendientes`);
    console.log(`💰 Total adeudado: $${totalAdeudado.toLocaleString('es-CO')}`);
    console.log(`✅ Total al día (sin mora): $${totalAlDia.toLocaleString('es-CO')}`);

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

  console.log('💾 [Strapi] Guardando venta corriente:', JSON.stringify(data, null, 2));

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

    console.log('📤 [Strapi] Payload completo:', JSON.stringify(payload, null, 2));
    console.log('📤 [Strapi] Endpoint:', ENDPOINT);

    const response = await axios.post(ENDPOINT, payload, {
      headers: {
        'Authorization': `Bearer ${STRAPI_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ [Strapi] Venta corriente guardada exitosamente:', response.status);
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

  console.log(`📇 [CRM] Iniciando create-or-update para: ${data.correo}`);

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

    console.log(`📇 [CRM] Intentando crear contacto: ${data.correo}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Api-Token': API_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(contactData)
    });

    const responseData = await response.json().catch(() => ({}));
    console.log(`📇 [CRM] Response status: ${response.status}`);
    console.log(`📇 [CRM] Response data:`, JSON.stringify(responseData, null, 2));

    // Si fue creado exitosamente
    if (response.ok) {
      console.log(`✅ [CRM] Contacto creado exitosamente: ${responseData.contact?.id}`);
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
        console.log(`📇 [CRM] Contacto duplicado detectado: ${data.correo}`);
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

    console.log(`📇 [CRM] Buscando contacto por email: ${email}`);

    const response = await fetch(url, {
      headers: {
        'Api-Token': API_TOKEN
      }
    });

    if (response.ok) {
      const result = await response.json();

      if (result.contacts && result.contacts.length > 0) {
        console.log(`✅ [CRM] Contacto encontrado: ${result.contacts[0].id}`);
        return result.contacts[0];
      } else {
        console.log(`⚠️ [CRM] Contacto no encontrado`);
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

    console.log(`📇 [CRM] Actualizando contacto ${contactId}`);

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
      console.log(`✅ [CRM] Contacto actualizado exitosamente: ${contactId}`);
      return result.contact;
    }

    const errorData = await response.json().catch(() => ({}));
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(errorData)}`);
  }

  // Ejecutar estrategia create-first con retry
  return await retryWithBackoff(async (attempt) => {
    console.log(`📇 [CRM] Intento ${attempt} de create-or-update`);

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
      console.log(`📇 [CRM] Contacto duplicado, buscando para actualizar...`);

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
  fetchCarteraByAcuerdo,
  getComerciales,
  updateFacturacionComercial,
  updateFacturacion,
  fetchAnticipadosPendientes,
  guardarVentaCorriente,
  createOrUpdateCRMContact
};
