const axios = require('axios');

// FR360 API configuration
const FR360_BASE_URL = process.env.FR360_BASE_URL;
const FR360_TOKEN = process.env.FR360_BEARER_TOKEN;
const FR360_EPAYCO_TOKEN = process.env.FR360_EPAYCO_TOKEN;

// Validate required environment variables
if (!FR360_BASE_URL || !FR360_TOKEN) {
  console.error('❌ Missing required FR360 environment variables');
  console.error('Required: FR360_BASE_URL, FR360_BEARER_TOKEN');
}

if (!FR360_EPAYCO_TOKEN) {
  console.warn('⚠️ FR360_EPAYCO_TOKEN not set - payment link creation may fail');
}

/**
 * Retry helper with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Initial retry delay in milliseconds
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 5, retryDelay = 2000) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        console.log(`⏱️ Esperando ${retryDelay}ms antes del próximo intento...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw lastError;
}

/**
 * Get citizen data by UID
 * @param {string} uid - Identity document number
 * @returns {Promise<Object>} Citizen data with nombres and apellidos
 */
async function getCitizen(uid) {
  const url = `${FR360_BASE_URL}/api/citizens?uid=${encodeURIComponent(uid)}`;

  return retryWithBackoff(async (attempt) => {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`
      }
    });

    if (response.status === 200) {
      const d = response.data.data || {};
      console.log(`🔍 getCitizen(${uid}) response.data.data:`, JSON.stringify(d, null, 2));
      return {
        nombres: d.givenName || '',
        apellidos: d.familyName || '',
        correo: d.email || d.mail || d.correo || ''
      };
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  });
}

/**
 * Create a payment link via ePayco
 * @param {Object} paymentData - Payment link data
 * @returns {Promise<Object>} Result with link data or error
 */
async function createPaymentLink(paymentData) {
  const baseUrl = `${FR360_BASE_URL}/api/v1/epayco/collection/link/create`;

  // Build URL with query parameters
  const params = [];
  for (const key in paymentData) {
    if (paymentData.hasOwnProperty(key)) {
      const value = encodeURIComponent(paymentData[key]);
      params.push(`${key}=${value}`);
    }
  }

  const fullUrl = baseUrl + '?' + params.join('&');

  console.log('💳 Creando link de pago con datos:', JSON.stringify(paymentData, null, 2));
  console.log('💳 URL completa:', fullUrl);

  return retryWithBackoff(async (attempt) => {
    console.log(`🔄 Creación link intento ${attempt}/5`);

    const response = await axios.post(fullUrl, null, {
      headers: {
        'Authorization': `Bearer ${FR360_EPAYCO_TOKEN || FR360_TOKEN}`
      }
    });

    console.log(`💳 Creación link intento ${attempt}: HTTP ${response.status}`);
    console.log(`💳 Respuesta:`, response.data);

    if (response.status === 200) {
      console.log(`✅ Link creado exitosamente en intento ${attempt}`);
      return {
        success: true,
        data: response.data
      };
    } else {
      throw new Error(`Error al crear el link de pago: HTTP ${response.status}`);
    }
  }, 5, 1000).catch((error) => {
    console.log('❌ Todos los intentos de creación fallaron');
    return {
      success: false,
      error: 'FETCH_ERROR',
      message: 'Error de conexión al crear el link de pago',
      details: error.toString()
    };
  });
}

/**
 * Save payment link to database
 * @param {Object} linkData - Payment link data to save
 * @returns {Promise<Object>} Result object
 */
async function savePaymentLinkToDatabase(linkData) {
  const url = `${FR360_BASE_URL}/api/v1/payment-links`;

  console.log('💾 Guardando link en base de datos:', JSON.stringify(linkData, null, 2));

  return retryWithBackoff(async (attempt) => {
    console.log(`🔄 Guardado BD intento ${attempt}/5`);

    const response = await axios.post(url, linkData, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`📡 Guardado BD intento ${attempt}: HTTP ${response.status}`);
    console.log(`📡 Respuesta:`, response.data);

    if (response.status === 200 || response.status === 201) {
      console.log(`✅ Link guardado exitosamente en intento ${attempt}`);
      return {
        success: true,
        data: response.data
      };
    } else {
      throw new Error(`Error HTTP ${response.status}`);
    }
  }, 5, 1000).catch((error) => {
    console.log(`💥 Guardado BD falló después de 5 intentos`);
    console.log(`🔴 Último error: ${error.message}`);

    // Capturar detalles del error de axios
    if (error.response) {
      console.log(`📡 HTTP Status: ${error.response.status}`);
      console.log(`📡 Response data:`, JSON.stringify(error.response.data, null, 2));
      console.log(`📡 Response headers:`, error.response.headers);
    } else if (error.request) {
      console.log(`📡 No response received`);
      console.log(`📡 Request:`, error.request);
    }

    return {
      success: false,
      error: 'SAVE_FAILED',
      message: 'Error al guardar el link en la base de datos después de múltiples intentos',
      details: error.message,
      responseData: error.response?.data
    };
  });
}

/**
 * Get payment links by identity document
 * @param {string} uid - Identity document number
 * @returns {Promise<Array>} Array of payment links
 */
async function getLinksByIdentityDocument(uid) {
  const url = `${FR360_BASE_URL}/api/v1/payment-links/list?pageSize=100&page=1&identityDocument=${encodeURIComponent(uid)}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`
      }
    });

    if (response.status === 200 && response.data.status === 'success' && Array.isArray(response.data.data)) {
      return response.data.data;
    } else {
      return [];
    }
  } catch (error) {
    console.log('❌ Error getting links by identity document:', error.message);
    return [];
  }
}

/**
 * Process a single payment
 * @param {Object} formData - Payment form data
 * @returns {Promise<Object>} Payment result
 */
async function processSinglePayment(formData) {
  console.log('🚀 Procesando venta de contado');
  console.log('📝 Form data recibido:', JSON.stringify(formData, null, 2));

  try {
    // Validar datos requeridos
    if (!formData.cedula || !formData.nombres || !formData.apellidos || !formData.correo) {
      return {
        success: false,
        message: 'Faltan datos requeridos: cédula, nombres, apellidos o correo'
      };
    }

    // Limpiar y formatear el valor
    const valorLimpio = String(formData.valor || '').replace(/[^0-9]/g, '');
    const valorNumerico = parseInt(valorLimpio, 10);

    if (isNaN(valorNumerico) || valorNumerico <= 0) {
      return {
        success: false,
        message: 'El valor debe ser un número mayor a 0'
      };
    }

    // Calcular fecha de expiración (fechaMax del formulario o +4 días)
    let expirationDate;
    if (formData.fechaMax) {
      expirationDate = formData.fechaMax + ' 23:59:59';
    } else {
      const fourDaysLater = new Date();
      fourDaysLater.setDate(fourDaysLater.getDate() + 4);
      const year = fourDaysLater.getFullYear();
      const month = String(fourDaysLater.getMonth() + 1).padStart(2, '0');
      const day = String(fourDaysLater.getDate()).padStart(2, '0');
      expirationDate = `${year}/${month}/${day} 23:59:59`;
    }

    // Preparar datos para crear el link de pago
    const paymentData = {
      // Datos del cliente
      identityDocument: formData.cedula,
      givenName: formData.nombres,
      familyName: formData.apellidos,
      email: formData.correo,
      phone: formData.celular || '',

      // Datos del producto y pago
      product: formData.producto || 'Producto',
      description: formData.producto || 'Pago Futuros Residentes', // REQUERIDO
      title: 'Futuros Residentes',
      amount: valorNumerico,
      numberOfPayments: formData.cuotas || 1,

      // Parámetros adicionales requeridos por ePayco
      quantity: 1,
      onePayment: true,
      currency: 'COP',
      id: 0,
      typeSell: '2',
      tax: 0,
      expirationDate: expirationDate,

      // Datos administrativos
      commercial: formData.comercial || 'Sistema',
      startType: formData.inicioTipo || 'inmediato',
      startDate: formData.inicioFecha || new Date().toISOString().split('T')[0]
    };

    console.log('💳 Datos preparados para crear link:', JSON.stringify(paymentData, null, 2));

    // Crear link de pago
    const linkResult = await createPaymentLink(paymentData);

    if (!linkResult.success) {
      console.log('❌ Error al crear link de pago:', linkResult);
      return {
        success: false,
        message: linkResult.message || 'Error al crear el link de pago'
      };
    }

    console.log('✅ Link de pago creado exitosamente');

    // Extraer datos de la respuesta anidada
    const responseData = linkResult.data?.data?.data || {};
    const routeLink = responseData.routeLink || '';
    const invoiceNumber = responseData.invoceNumber || '';
    const externalId = responseData.id || '';
    const expiryDate = responseData.expirationDate || '';

    if (!routeLink) {
      console.warn('⚠️ No se pudo extraer routeLink de la respuesta');
      console.warn('📝 Estructura recibida:', JSON.stringify(linkResult, null, 2));
    }

    // Convertir expiryDate a formato ISO 8601
    // De "2025-10-20 23:59:59" a "2025-10-20T23:59:59.000Z"
    let expiryDateISO = expiryDate;
    if (expiryDate && !expiryDate.includes('T')) {
      // Formato esperado: "2025-10-20 23:59:59"
      expiryDateISO = expiryDate.replace(' ', 'T') + '.000Z';
    }

    // Formatear fecha de acceso en formato ISO 8601
    // Si el tipo de inicio es "Con primer pago" (primer-pago), accessDate debe ser null
    // Si es fecha personalizada, usar la fecha del formulario; si es inmediato, usar fecha actual
    let accessDate = null;
    if (formData.inicioTipo === 'primer-pago') {
      accessDate = null;
    } else if (formData.inicioTipo === 'fecha-personalizada' && formData.inicioFecha) {
      // El input type="date" devuelve formato YYYY-MM-DD
      // Convertir a ISO 8601 con hora 00:00:00 en Colombia (05:00:00 UTC)
      const [year, month, day] = formData.inicioFecha.split('-');
      const fechaInicio = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day), 5, 0, 0, 0));
      accessDate = fechaInicio.toISOString();
    } else {
      // Tipo inmediato o cualquier otro: usar fecha actual
      accessDate = new Date().toISOString();
    }

    // Preparar datos para guardar en BD (estructura correcta según backend)
    const linkDataToSave = {
      salesRep: formData.comercial || 'Sistema',
      identityType: 'CC',
      identityDocument: formData.cedula,
      givenName: formData.nombres,
      familyName: formData.apellidos,
      email: formData.correo,
      phone: formData.celular || '',
      product: formData.producto || 'Producto',
      amount: valorNumerico,
      expiryDate: expiryDateISO,
      linkURL: routeLink,
      invoiceId: invoiceNumber.toString(),
      externalId: externalId.toString(),
      agreementId: formData.nroAcuerdo || null,
      service: 'epayco',
      accessDate: accessDate
    };

    // Guardar en base de datos
    const saveResult = await savePaymentLinkToDatabase(linkDataToSave);

    if (!saveResult.success) {
      console.log('⚠️ Link creado pero no se pudo guardar en BD');
      // Aún así retornamos success porque el link fue creado
    }

    return {
      success: true,
      message: 'Link de pago creado exitosamente',
      paymentLink: linkResult
    };

  } catch (error) {
    console.error('❌ Error en processSinglePayment:', error);
    return {
      success: false,
      message: 'Error al procesar la venta: ' + error.message
    };
  }
}

/**
 * Delete a payment link by ID
 * @param {string} linkId - Payment link ID to delete
 * @returns {Promise<Object>} Result object
 */
async function deletePaymentLink(linkId) {
  const url = `${FR360_BASE_URL}/api/v1/payment-links/`;

  console.log(`🗑️ Eliminando link de pago con ID: ${linkId}`);

  try {
    const response = await axios.delete(url, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        id: parseInt(linkId)
      }
    });

    console.log(`✅ Link eliminado: HTTP ${response.status}`);

    if (response.status === 200 || response.status === 204) {
      return {
        success: true,
        message: 'Link de pago eliminado exitosamente'
      };
    } else {
      throw new Error(`Error HTTP ${response.status}`);
    }
  } catch (error) {
    console.log(`❌ Error al eliminar link: ${error.message}`);

    // Capturar detalles del error
    if (error.response) {
      console.log(`📡 HTTP Status: ${error.response.status}`);
      console.log(`📡 Response data:`, JSON.stringify(error.response.data, null, 2));
    }

    return {
      success: false,
      error: 'DELETE_FAILED',
      message: 'Error al eliminar el link de pago',
      details: error.message,
      responseData: error.response?.data
    };
  }
}

/**
 * Resolve payment and update portfolio
 * @param {Object} payload - Payment resolution data
 * @returns {Promise<Object>} Resolution result
 */
async function resolvePagoYActualizarCartera(payload) {
  // Si no hay documentId, no podemos actualizar
  if (!payload || !payload.documentId) {
    return {
      estado_pago: '',
      fecha_de_pago: '',
      valor_pagado: null
    };
  }

  const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
  const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

  if (!STRAPI_BASE_URL || !STRAPI_TOKEN) {
    console.error('❌ Missing Strapi credentials');
    return {
      estado_pago: '',
      fecha_de_pago: '',
      valor_pagado: null
    };
  }

  try {
    // Si el frontend ya envió datos calculados desde Ventas, usar esos
    const estadoCalculado = payload.estado_pago_calculado || '';
    const fechaCalculada = payload.fecha_pago_calculada || '';
    const valorCalculado = payload.valor_pagado_calculado;

    // Si hay datos calculados desde Ventas, actualizar Strapi con esos
    if (estadoCalculado) {
      // Convertir fecha de formato "DD/MM/YYYY" a "YYYY-MM-DD" si es necesario
      let fechaISO = null;
      if (fechaCalculada && fechaCalculada.includes('/')) {
        const partes = fechaCalculada.split('/');
        if (partes.length === 3) {
          fechaISO = `${partes[2]}-${partes[1].padStart(2, '0')}-${partes[0].padStart(2, '0')}`;
        }
      } else {
        fechaISO = fechaCalculada || null;
      }

      const urlUpdate = `${STRAPI_BASE_URL}/api/carteras/${payload.documentId}`;
      const updateData = {
        data: {
          estado_pago: estadoCalculado,
          fecha_de_pago: fechaISO,
          valor_pagado: valorCalculado
        }
      };

      await axios.put(urlUpdate, updateData, {
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      // Retornar los valores actualizados (fecha en formato ISO para que el frontend la formatee)
      return {
        estado_pago: estadoCalculado,
        fecha_de_pago: fechaISO || '',
        valor_pagado: valorCalculado
      };
    }

    // Si no hay datos calculados desde Ventas, verificar si necesita recalcular estado
    // Esto sirve como autocorrección si una cuota fue marcada "en_mora" incorrectamente
    const fechaLimite = payload.fecha_limite || '';
    if (fechaLimite && fechaLimite !== '1970-01-01') {
      // Usar zona horaria de Colombia para calcular "hoy" (comparación por strings YYYY-MM-DD)
      const hoyColombiaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

      // Comparación string: si fecha_limite < hoy → en_mora, si no → al_dia
      const estadoPago = fechaLimite < hoyColombiaStr ? 'en_mora' : 'al_dia';

      console.log(`📅 Recalculando estado: fecha_limite=${fechaLimite}, hoy=${hoyColombiaStr}, estado=${estadoPago}`);

      const urlUpdate = `${STRAPI_BASE_URL}/api/carteras/${payload.documentId}`;
      const updateData = {
        data: {
          estado_pago: estadoPago,
          fecha_de_pago: null,
          valor_pagado: null
        }
      };

      await axios.put(urlUpdate, updateData, {
        headers: {
          'Authorization': `Bearer ${STRAPI_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        estado_pago: estadoPago,
        fecha_de_pago: '',
        valor_pagado: null
      };
    }

    // Si no hay nada que actualizar, retornar vacío
    return {
      estado_pago: '',
      fecha_de_pago: '',
      valor_pagado: null
    };

  } catch (error) {
    // En caso de error, retornar valores vacíos (el frontend lo manejará con ventas)
    return {
      estado_pago: '',
      fecha_de_pago: '',
      valor_pagado: null
    };
  }
}

