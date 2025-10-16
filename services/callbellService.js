const axios = require('axios');

// Callbell API configuration
const CALLBELL_BASE_URL = process.env.CALLBELL_BASE_URL || 'https://api.callbell.eu/v1';
const CALLBELL_TOKEN = process.env.CALLBELL_API_KEY || process.env.CALLBELL_TOKEN;

/**
 * Normalize Colombian phone number to international format
 * @param {string} phoneInput - Phone number input
 * @returns {string|null} Normalized phone number or null
 */
function normalizeColombianPhone(phoneInput) {
  console.log('📞 Normalizando teléfono:', phoneInput);

  if (!phoneInput) {
    console.log('❌ Teléfono vacío');
    return null;
  }

  // Clean the number: remove spaces, dashes, parentheses, plus signs, etc.
  let cleanPhone = phoneInput.toString().replace(/[\s\-\(\)\+]/g, '');
  console.log('📞 Teléfono limpio:', cleanPhone);

  // If starts with 57 and has 12 digits (57 + 10 Colombian digits)
  if (cleanPhone.startsWith('57') && cleanPhone.length === 12) {
    console.log('✅ Teléfono ya tiene formato correcto con 57');
    return cleanPhone;
  }

  // If it's a Colombian number (starts with 3 and has 10 digits)
  if (cleanPhone.startsWith('3') && cleanPhone.length === 10) {
    const normalizedPhone = '57' + cleanPhone;
    console.log('✅ Teléfono colombiano normalizado:', normalizedPhone);
    return normalizedPhone;
  }

  // If doesn't meet any condition, return as is
  console.log('⚠️ Teléfono no reconocido como colombiano:', cleanPhone);
  return cleanPhone;
}

/**
 * Get Callbell contact by phone number
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<Object>} Contact data or error
 */
async function getCallbellContact(phoneNumber) {
  const normalizedPhone = normalizeColombianPhone(phoneNumber);

  if (!normalizedPhone) {
    return {
      success: false,
      error: 'INVALID_PHONE',
      message: 'Número de teléfono inválido'
    };
  }

  const url = `${CALLBELL_BASE_URL}/contacts/phone/${normalizedPhone}`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${CALLBELL_TOKEN}`
      }
    });

    if (response.status === 200) {
      return {
        success: true,
        contact: response.data.contact,
        conversationHref: response.data.contact?.conversationHref
      };
    } else {
      return {
        success: false,
        error: 'CONTACT_NOT_FOUND',
        message: `No se encontró el contacto (HTTP ${response.status})`,
        statusCode: response.status
      };
    }
  } catch (error) {
    console.log('❌ Error getting Callbell contact:', error.message);

    if (error.response) {
      return {
        success: false,
        error: 'CONTACT_NOT_FOUND',
        message: `No se encontró el contacto (HTTP ${error.response.status})`,
        statusCode: error.response.status
      };
    }

    return {
      success: false,
      error: 'CALLBELL_ERROR',
      message: 'Error de conexión con Callbell',
      details: error.toString()
    };
  }
}

/**
 * Send WhatsApp message via Callbell
 * @param {string} phoneNumber - Phone number
 * @param {string} product - Product name
 * @param {string} linkURL - Payment link URL
 * @returns {Promise<Object>} Message result or error
 */
async function sendWhatsAppMessage(phoneNumber, product, linkURL) {
  const normalizedPhone = normalizeColombianPhone(phoneNumber);

  if (!normalizedPhone) {
    return {
      success: false,
      error: 'INVALID_PHONE',
      message: 'Número de teléfono inválido'
    };
  }

  const url = `${CALLBELL_BASE_URL}/messages/send`;
  const payload = {
    to: normalizedPhone,
    from: 'whatsapp',
    type: 'text',
    content: {
      text: 'link'
    },
    template_values: [
      product,
      linkURL
    ],
    template_uuid: '5a748dfd0de3452580a497a12f1dd919',
    optin_contact: true
  };

  console.log('📤 Enviando mensaje WhatsApp a:', normalizedPhone);
  console.log('📤 Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${CALLBELL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 Envío WhatsApp status:', response.status);
    console.log('📡 Envío WhatsApp response:', response.data);

    if (response.status === 200 || response.status === 201) {
      console.log('✅ Mensaje enviado, UUID:', response.data.message?.uuid);

      return {
        success: true,
        messageUuid: response.data.message?.uuid,
        status: response.data.message?.status
      };
    } else {
      console.log('❌ Error enviando mensaje:', response.status);
      return {
        success: false,
        error: 'SEND_FAILED',
        message: `Error enviando mensaje (HTTP ${response.status})`,
        response: response.data
      };
    }
  } catch (error) {
    console.log('❌ Error en envío WhatsApp:', error.message);

    if (error.response) {
      return {
        success: false,
        error: 'SEND_FAILED',
        message: `Error enviando mensaje (HTTP ${error.response.status})`,
        response: error.response.data
      };
    }

    return {
      success: false,
      error: 'WHATSAPP_ERROR',
      message: 'Error de conexión enviando WhatsApp',
      details: error.toString()
    };
  }
}

/**
 * Check WhatsApp message status
 * @param {string} messageUuid - Message UUID
 * @returns {Promise<Object>} Message status or error
 */
async function checkMessageStatus(messageUuid) {
  const url = `${CALLBELL_BASE_URL}/messages/status/${messageUuid}`;

  console.log('🔍 Verificando estado del mensaje:', messageUuid);

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${CALLBELL_TOKEN}`
      }
    });

    console.log('📡 Estado mensaje status:', response.status);
    console.log('📡 Estado mensaje response:', response.data);

    if (response.status === 200) {
      const messageStatus = response.data.message?.status;
      const statusPayload = response.data.message?.messageStatusPayload?.messaging?.value?.statuses;

      let deliveryStatus = null;
      let errorDetails = null;

      if (statusPayload && statusPayload.length > 0) {
        const latestStatus = statusPayload[0];
        deliveryStatus = latestStatus.status;
        errorDetails = latestStatus.errors?.[0]?.error_data?.details;
      }

      console.log('📊 Estado del mensaje:', {
        messageStatus: messageStatus,
        deliveryStatus: deliveryStatus,
        errorDetails: errorDetails
      });

      return {
        success: true,
        messageStatus: messageStatus,
        deliveryStatus: deliveryStatus,
        errorDetails: errorDetails,
        isDelivered: deliveryStatus === 'delivered' || deliveryStatus === 'read'
      };
    } else {
      console.log('❌ Error verificando estado:', response.status);
      return {
        success: false,
        error: 'STATUS_CHECK_FAILED',
        message: `Error verificando estado (HTTP ${response.status})`
      };
    }
  } catch (error) {
    console.log('❌ Error verificando estado:', error.message);

    if (error.response) {
      return {
        success: false,
        error: 'STATUS_CHECK_FAILED',
        message: `Error verificando estado (HTTP ${error.response.status})`
      };
    }

    return {
      success: false,
      error: 'STATUS_ERROR',
      message: 'Error de conexión verificando estado',
      details: error.toString()
    };
  }
}

module.exports = {
  normalizeColombianPhone,
  getCallbellContact,
  sendWhatsAppMessage,
  checkMessageStatus
};
