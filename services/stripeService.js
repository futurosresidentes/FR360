/**
 * Stripe Service - FR Mastery Payment Links
 *
 * Flujo:
 * 1. Crear precio dinámico en Stripe para el producto FR Mastery
 * 2. Crear Payment Link de un solo uso
 * 3. Guardar en FR360 DB (mismo endpoint que ePayco)
 * 4. Cron diario desactiva links expirados no usados
 */

const Stripe = require('stripe');
const axios = require('axios');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const STRIPE_PRODUCT_ID = process.env.STRIPE_PRODUCT_ID;
const FR360_BASE_URL = process.env.FR360_BASE_URL;
const FR360_TOKEN = process.env.FR360_BEARER_TOKEN;

/**
 * Crea un precio dinámico y un Payment Link de un solo uso en Stripe
 * @param {Object} data
 * @param {number} data.amount - Valor en USD (ej: 2000)
 * @param {string} data.customerName - Nombre completo del cliente
 * @param {string} data.identityDocument - Cédula
 * @param {string} data.email - Correo
 * @param {string} data.phone - Celular
 * @param {string} data.comercial - Nombre del comercial
 * @returns {Promise<{paymentLinkId, url}>}
 */
async function createStripePaymentLink(data) {
  console.log('[Stripe] Creando link para:', data.customerName, '- USD', data.amount);

  // 1. Crear precio dinámico (amount en centavos)
  const amountCents = Math.round(data.amount * 100);
  const price = await stripe.prices.create({
    product: STRIPE_PRODUCT_ID,
    unit_amount: amountCents,
    currency: 'usd'
  });

  console.log('[Stripe] Precio creado:', price.id, '- USD', data.amount);

  // 2. Crear Payment Link de un solo uso
  const paymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    restrictions: {
      completed_sessions: { limit: 1 }
    },
    after_completion: {
      type: 'hosted_confirmation',
      hosted_confirmation: {
        custom_message: '¡Gracias por tu pago! Bienvenido a FR Mastery. Pronto recibirás acceso a la plataforma.'
      }
    },
    metadata: {
      customer_name: data.customerName,
      identity_document: data.identityDocument,
      email: data.email,
      phone: data.phone || '',
      comercial: data.comercial || 'Sistema'
    }
  });

  console.log('[Stripe] ✅ Payment Link creado:', paymentLink.id, paymentLink.url);

  return {
    paymentLinkId: paymentLink.id,
    url: paymentLink.url,
    active: paymentLink.active
  };
}

/**
 * Desactiva un Payment Link en Stripe (para links expirados)
 * @param {string} paymentLinkId
 * @returns {Promise<{success, error?}>}
 */
