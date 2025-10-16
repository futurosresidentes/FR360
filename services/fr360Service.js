const axios = require('axios');

// FR360 API configuration
const FR360_BASE_URL = process.env.FR360_BASE_URL || 'https://fr360-7cwi.onrender.com';
const FR360_TOKEN = process.env.FR360_TOKEN;

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
        'Authorization': `Bearer ${FR360_TOKEN}`
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

    return {
      success: false,
      error: 'SAVE_FAILED',
      message: 'Error al guardar el link en la base de datos después de múltiples intentos',
      details: error.message
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
  console.log('⚠️ processSinglePayment needs full implementation');
  console.log('📝 Form data:', formData);

  // Stub implementation - would need to integrate with payment gateway
  return {
    success: false,
    error: 'processSinglePayment not fully implemented yet - requires payment gateway integration'
  };
}

/**
 * Resolve payment and update portfolio
 * @param {Object} payload - Payment resolution data
 * @returns {Promise<Object>} Resolution result
 */
async function resolvePagoYActualizarCartera(payload) {
  console.log('⚠️ resolvePagoYActualizarCartera needs full implementation');
  console.log('📝 Payload:', payload);

  // Stub implementation - would need to integrate with payment and portfolio systems
  return {
    success: false,
    error: 'resolvePagoYActualizarCartera not fully implemented yet - requires payment resolution logic'
  };
}

module.exports = {
  getCitizen,
  createPaymentLink,
  savePaymentLinkToDatabase,
  getLinksByIdentityDocument,
  processSinglePayment,
  resolvePagoYActualizarCartera
};