/**
 * Get a payment link by its URL
 * @param {string} linkURL - The payment link URL
 * @returns {Promise<Object|null>} Link object or null
 */
async function getLinkByURL(linkURL) {
  const url = `${FR360_BASE_URL}/api/v1/payment-links/list?pageSize=1&page=1&linkURL=${encodeURIComponent(linkURL)}`;

  return retryWithBackoff(async (attempt) => {
    console.log(`🔍 getLinkByURL intento ${attempt}/5: ${linkURL}`);
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${FR360_TOKEN}` }
    });

    if (response.status === 200 && response.data?.status === 'success' && response.data.data?.length) {
      return response.data.data[0];
    }
    return null;
  }, 5, 1000).catch(error => {
    console.error(`❌ getLinkByURL falló: ${error.message}`);
    return null;
  });
}

/**
 * Update an ePayco payment link
 * @param {Object} params - { id, amount, expirationDate }
 * @returns {Promise<Object>} { success, invoiceNumber }
 */
async function updateEpaycoLink(params) {
  const baseUrl = `${FR360_BASE_URL}/api/v1/epayco/collection/link/update`;
  const queryParams = {
    id: params.id,
    amount: params.amount,
    currency: 'COP',
    quantity: 1,
    title: 'Futuros Residentes',
    description: params.description || 'Futuros Residentes',
    typeSell: 2,
    expirationDate: params.expirationDate
  };

  const qs = Object.keys(queryParams)
    .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(queryParams[key]))
    .join('&');
  const fullUrl = baseUrl + '?' + qs;

  return retryWithBackoff(async (attempt) => {
    console.log(`🔄 updateEpaycoLink intento ${attempt}/5 - ID: ${params.id}`);
    const response = await axios.put(fullUrl, null, {
      headers: { 'Authorization': `Bearer ${FR360_EPAYCO_TOKEN || FR360_TOKEN}` }
    });

    const json = response.data;
    if (json.success && json.data && json.data.success) {
      const r = json.data.data;
      const invoiceNumber = (r.invoceNumber || r.invoce || '').toString().replace(/\\/g, '/');
      console.log(`✅ Link ${params.id} actualizado. Invoice#: ${invoiceNumber}`);
      return { success: true, invoiceNumber };
    } else {
      throw new Error(`API devolvió error al actualizar link ${params.id}`);
    }
  }, 5, 1000).catch(error => {
    console.error(`❌ updateEpaycoLink falló para ID ${params.id}: ${error.message}`);
    return { success: false };
  });
}

