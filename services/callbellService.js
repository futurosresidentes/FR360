const axios = require('axios');

// Callbell API configuration
const CALLBELL_BASE_URL = process.env.CALLBELL_BASE_URL;
const CALLBELL_TOKEN = process.env.CALLBELL_API_KEY;
const CALLBELL_TEMPLATE_UUID = process.env.CALLBELL_TEMPLATE_UUID;

// Validate required environment variables
if (!CALLBELL_BASE_URL || !CALLBELL_TOKEN || !CALLBELL_TEMPLATE_UUID) {
  console.error('❌ Missing required Callbell environment variables');
  console.error('Required: CALLBELL_BASE_URL, CALLBELL_API_KEY, CALLBELL_TEMPLATE_UUID');
}

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
    template_uuid: CALLBELL_TEMPLATE_UUID,
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

/**
 * Send acuerdo (agreement) notification via Callbell WhatsApp
 * Template values: [correo, primeraCuota, primeraFecha, primerLink]
 * @param {string} phoneNumber - Phone number
 * @param {string} correo - Email
 * @param {number} primeraCuota - First payment amount
 * @param {string} primeraFecha - First payment date (dd/mm/yyyy)
 * @param {string} primerLink - First payment link URL
 * @returns {Promise<Object>} Message result
 */
async function sendAcuerdoNotification(phoneNumber, correo, primeraCuota, primeraFecha, primerLink) {
  const templateUuid = process.env.CALLBELL_ACUERDO_TEMPLATE_UUID;
  if (!templateUuid) {
    console.error('❌ CALLBELL_ACUERDO_TEMPLATE_UUID no configurada');
    return { success: false, error: 'MISSING_CONFIG', message: 'Template UUID de acuerdos no configurado' };
  }

  const normalizedPhone = normalizeColombianPhone(phoneNumber);
  if (!normalizedPhone) {
    return { success: false, error: 'INVALID_PHONE', message: 'Número de teléfono inválido' };
  }

  // Formatear cuota con puntos de miles (ej: 1.250.000)
  const cuotaFormateada = Number(primeraCuota).toLocaleString('en-US').replace(/,/g, '.');

  const url = `${CALLBELL_BASE_URL}/messages/send`;
  const payload = {
    to: normalizedPhone,
    from: 'whatsapp',
    type: 'text',
    content: { text: 'Pago' },
    template_values: [correo, cuotaFormateada, primeraFecha, primerLink],
    template_uuid: templateUuid,
    optin_contact: true
  };

  console.log('📤 [Acuerdo] Enviando notificación Callbell a:', normalizedPhone);

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${CALLBELL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ [Acuerdo] Notificación Callbell enviada:', response.data.message?.uuid);
      return { success: true, messageUuid: response.data.message?.uuid };
    }
    console.error('❌ [Acuerdo] Callbell status inesperado:', response.status);
    return { success: false, error: 'UNEXPECTED_STATUS', message: `HTTP ${response.status}` };
  } catch (error) {
    console.error('❌ [Acuerdo] Error Callbell:', error.response?.data || error.message);
    return { success: false, error: 'SEND_FAILED', message: error.response?.data?.message || error.message };
  }
}

/**
 * Envía un mensaje de texto plano por el canal exclusivo de FR Mastery
 * @param {string} phoneNumber - Número de teléfono
 * @param {string} message - Texto del mensaje
 * @returns {Promise<Object>} Resultado
 */
async function sendFRMasteryMessage(phoneNumber, message) {
  const channelId = process.env.CALLBELL_CHANNEL_ID;
  if (!channelId) {
    console.error('❌ CALLBELL_CHANNEL_ID no configurado');
    return { success: false, error: 'MISSING_CONFIG', message: 'Channel ID de FR Mastery no configurado' };
  }

  const normalizedPhone = normalizeColombianPhone(phoneNumber);
  if (!normalizedPhone) {
    return { success: false, error: 'INVALID_PHONE', message: 'Número de teléfono inválido' };
  }

  const url = `${CALLBELL_BASE_URL}/messages/send`;
  const payload = {
    to: normalizedPhone,
    from: 'whatsapp',
    type: 'text',
    content: { text: message },
    channel_uuid: channelId,
    optin_contact: true
  };

  console.log('📤 [FRMastery] Enviando mensaje WhatsApp a:', normalizedPhone);

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${CALLBELL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ [FRMastery] Mensaje enviado, UUID:', response.data.message?.uuid);
      return { success: true, messageUuid: response.data.message?.uuid };
    }

    console.error('❌ [FRMastery] Callbell status inesperado:', response.status);
    return { success: false, error: 'SEND_FAILED', message: `HTTP ${response.status}` };
  } catch (error) {
    console.error('❌ [FRMastery] Error Callbell:', error.response?.data || error.message);
    return { success: false, error: 'SEND_FAILED', message: error.response?.data?.message || error.message };
  }
}