async function deactivateStripePaymentLink(paymentLinkId) {
  try {
    await stripe.paymentLinks.update(paymentLinkId, { active: false });
    console.log('[Stripe] ✅ Link desactivado:', paymentLinkId);
    return { success: true };
  } catch (error) {
    console.error('[Stripe] ❌ Error desactivando link:', paymentLinkId, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Guarda el link de Stripe en FR360 DB (misma estructura que ePayco)
 * @param {Object} linkData
 * @returns {Promise<{success, data?}>}
 */
async function saveStripePaymentLink(linkData) {
  const url = `${FR360_BASE_URL}/api/v1/payment-links`;

  console.log('[Stripe] Guardando link en BD:', linkData.identityDocument);

  try {
    const response = await axios.post(url, linkData, {
      headers: {
        'Authorization': `Bearer ${FR360_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    if (response.status === 200 || response.status === 201) {
      console.log('[Stripe] ✅ Link guardado en BD');
      return { success: true, data: response.data };
    }
    throw new Error(`HTTP ${response.status}`);
  } catch (error) {
    console.error('[Stripe] ❌ Error guardando en BD:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Obtiene los links de Stripe (FR Mastery) expirados y no pagados desde FR360 DB
 * @returns {Promise<Array>} Lista de links a desactivar
 */
async function getFRMasteryExpiredLinks() {
  const PAGE_SIZE = 500;
  const now = new Date();
  const expiredLinks = [];
  let page = 1;
  let hasMore = true;

  try {
    while (hasMore) {
      const url = `${FR360_BASE_URL}/api/v1/payment-links/list?pageSize=${PAGE_SIZE}&page=${page}`;
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${FR360_TOKEN}` }
      });

      if (response.status !== 200 || !Array.isArray(response.data.data)) break;

      const links = response.data.data;
      console.log(`[Stripe] Página ${page}: ${links.length} links`);

      for (const link of links) {
        if (link.service !== 'stripe') continue;
        if (!link.expiryDate) continue;
        if (link.status === 'paid') continue;
        if (new Date(link.expiryDate) < now) {
          console.log(`[Stripe] Link expirado: ${link.externalId}, expiryDate: ${link.expiryDate}`);
          expiredLinks.push(link);
        }
      }

      hasMore = links.length === PAGE_SIZE;
      page++;
    }

    console.log(`[Stripe] Total links expirados encontrados: ${expiredLinks.length}`);
    return expiredLinks;
  } catch (error) {
    console.error('[Stripe] ❌ Error obteniendo links expirados:', error.message);
    return [];
  }
}

/**
 * Proceso completo: crea link Stripe + guarda en BD
 * @param {Object} formData - Datos del formulario del Comercialito
 * @returns {Promise<Object>} Resultado con url y datos del cliente
 */
async function processFRMasteryPayment(formData) {
  console.log('[FRMastery] 🚀 Procesando pago Stripe');
  console.log('[FRMastery] FormData:', JSON.stringify(formData, null, 2));

  // Validar datos requeridos
  if (!formData.cedula || !formData.nombres || !formData.apellidos || !formData.correo) {
    return { success: false, message: 'Faltan datos requeridos: cédula, nombres, apellidos o correo' };
  }

  // Valor en USD (puede contener coma o punto)
  const valorNumerico = parseFloat(
    String(formData.valor || '').replace(/[^0-9.]/g, '')
  );
  if (isNaN(valorNumerico) || valorNumerico <= 0) {
    return { success: false, message: 'El valor debe ser un número mayor a 0' };
  }

  // Fecha de expiración
  let expiryDateISO;
  if (formData.fechaMax) {
    expiryDateISO = new Date(formData.fechaMax + 'T23:59:59').toISOString();
  } else {
    const d = new Date();
    d.setDate(d.getDate() + 4);
    expiryDateISO = d.toISOString();
  }

  try {
    // 1. Crear link en Stripe
    const stripeResult = await createStripePaymentLink({
      amount: valorNumerico,
      customerName: `${formData.nombres} ${formData.apellidos}`.trim(),
      identityDocument: formData.cedula,
      email: formData.correo,
      phone: formData.celular || '',
      comercial: formData.comercial || 'Sistema'
    });

    // 2. Guardar en FR360 DB (no bloquear si falla)
    await saveStripePaymentLink({
      salesRep: formData.comercial || 'Sistema',
      identityType: 'CC',
      identityDocument: formData.cedula,
      givenName: formData.nombres,
      familyName: formData.apellidos,
      email: formData.correo,
      phone: formData.celular || '',
      product: 'FR Mastery',
      amount: valorNumerico,
      expiryDate: expiryDateISO,
      linkURL: stripeResult.url,
      invoiceId: stripeResult.paymentLinkId,
      externalId: stripeResult.paymentLinkId,
      agreementId: null,
      service: 'stripe',
      accessDate: new Date().toISOString()
    }).catch(err => {
      console.warn('[FRMastery] ⚠️ Link creado pero error guardando en BD:', err.message);
    });

    return {
      success: true,
      message: 'Link de pago FR Mastery generado exitosamente',
      paymentLink: {
        url: stripeResult.url,
        paymentLinkId: stripeResult.paymentLinkId
      },
      clientData: {
        cedula: formData.cedula,
        nombres: formData.nombres,
        apellidos: formData.apellidos,
        correo: formData.correo,
        celular: formData.celular || '',
        valor: valorNumerico,
        comercial: formData.comercial
      }
    };

  } catch (error) {
    console.error('[FRMastery] ❌ Error procesando pago:', error);
    return { success: false, message: 'Error al procesar el pago FR Mastery: ' + error.message };
  }
}

module.exports = {
  createStripePaymentLink,
  deactivateStripePaymentLink,
  saveStripePaymentLink,
  getFRMasteryExpiredLinks,
  processFRMasteryPayment
};