/**
 * Update a payment link in the FR360 database
 * @param {Object} linkObj - Full link object to PUT
 * @returns {Promise<Object>} Result
 */
async function updatePaymentLinkInDB(linkObj) {
  const url = `${FR360_BASE_URL}/api/v1/payment-links`;

  return retryWithBackoff(async (attempt) => {
    console.log(`🔄 updatePaymentLinkInDB intento ${attempt}/5`);
    const response = await axios.put(url, linkObj, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log(`✅ FR360 payment link actualizado`);
      return { success: true };
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
  }, 5, 1000).catch(error => {
    console.error(`❌ updatePaymentLinkInDB falló: ${error.message}`);
    return { success: false, error: error.message };
  });
}

/**
 * Registrar Otrosí - Orchestrator
 * Uploads document to Drive, updates ePayco links, FR360 DB, and Strapi
 * @param {Object} data - { nroAcuerdo, nombres, apellidos, numeroDocumento, cuotas, fileBase64, fileName, fileMimeType }
 * @returns {Promise<Object>} Result
 */
async function registrarOtrosi(data) {
  const { nroAcuerdo, nombres, apellidos, numeroDocumento, productoNombre, cuotas, fileBase64, fileName, fileMimeType, userAccessToken } = data;
  const googleDriveService = require('./googleDriveService');
  const strapiService = require('./strapiService');

  console.log(`📝 === REGISTRAR OTROSÍ: Acuerdo ${nroAcuerdo} ===`);
  const resultados = { drive: null, cuotas: [] };

  // === PASO 1: Subir documento a Google Drive (con token del usuario) ===
  console.log('📝 PASO 1: Subir documento a Google Drive');
  const driveFileName = `${nroAcuerdo} Otrosí ${nombres} ${apellidos} ${numeroDocumento}`;
  const driveResult = await googleDriveService.subirArchivoConUserToken({
    folderId: '1NCS5QlHqIL3sj2DLp0GdYQWhCFrwh7hy',
    fileName: driveFileName,
    mimeType: fileMimeType || 'application/pdf',
    base64Content: fileBase64,
    userAccessToken
  });

  if (!driveResult.success) {
    console.error('❌ Error al subir documento a Drive:', driveResult.error);
    return { success: false, message: 'Error al subir documento a Google Drive: ' + driveResult.error };
  }

  const acuerdoUrl = driveResult.webViewLink;
  console.log(`✅ Documento subido a Drive: ${acuerdoUrl}`);
  resultados.drive = acuerdoUrl;

  // === PASO 2: Actualizar links de ePayco, FR360 DB y Strapi por cada cuota ===
  for (const cuota of cuotas) {
    console.log(`📝 PASO 2: Procesando cuota ${cuota.cuotaNro}`);
    const cuotaResult = { cuotaNro: cuota.cuotaNro, normal: false, mora: false, fr360Normal: false, fr360Mora: false, strapi: false };

    // Formatear fechas
    const fechaLimiteStr = cuota.fechaLimite; // YYYY-MM-DD

    // Expiración normal: fechaLimite + 5 días
    const fechaNormal = new Date(fechaLimiteStr + 'T12:00:00');
    fechaNormal.setDate(fechaNormal.getDate() + 5);
    const normalYear = fechaNormal.getFullYear();
    const normalMonth = String(fechaNormal.getMonth() + 1).padStart(2, '0');
    const normalDay = String(fechaNormal.getDate()).padStart(2, '0');
    const expirationDate = `${normalYear}/${normalMonth}/${normalDay} 23:59:59`;

    // Expiración mora: fechaLimite + 95 días
    const fechaMora = new Date(fechaLimiteStr + 'T12:00:00');
    fechaMora.setDate(fechaMora.getDate() + 95);
    const moraYear = fechaMora.getFullYear();
    const moraMonth = String(fechaMora.getMonth() + 1).padStart(2, '0');
    const moraDay = String(fechaMora.getDate()).padStart(2, '0');
    const expirationDateMora = `${moraYear}/${moraMonth}/${moraDay} 23:59:59`;

    // Descripción para ePayco
    const descripcion = (productoNombre || 'Futuros Residentes') + ' - Cuota ' + cuota.cuotaNro;

    const valorNormal = Number(cuota.valorCuota);
    const valorMora = Math.floor(valorNormal * 1.05);

    let invoiceNormal = null;
    let invoiceMora = null;

    // --- 2a. Actualizar link normal en ePayco ---
    if (cuota.linkPago) {
      const linkObj = await getLinkByURL(cuota.linkPago);
      if (linkObj) {
        const externalId = Number(linkObj.externalId);
        const resultNormal = await updateEpaycoLink({ id: externalId, amount: valorNormal, expirationDate, description: descripcion });
        if (resultNormal.success) {
          cuotaResult.normal = true;
          invoiceNormal = resultNormal.invoiceNumber;

          // Actualizar FR360 DB normal
          linkObj.invoiceId = resultNormal.invoiceNumber;
          linkObj.expiryDate = fechaNormal.toISOString();
          linkObj.amount = valorNormal;
          // accessDate se mantiene original (ya está en linkObj)
          const fr360Normal = await updatePaymentLinkInDB(linkObj);
          cuotaResult.fr360Normal = fr360Normal.success;
        }
      } else {
        console.warn(`⚠️ No se encontró link normal para cuota ${cuota.cuotaNro}`);
      }
    }

    // --- 2b. Actualizar link mora en ePayco ---
    if (cuota.linkPagoMora) {
      const linkObjMora = await getLinkByURL(cuota.linkPagoMora);
      if (linkObjMora) {
        const externalIdMora = Number(linkObjMora.externalId);
        const resultMora = await updateEpaycoLink({ id: externalIdMora, amount: valorMora, expirationDate: expirationDateMora, description: descripcion });
        if (resultMora.success) {
          cuotaResult.mora = true;
          invoiceMora = resultMora.invoiceNumber;

          // Actualizar FR360 DB mora
          linkObjMora.invoiceId = resultMora.invoiceNumber;
          linkObjMora.expiryDate = fechaMora.toISOString();
          linkObjMora.amount = valorMora;
          const fr360Mora = await updatePaymentLinkInDB(linkObjMora);
          cuotaResult.fr360Mora = fr360Mora.success;
        }
      } else {
        console.warn(`⚠️ No se encontró link mora para cuota ${cuota.cuotaNro}`);
      }
    }

    // --- 2c. Actualizar Strapi cartera ---
    if (cuota.documentId) {
      const strapiResult = await strapiService.actualizarCarteraOtrosi(cuota.documentId, {
        valor_cuota: valorNormal,
        fecha_limite: fechaLimiteStr,
        acuerdo: acuerdoUrl,
        id_pago: invoiceNormal ? String(invoiceNormal) : null,
        id_pago_mora: invoiceMora ? String(invoiceMora) : null
      });
      cuotaResult.strapi = strapiResult.success;
    }

    resultados.cuotas.push(cuotaResult);
  }

  console.log('📝 === REGISTRAR OTROSÍ COMPLETADO ===');
  console.log('📝 Resultados:', JSON.stringify(resultados, null, 2));

  return { success: true, message: 'Otrosí registrado exitosamente', resultados };
}

module.exports = {
  getCitizen,
  createPaymentLink,
  savePaymentLinkToDatabase,
  getLinksByIdentityDocument,
  deletePaymentLink,
  processSinglePayment,
  resolvePagoYActualizarCartera,
  registrarOtrosi
};