/**
 * Envía notificación del contrato FR Mastery al cliente
 * @param {string} phone - Número de teléfono
 * @param {string} email - Correo del cliente
 * @returns {Promise<Object>}
 */
async function sendFRMasteryDocNotification(phone, email) {
  const texto =
`Te acabo de enviar un correo electrónico a ${email} con nuestro contrato. Por fa léelo y fírmalo; el proceso es muy fácil e intuitivo, sin descargar ni imprimir, el mismo documento te permite firmar. 📨 Si no ves el mensaje en tu bandeja de entrada, ve a Spam, a veces llega a esa bandeja.`;
  return sendFRMasteryMessage(phone, texto);
}

/**
 * Envía el link de pago de FR Mastery (pago de contado)
 * @param {string} phone - Número de teléfono
 * @param {number} nCuotas - Número de cuotas
 * @param {number} vCuota - Valor de la cuota en USD
 * @param {string} lkCuotas - Link de pago
 * @returns {Promise<Object>}
 */
async function sendFRMasteryPaymentLink(phone, nCuotas, vCuota, lkCuotas) {
  const texto =
`Luego de que revises y firmes nuestro contrato, podrás realizar tus pagos a través del siguiente link:

*(${nCuotas}) Cuota(s):* Valor: USD $${vCuota}
${lkCuotas}

Cualquier duda me cuentas. ☺️`;
  return sendFRMasteryMessage(phone, texto);
}

/**
 * Envía notificación de descuento vía Callbell WhatsApp
 * Template: 83020438c5d34f44887135b644b3e686
 * Values: [nombre, producto, fechaLimite, porcentaje, saldoActual, valorDescuento, textoExtra, linkPago]
 */
async function sendDescuentoNotification(phoneNumber, data) {
  const DESCUENTO_TEMPLATE_UUID = '6f4aef636e4543e4b916de1821aefb92';

  const normalizedPhone = normalizeColombianPhone(phoneNumber);
  if (!normalizedPhone) {
    return { success: false, error: 'INVALID_PHONE', message: 'Número de teléfono inválido' };
  }

  // Formatear valores con $ y separador de miles con punto
  const formatPesos = (n) => '$' + Number(n || 0).toLocaleString('en-US').replace(/,/g, '.');

  // Campo 7: texto variable según días extras
  let textoExtra = '👇🏼';
  if (data.diasExtras && data.diasExtras > 0) {
    textoExtra = `Además, te repondremos ${data.diasExtras} días de acceso a la plataforma para que puedas aprovechar al máximo tu preparación. 🚀`;
  }

  const templateValues = [
    data.primerNombre || '',           // 1. Primer nombre
    data.producto || '',               // 2. Nombre del producto
    data.fechaLimite || '31 de marzo del 2026', // 3. Fecha límite
    data.porcentaje || '20%',          // 4. Porcentaje descuento
    formatPesos(data.saldoActual),     // 5. Saldo actual
    formatPesos(data.valorDescuento),  // 6. Valor con descuento
    textoExtra,                        // 7. Texto días extras o emoji
    data.linkPago || ''                // 8. Link de pago
  ];

  const url = `${CALLBELL_BASE_URL}/messages/send`;
  const payload = {
    to: normalizedPhone,
    from: 'whatsapp',
    type: 'text',
    content: { text: 'Descuento' },
    template_values: templateValues,
    template_uuid: DESCUENTO_TEMPLATE_UUID,
    optin_contact: true
  };

  console.log('📤 [Descuento] Enviando notificación Callbell a:', normalizedPhone);

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${CALLBELL_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200 || response.status === 201) {
      console.log('✅ [Descuento] Notificación enviada:', response.data.message?.uuid);
      return { success: true, messageUuid: response.data.message?.uuid };
    }
    console.error('❌ [Descuento] Callbell status inesperado:', response.status);
    return { success: false, error: 'UNEXPECTED_STATUS', message: `Status: ${response.status}` };
  } catch (error) {
    console.error('❌ [Descuento] Error enviando Callbell:', error.response?.data || error.message);
    return { success: false, error: 'SEND_ERROR', message: error.response?.data?.message || error.message };
  }
}

module.exports = {
  normalizeColombianPhone,
  getCallbellContact,
  sendWhatsAppMessage,
  checkMessageStatus,
  sendAcuerdoNotification,
  sendFRMasteryMessage,
  sendFRMasteryDocNotification,
  sendFRMasteryPaymentLink,
  sendDescuentoNotification
};
