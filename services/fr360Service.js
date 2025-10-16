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
      return {
        nombres: d.givenName || '',
        apellidos: d.familyName || ''
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
    const now = new Date();
    const accessDate = formData.inicioTipo === 'primer-pago' ? null : now.toISOString();

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
      agreementId: null,
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

    // Si no hay datos calculados, calcular basándose solo en la fecha límite
    const fechaLimite = payload.fecha_limite || '';
    if (fechaLimite && fechaLimite !== '1970-01-01') {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const limite = new Date(fechaLimite + 'T00:00:00');
      const estadoPago = limite < hoy ? 'en_mora' : 'al_dia';

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

module.exports = {
  getCitizen,
  createPaymentLink,
  savePaymentLinkToDatabase,
  getLinksByIdentityDocument,
  processSinglePayment,
  resolvePagoYActualizarCartera
};
