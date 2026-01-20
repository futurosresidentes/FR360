// index.js - FR360 Commercial Management Panel
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Importar servicios
const strapiService = require('./services/strapiService');
const fr360Service = require('./services/fr360Service');
const frappService = require('./services/frappService');
const callbellService = require('./services/callbellService');
const oldMembershipService = require('./services/oldMembershipService');
const clickupService = require('./services/clickupService');
const googleDriveService = require('./services/googleDriveService');
const pdfService = require('./services/pdfService');
const cobranzaService = require('./services/cobranzaService');
const cobrancioWebService = require('./services/cobrancioWebService');

// Importar middleware de autenticación
const { ensureAuthenticated, ensureDomain, ensureSpecialUser } = require('./middleware/auth');

// Importar rutas de autenticación
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// --- Middlewares básicos
app.use(morgan('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configurar trust proxy para Render
app.set('trust proxy', 1);

// Configurar sesiones (DEBE ir antes de Passport)
const isProduction = process.env.NODE_ENV === 'production';
app.use(session({
  secret: process.env.SESSION_SECRET || 'fr360-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  proxy: isProduction, // Trust the reverse proxy only in production
  cookie: {
    secure: isProduction, // HTTPS cookies only in production (Render)
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 horas
    sameSite: 'lax'
  }
}));

// Configurar Passport (después de session)
require('./config/passport')(app);

// --- Motor de vistas (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Deshabilitar caché de vistas en desarrollo
if (!isProduction) {
  app.set('view cache', false);
}

// --- Rutas de autenticación (públicas)
app.use('/', authRoutes);

// --- Ruta principal (PROTEGIDA)
app.get('/', ensureAuthenticated, ensureDomain, (req, res) => {
  res.render('home', {
    title: 'FR360 - Panel Comercial',
    userEmail: req.user.email,
    userName: req.user.displayName,
    userPhoto: req.user.photo
  });
});

// --- Ruta CRM (PROTEGIDA)
app.get('/crm', ensureAuthenticated, ensureDomain, (req, res) => {
  res.render('crm', {
    title: 'FR360 - CRM',
    userEmail: req.user.email,
    userName: req.user.displayName,
    userPhoto: req.user.photo
  });
});

// === API ENDPOINTS (TODOS PROTEGIDOS) ===

// ===== WEB PIG PROXY ENDPOINTS (MUST BE BEFORE GENERIC /api/:functionName) =====
// GET recent webhooks
app.get('/api/webpig/webhooks', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    console.log(`[WebPig] Fetching webhooks from: ${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/webhooks/recent`);

    const response = await fetch(`${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/webhooks/recent`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.FACTURADOR_WEBHOOK_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[WebPig] Response status: ${response.status}`);

    const data = await response.json();
    console.log(`[WebPig] Response data:`, JSON.stringify(data).substring(0, 200));

    res.json(data);
  } catch (error) {
    console.error('[WebPig] Error fetching webhooks:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET feature flags
app.get('/api/webpig/feature-flags', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    const response = await fetch(`${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/feature-flags`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.FACTURADOR_FEATURE_FLAGS_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST update feature flag
app.post('/api/webpig/feature-flags/:flagKey', ensureAuthenticated, ensureDomain, async (req, res) => {
  const { flagKey } = req.params;
  const { value } = req.body;

  console.log(`[WebPig] Updating feature flag: ${flagKey} to ${value}`);

  try {
    const url = `${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/feature-flags/${flagKey}`;
    console.log(`[WebPig] PUT to: ${url}`);
    console.log(`[WebPig] Body:`, JSON.stringify({ value }));

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${process.env.FACTURADOR_FEATURE_FLAGS_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    console.log(`[WebPig] Response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WebPig] Error response: ${errorText}`);
      return res.status(response.status).json({ success: false, error: errorText });
    }

    const data = await response.json();
    console.log(`[WebPig] Success:`, data);
    res.json(data);
  } catch (error) {
    console.error('[WebPig] Error updating feature flag:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST retry webhook
app.post('/api/webpig/webhooks/:id/retry', ensureAuthenticated, ensureDomain, async (req, res) => {
  const { id } = req.params;
  const { force_restart = false, max_retries = 3 } = req.body;

  console.log(`[WebPig] Retrying webhook ID: ${id} (force_restart: ${force_restart}, max_retries: ${max_retries})`);

  try {
    const response = await fetch(
      `${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/webhooks/${id}/retry`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.FACTURADOR_WEBHOOK_BEARER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          force_restart,
          max_retries
        })
      }
    );

    console.log(`[WebPig] Retry response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[WebPig] Retry error: ${errorText}`);
      return res.status(response.status).json({ success: false, error: errorText });
    }

    const data = await response.json();
    console.log(`[WebPig] Retry success:`, data);
    res.json(data);
  } catch (error) {
    console.error('[WebPig] Error retrying webhook:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST mark stage as manually completed
app.post('/api/webpig/webhooks/:id/mark-manual-completion', ensureAuthenticated, ensureDomain, async (req, res) => {
  const { id } = req.params;
  const { stage, column } = req.body;
  const markedBy = req.user?.email || 'unknown';

  console.log(`[WebPig] Marking stage ${stage} as manually completed for webhook ID: ${id} by ${markedBy}`);

  try {
    // Insertar un log de success manual en Supabase
    const { data: logData, error: logError } = await supabase
      .from('webhook_logs')
      .insert([
        {
          webhook_id: parseInt(id),
          stage: stage,
          status: 'success',
          details: `Marcado como completado manualmente por ${markedBy}`,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (logError) {
      console.error('[WebPig] Error inserting log:', logError);
      throw logError;
    }

    console.log('[WebPig] Log inserted successfully:', logData);

    // Actualizar el webhook si todos los stages están completos
    const { error: updateError } = await supabase
      .from('webhooks')
      .update({
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) {
      console.error('[WebPig] Error updating webhook:', updateError);
      // No fallar si solo falla la actualización del webhook
    }

    res.json({
      success: true,
      message: `${column} marcado como completado manualmente`,
      log: logData
    });

  } catch (error) {
    console.error('[WebPig] Error marking stage as manually completed:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST update webhook agreement - Cambiar el acuerdo asociado a un webhook
app.post('/api/webpig/webhooks/:id/update-agreement', ensureAuthenticated, ensureDomain, async (req, res) => {
  const { id } = req.params;
  const { newAgreementId } = req.body;
  const userEmail = req.user?.email || '';

  // Solo Daniel puede usar este endpoint
  if (userEmail.toLowerCase() !== 'daniel.cardona@sentiretaller.com') {
    return res.status(403).json({ success: false, error: 'No autorizado para modificar acuerdos' });
  }

  if (!newAgreementId) {
    return res.status(400).json({ success: false, error: 'Debe proporcionar el nuevo número de acuerdo' });
  }

  console.log(`[WebPig] Updating agreement for webhook ${id} to ${newAgreementId} by ${userEmail}`);

  try {
    // Primero obtener el registro actual
    const { data: currentData, error: selectError } = await supabase
      .from('webhook_logs')
      .select('id, response_data')
      .eq('webhook_id', parseInt(id))
      .eq('stage', 'fr360_query')
      .eq('status', 'success')
      .single();

    if (selectError) {
      throw new Error(`No se encontró el log del webhook: ${selectError.message}`);
    }

    if (!currentData) {
      throw new Error('No se encontró el registro de fr360_query para este webhook');
    }

    // Actualizar el response_data con el nuevo acuerdo
    const updatedResponseData = {
      ...currentData.response_data,
      agreementId: newAgreementId,
      nroAcuerdo: newAgreementId
    };

    // Hacer el update
    const { error: updateError } = await supabase
      .from('webhook_logs')
      .update({ response_data: updatedResponseData })
      .eq('id', currentData.id);

    if (updateError) {
      throw new Error(`Error actualizando acuerdo: ${updateError.message}`);
    }

    console.log(`[WebPig] Agreement updated successfully for webhook ${id}`);

    res.json({
      success: true,
      message: `Acuerdo actualizado a ${newAgreementId} para webhook ${id}`,
      webhookId: id,
      newAgreementId
    });

  } catch (error) {
    console.error('[WebPig] Error updating agreement:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST regularize advance payment - Solo para Daniel
app.post('/api/webpig/webhooks/:id/regularize-advance-payment', ensureAuthenticated, ensureDomain, async (req, res) => {
  const { id } = req.params;
  const { dryRun = true, webhookPayload = {} } = req.body; // Por defecto solo preview, no ejecuta
  const userEmail = req.user?.email || '';

  // Solo Daniel puede usar este endpoint
  if (userEmail.toLowerCase() !== 'daniel.cardona@sentiretaller.com') {
    return res.status(403).json({ success: false, error: 'No autorizado para regularizar pagos anticipados' });
  }

  console.log(`[WebPig] Regularizing advance payment for webhook ID: ${id} (dryRun: ${dryRun})`);

  try {
    // 1. Usar datos del webhook pasados desde el frontend
    const payload = webhookPayload;
    const agreementId = payload.agreementId;
    const amount = parseFloat(payload.amount) || 0;
    const fechaPago = payload.fecha || new Date().toISOString().split('T')[0];
    const producto = payload.product || '';

    console.log(`[WebPig] Webhook ${id} payload recibido:`, JSON.stringify(payload, null, 2));
    console.log(`[WebPig] Producto detectado: "${producto}"`);

    // Validar que sea un pago anticipado
    if (!producto.toLowerCase().includes('pago anticipado')) {
      console.log(`[WebPig] Producto "${producto}" no contiene "pago anticipado"`);
      return res.status(400).json({ success: false, error: `Este webhook no es un pago anticipado. Producto: "${producto}"` });
    }

    if (!agreementId) {
      return res.status(400).json({ success: false, error: 'El webhook no tiene agreementId' });
    }

    console.log(`[WebPig] Agreement: ${agreementId}, Amount: ${amount}, Fecha: ${fechaPago}`);

    // 2. Consultar carteras del acuerdo en Strapi
    const carterasUrl = `${process.env.STRAPI_BASE_URL}/api/carteras?filters[nro_acuerdo][$eq]=${agreementId}&populate=*&pagination[pageSize]=100`;
    console.log(`[WebPig] Consultando carteras URL: ${carterasUrl}`);

    const carterasResponse = await fetch(carterasUrl, {
      headers: { 'Authorization': `Bearer ${process.env.STRAPI_TOKEN}` }
    });
    const carterasData = await carterasResponse.json();
    const allCuotas = carterasData.data || [];

    console.log(`[WebPig] Cuotas encontradas: ${allCuotas.length}`);
    if (allCuotas.length > 0) {
      console.log(`[WebPig] Primera cuota estructura:`, JSON.stringify(allCuotas[0], null, 2).substring(0, 500));
      console.log(`[WebPig] Estados de pago:`, allCuotas.map(c => ({ cuota: c.cuota_nro, estado: c.estado_pago })));
    }

    if (allCuotas.length === 0) {
      return res.status(404).json({ success: false, error: `No se encontraron cuotas para el acuerdo ${agreementId}` });
    }

    // 3. Filtrar cuotas pendientes (no pagadas) y ordenar por cuota_nro
    const cuotasPendientes = allCuotas
      .filter(c => c.estado_pago !== 'pagado')
      .sort((a, b) => a.cuota_nro - b.cuota_nro);

    console.log(`[WebPig] Cuotas pendientes después de filtrar: ${cuotasPendientes.length}`);

    if (cuotasPendientes.length === 0) {
      // Buscar otros acuerdos del cliente con cuotas pendientes
      const cedula = allCuotas[0]?.numero_documento || payload.identityDocument;

      if (cedula) {
        console.log(`[WebPig] Buscando otros acuerdos para cédula: ${cedula}`);

        // Buscar todas las carteras del cliente
        const otrosAcuerdosUrl = `${process.env.STRAPI_BASE_URL}/api/carteras?filters[numero_documento][$eq]=${cedula}&filters[estado_pago][$ne]=pagado&populate=*&pagination[pageSize]=200`;
        const otrosAcuerdosResponse = await fetch(otrosAcuerdosUrl, {
          headers: { 'Authorization': `Bearer ${process.env.STRAPI_TOKEN}` }
        });
        const otrosAcuerdosData = await otrosAcuerdosResponse.json();
        const cuotasPendientesOtros = otrosAcuerdosData.data || [];

        if (cuotasPendientesOtros.length > 0) {
          // Agrupar por acuerdo
          const acuerdosDisponibles = new Map();
          cuotasPendientesOtros.forEach(cuota => {
            const nroAcuerdo = cuota.nro_acuerdo;
            if (!nroAcuerdo || nroAcuerdo === agreementId) return; // Excluir el acuerdo actual

            if (!acuerdosDisponibles.has(nroAcuerdo)) {
              acuerdosDisponibles.set(nroAcuerdo, {
                nro_acuerdo: nroAcuerdo,
                producto: cuota.producto?.nombre || cuota.producto || 'Sin producto',
                cuotas_pendientes: 0,
                valor_total_pendiente: 0
              });
            }

            const acuerdo = acuerdosDisponibles.get(nroAcuerdo);
            acuerdo.cuotas_pendientes++;
            acuerdo.valor_total_pendiente += parseFloat(cuota.valor_cuota) || 0;
          });

          const acuerdosSugeridos = Array.from(acuerdosDisponibles.values());

          if (acuerdosSugeridos.length > 0) {
            console.log(`[WebPig] Encontrados ${acuerdosSugeridos.length} acuerdos alternativos con cuotas pendientes`);

            return res.status(400).json({
              success: false,
              error: `No hay cuotas pendientes para regularizar (acuerdo: ${agreementId}, total cuotas: ${allCuotas.length})`,
              hasAlternatives: true,
              cedula,
              acuerdoActual: agreementId,
              acuerdosSugeridos: acuerdosSugeridos.map(a => ({
                ...a,
                valor_total_pendiente: Math.round(a.valor_total_pendiente)
              }))
            });
          }
        }
      }

      return res.status(400).json({ success: false, error: `No hay cuotas pendientes para regularizar (acuerdo: ${agreementId}, total cuotas: ${allCuotas.length})` });
    }

    console.log(`[WebPig] Cuotas pendientes: ${cuotasPendientes.length}`);

    // 4. Calcular distribución del pago
    let restante = amount;
    const cambios = [];

    for (const cuota of cuotasPendientes) {
      const valorCuota = parseFloat(cuota.valor_cuota) || 0;

      let valorPagado, nuevoValorCuota;

      if (restante >= valorCuota) {
        // Cuota completa
        valorPagado = valorCuota;
        nuevoValorCuota = valorCuota;
        restante -= valorCuota;
      } else {
        // Cuota parcial o cero
        valorPagado = restante;
        nuevoValorCuota = restante;
        restante = 0;
      }

      cambios.push({
        documentId: cuota.documentId,
        cuota_nro: cuota.cuota_nro,
        valor_cuota_original: valorCuota,
        valor_cuota_nuevo: nuevoValorCuota,
        valor_pagado: valorPagado,
        estado_pago: 'pagado',
        fecha_de_pago: fechaPago,
        requiereCambioValor: valorCuota !== nuevoValorCuota
      });
    }

    // Resumen para mostrar
    const resumen = {
      webhookId: id,
      agreementId,
      montoPagado: amount,
      fechaPago,
      producto,
      cuotasPendientes: cuotasPendientes.length,
      cambios,
      restanteSinAsignar: restante // Debería ser 0 si todo está bien
    };

    console.log(`[WebPig] Resumen de regularización:`, JSON.stringify(resumen, null, 2));

    // 5. Si es dryRun, solo devolver preview
    if (dryRun) {
      return res.json({
        success: true,
        dryRun: true,
        message: 'Preview de regularización (no se ejecutaron cambios)',
        resumen
      });
    }

    // 6. Ejecutar los PUT en Strapi para cada cuota
    const resultados = [];
    for (const cambio of cambios) {
      const updateUrl = `${process.env.STRAPI_BASE_URL}/api/carteras/${cambio.documentId}`;
      const updatePayload = {
        data: {
          estado_pago: cambio.estado_pago,
          fecha_de_pago: cambio.fecha_de_pago,
          valor_pagado: cambio.valor_pagado,
          valor_cuota: cambio.valor_cuota_nuevo
        }
      };

      console.log(`[WebPig] Actualizando cuota ${cambio.cuota_nro}:`, updatePayload);

      const updateResponse = await fetch(updateUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      });

      const updateResult = await updateResponse.json();
      resultados.push({
        cuota_nro: cambio.cuota_nro,
        success: updateResponse.ok,
        status: updateResponse.status,
        data: updateResult
      });

      if (!updateResponse.ok) {
        console.error(`[WebPig] Error actualizando cuota ${cambio.cuota_nro}:`, updateResult);
      }
    }

    // 7. Marcar FRAPP como completado en Supabase
    const { error: logError } = await supabase
      .from('webhook_logs')
      .insert([{
        webhook_id: parseInt(id),
        stage: 'membership_creation',
        status: 'success',
        details: `Regularización de pago anticipado completada por ${userEmail}. ${cambios.length} cuotas actualizadas.`,
        created_at: new Date().toISOString()
      }]);

    if (logError) {
      console.error('[WebPig] Error insertando log de FRAPP:', logError);
    }

    // 8. Generar y enviar paz y salvo
    // Obtener datos del estudiante de la primera cuota
    const primeraCartera = allCuotas[0];
    const datosEstudiante = {
      nombres: primeraCartera.nombres || payload.givenName || '',
      apellidos: primeraCartera.apellidos || payload.familyName || '',
      cedula: primeraCartera.numero_documento || payload.identityDocument || '',
      celular: primeraCartera.celular || payload.phone || '',
      producto: producto,
      acuerdo: agreementId
    };

    console.log('[WebPig] Generando paz y salvo para:', datosEstudiante);

    let pazYSalvoResult = null;
    try {
      // Usar pdfService (Supabase) en lugar de googleDriveService para evitar problemas de cuota
      pazYSalvoResult = await pdfService.generarYEnviarPazYSalvo(datosEstudiante);
      console.log('[WebPig] Resultado paz y salvo:', pazYSalvoResult);
    } catch (pazError) {
      console.error('[WebPig] Error generando paz y salvo:', pazError);
      pazYSalvoResult = { success: false, error: pazError.message };
    }

    res.json({
      success: true,
      dryRun: false,
      message: `Regularización completada. ${cambios.length} cuotas actualizadas.${pazYSalvoResult?.success ? ' Paz y salvo enviado.' : ''}`,
      resumen,
      resultados,
      pazYSalvo: pazYSalvoResult
    });

  } catch (error) {
    console.error('[WebPig] Error regularizing advance payment:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===== EPAYCO PROXY ENDPOINTS =====

// Helper function: Get ePayco auth token
async function getEpaycoToken() {
  try {
    console.log('[ePayco] Obtaining authentication token...');

    const username = '1a0a756de0fb2954415d616f54df0325';
    const password = 'ba0e97bd6ca3e5d8bb360879d94eca8d';

    // Crear credenciales Base64 para Basic Auth
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');

    const response = await fetch('https://apify.epayco.co/login', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/json'
      }
    });

    console.log(`[ePayco] Login response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ePayco] Login error: ${errorText}`);
      throw new Error(`Failed to authenticate with ePayco: ${response.status}`);
    }

    const data = await response.json();
    console.log('[ePayco] Login response token length:', data.token?.length || 0);

    if (!data.token) {
      throw new Error('Token not received from ePayco login');
    }

    console.log('[ePayco] Token obtained successfully');

    return data.token;
  } catch (error) {
    console.error('[ePayco] Error obtaining token:', error);
    throw error;
  }
}

// GET recent ePayco transactions (últimas 100)
app.get('/api/epayco/transactions', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    console.log('[ePayco] Fetching 80 transactions...');

    // Paso 1: Obtener token dinámico
    const token = await getEpaycoToken();

    // Paso 2: Traer solo 80 transacciones (1 página con limit 80)
    const uniqueTxsMap = new Map();
    let acceptedCount = 0;
    let page = 1;
    const maxPages = 1; // Solo 1 página

    while (page <= maxPages) {
      console.log(`[ePayco] Fetching page ${page}...`);

      const pageResponse = await fetch('https://apify.epayco.co/transaction', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          pagination: {
            page: page,
            limit: 80
          }
        })
      });

      if (!pageResponse.ok) {
        console.warn(`[ePayco] Page ${page} failed, stopping pagination`);
        break;
      }

      const pageData = await pageResponse.json();
      const pageTxs = pageData.data?.data || [];

      console.log(`[ePayco] Page ${page} fetched: ${pageTxs.length} transactions`);

      // DEBUG: Mostrar primeras referencias para detectar si son las mismas
      if (pageTxs.length > 0) {
        const firstRefs = pageTxs.slice(0, 3).map(tx => tx.referencePayco);
        console.log(`[ePayco] Page ${page} first 3 refs: ${firstRefs.join(', ')}`);
      }

      // Si no hay más transacciones, salir del loop
      if (pageTxs.length === 0) {
        console.log('[ePayco] No more transactions available');
        break;
      }

      // Contar cuántas son nuevas antes de agregar
      const beforeSize = uniqueTxsMap.size;

      // Agregar transacciones únicas al Map y contar las aceptadas
      pageTxs.forEach(tx => {
        if (tx.referencePayco && !uniqueTxsMap.has(tx.referencePayco)) {
          uniqueTxsMap.set(tx.referencePayco, tx);
          if (tx.status === 'Aceptada') {
            acceptedCount++;
          }
        }
      });

      const newTxs = uniqueTxsMap.size - beforeSize;
      console.log(`[ePayco] New unique txs in page ${page}: ${newTxs}`);
      console.log(`[ePayco] Accepted so far: ${acceptedCount}/80`);

      // Si no hay nuevas transacciones en 2 páginas consecutivas, la API está repitiendo
      if (newTxs === 0) {
        console.warn('[ePayco] No new transactions found, API pagination may be broken. Stopping.');
        break;
      }

      page++;
    }

    const uniqueTxs = Array.from(uniqueTxsMap.values());
    const finalAcceptedCount = uniqueTxs.filter(tx => tx.status === 'Aceptada').length;

    console.log(`[ePayco] Final stats: ${uniqueTxs.length} unique transactions, ${finalAcceptedCount} accepted (${page - 1} pages fetched)`);

    const combinedData = {
      success: true,
      data: {
        data: uniqueTxs
      }
    };

    res.json(combinedData);
  } catch (error) {
    console.error('[ePayco] Error fetching transactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Actualización Automática de Carteras (para triggers externos)
// GET /api/carteras-masivo/auto?token=SECRET&incluir_mora=true
// No requiere autenticación de usuario, usa token secreto para llamadas programadas
app.get('/api/carteras-masivo/auto', async (req, res) => {
  try {
    const axios = require('axios');
    const token = req.query.token;
    const incluirMora = req.query.incluir_mora === 'true';

    // Validar token secreto
    const SECRET_TOKEN = process.env.CARTERAS_MASIVO_TOKEN || 'FR360_carteras_masivo_2025';
    if (token !== SECRET_TOKEN) {
      console.warn(`⚠️ [AUTO] Token inválido para carteras-masivo/auto`);
      return res.status(401).json({
        success: false,
        error: 'Token inválido'
      });
    }

    console.log(`🤖 [AUTO] Iniciando actualización automática de carteras ${incluirMora ? '(incluyendo mora)' : ''}...`);

    // Calcular fecha de hoy en Colombia (UTC-5)
    const now = new Date();
    const colombiaOffset = -5 * 60;
    const localOffset = now.getTimezoneOffset();
    const colombiaTime = new Date(now.getTime() + (localOffset - colombiaOffset) * 60000);
    const hoy = new Date(colombiaTime.getFullYear(), colombiaTime.getMonth(), colombiaTime.getDate());
    const hoyStr = hoy.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`📅 Fecha de hoy (Colombia): ${hoyStr}`);

    // 1. Obtener carteras con estado_pago null
    console.log('🔍 Consultando carteras con estado_pago null...');
    const carterasNullResponse = await axios.get(
      `https://strapi-project-d3p7.onrender.com/api/carteras`,
      {
        params: {
          'filters[estado_pago][$null]': true,
          'pagination[page]': 1,
          'pagination[pageSize]': 100,
          'populate': 'producto'
        },
        headers: {
          'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
        }
      }
    );

    const carterasNull = carterasNullResponse.data.data || [];
    console.log(`✅ Encontradas ${carterasNull.length} carteras con estado_pago null`);

    // 2. Obtener carteras con estado_pago = 'al_dia' y fecha_limite < hoy
    console.log('🔍 Consultando carteras al_dia con fecha vencida...');
    const carterasAlDiaVencidasResponse = await axios.get(
      `https://strapi-project-d3p7.onrender.com/api/carteras`,
      {
        params: {
          'filters[estado_pago][$eq]': 'al_dia',
          'filters[fecha_limite][$lt]': hoyStr,
          'pagination[page]': 1,
          'pagination[pageSize]': 100,
          'populate': 'producto'
        },
        headers: {
          'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
        }
      }
    );

    const carterasAlDiaVencidas = carterasAlDiaVencidasResponse.data.data || [];
    console.log(`✅ Encontradas ${carterasAlDiaVencidas.length} carteras al_dia con fecha vencida`);

    // 3. Si incluir_mora=true, obtener también las carteras en mora (CON PAGINACIÓN COMPLETA)
    let carterasMora = [];
    if (incluirMora) {
      console.log('🔍 Consultando carteras en mora...');
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const carterasMoraResponse = await axios.get(
          `https://strapi-project-d3p7.onrender.com/api/carteras`,
          {
            params: {
              'filters[estado_pago][$eq]': 'en_mora',
              'pagination[page]': page,
              'pagination[pageSize]': 100,
              'populate': 'producto'
            },
            headers: {
              'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
            }
          }
        );

        const pageData = carterasMoraResponse.data.data || [];
        carterasMora = carterasMora.concat(pageData);

        const pagination = carterasMoraResponse.data.meta?.pagination;
        hasMore = pagination && page < pagination.pageCount;

        if (hasMore) {
          console.log(`  📄 Página ${page}: ${pageData.length} carteras (continuando...)`);
          page++;
        }
      }

      console.log(`✅ Encontradas ${carterasMora.length} carteras en mora (${page} página(s))`);
    }

    // 4. Combinar todos los arrays
    const carterasAProcesar = [...carterasNull, ...carterasAlDiaVencidas, ...carterasMora];
    console.log(`📊 Total de carteras a procesar: ${carterasAProcesar.length}`);

    if (carterasAProcesar.length === 0) {
      return res.json({
        success: true,
        message: 'No hay carteras pendientes de actualizar',
        acuerdos_procesados: 0,
        cuotas_actualizadas: 0,
        acuerdos: []
      });
    }

    // 5. Identificar acuerdos únicos (numero_documento + nro_acuerdo)
    const acuerdosUnicos = new Map();
    carterasAProcesar.forEach(item => {
      const nroAcuerdo = item.nro_acuerdo;
      const numeroDocumento = item.numero_documento;

      if (!nroAcuerdo || !numeroDocumento) return;

      const key = `${numeroDocumento}-${nroAcuerdo}`;
      if (!acuerdosUnicos.has(key)) {
        acuerdosUnicos.set(key, {
          numero_documento: numeroDocumento,
          nro_acuerdo: nroAcuerdo,
          producto: item.producto?.nombre || 'Sin producto'
        });
      }
    });

    // Procesar TODOS los acuerdos únicos (sin límite)
    const acuerdosAProcesar = Array.from(acuerdosUnicos.values());
    console.log(`📋 Identificados ${acuerdosAProcesar.length} acuerdos únicos a procesar`);

    // 6. Para cada acuerdo, traer TODAS sus cuotas de Strapi
    const acuerdosMap = new Map();

    for (const acuerdo of acuerdosAProcesar) {
      console.log(`🔍 Obteniendo todas las cuotas del acuerdo ${acuerdo.nro_acuerdo}...`);

      const todasLasCuotasResponse = await axios.get(
        `https://strapi-project-d3p7.onrender.com/api/carteras`,
        {
          params: {
            'filters[numero_documento]': acuerdo.numero_documento,
            'filters[nro_acuerdo]': acuerdo.nro_acuerdo,
            'pagination[pageSize]': 100,
            'populate': 'producto'
          },
          headers: {
            'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
          }
        }
      );

      const todasLasCuotas = todasLasCuotasResponse.data.data || [];
      console.log(`  ✅ Encontradas ${todasLasCuotas.length} cuotas`);

      const key = `${acuerdo.numero_documento}-${acuerdo.nro_acuerdo}`;
      acuerdosMap.set(key, {
        numero_documento: acuerdo.numero_documento,
        nro_acuerdo: acuerdo.nro_acuerdo,
        producto: acuerdo.producto,
        cuotas: todasLasCuotas.map(item => ({
          documentId: item.documentId || item.id,
          cuota_nro: item.cuota_nro,
          valor_cuota: item.valor_cuota,
          fecha_limite: item.fecha_limite,
          id_pago: item.id_pago,
          id_pago_mora: item.id_pago_mora,
          estado_pago: item.estado_pago,
          fecha_de_pago: item.fecha_de_pago,
          valor_pagado: item.valor_pagado
        }))
      });
    }

    console.log(`📋 Acuerdos completos listos para procesar: ${acuerdosMap.size}`);

    // 7. Procesar cada acuerdo (verificar estado de cuotas)
    const acuerdosProcessed = [];
    let cuotasActualizadas = 0;

    for (const [key, acuerdo] of acuerdosMap) {
      console.log(`\n🔄 Procesando acuerdo ${acuerdo.nro_acuerdo} - ${acuerdo.numero_documento}`);

      // Ordenar cuotas por número
      acuerdo.cuotas.sort((a, b) => (a.cuota_nro || 0) - (b.cuota_nro || 0));

      // 8. Obtener TODAS las ventas (facturaciones) del numero_documento para cruzar
      console.log(`📊 Obteniendo facturaciones de ${acuerdo.numero_documento}...`);
      const facturacionesResponse = await axios.get(
        `https://strapi-project-d3p7.onrender.com/api/facturaciones`,
        {
          params: {
            'filters[numero_documento]': acuerdo.numero_documento,
            'pagination[pageSize]': 100,
            'populate': 'producto'
          },
          headers: {
            'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
          }
        }
      );

      const facturaciones = facturacionesResponse.data.data || [];
      console.log(`  ✅ Encontradas ${facturaciones.length} facturaciones`);

      // Procesar cada cuota del acuerdo
      const nroCuotas = acuerdo.cuotas.length;

      for (const cuota of acuerdo.cuotas) {
        try {
          const baseProducto = acuerdo.producto;
          const cuotaNro = cuota.cuota_nro;
          const esUltimaCuota = cuotaNro === nroCuotas;
          let ventasMatch = [];

          // DEBUG: Log detallado para casos específicos
          const isDebugDoc = ['1019052530', '1010061800'].includes(acuerdo.numero_documento);
          if (isDebugDoc) {
            console.log(`\n🐛 [DEBUG] Procesando cuota ${cuotaNro} del documento ${acuerdo.numero_documento}`);
            console.log(`  - Estado actual: ${cuota.estado_pago}`);
            console.log(`  - id_pago: ${cuota.id_pago}`);
            console.log(`  - Total facturaciones disponibles: ${facturaciones.length}`);
            if (facturaciones.length > 0) {
              console.log(`  - Transacciones encontradas: ${facturaciones.map(f => f.transaccion).join(', ')}`);
            }
          }

          // PASO 1: Buscar PRIMERO por id_pago (más confiable y directo)
          if (cuota.id_pago) {
            if (isDebugDoc) {
              console.log(`  🔍 [DEBUG] Buscando por id_pago: "${cuota.id_pago}"`);
            }

            ventasMatch = facturaciones.filter(f => {
              const transaccion = String(f.transaccion || '').trim();
              const idPagoStr = String(cuota.id_pago).trim();
              const match = transaccion === idPagoStr;

              if (isDebugDoc && f.transaccion) {
                console.log(`    - Comparando "${transaccion}" === "${idPagoStr}" → ${match}`);
              }

              return match;
            });

            if (ventasMatch.length > 0) {
              console.log(`  🎯 Cuota ${cuotaNro} encontrada por id_pago: ${cuota.id_pago}`);
            } else if (isDebugDoc) {
              console.log(`  ❌ [DEBUG] NO encontrada por id_pago`);
            }
          }

          // PASO 2: Si no encontró por id_pago, buscar por id_pago_mora (pagos tardíos)
          if (ventasMatch.length === 0 && cuota.id_pago_mora) {
            ventasMatch = facturaciones.filter(f => {
              const transaccion = String(f.transaccion || '').trim();
              return transaccion === String(cuota.id_pago_mora).trim();
            });

            if (ventasMatch.length > 0) {
              console.log(`  🎯 Cuota ${cuotaNro} encontrada por id_pago_mora: ${cuota.id_pago_mora}`);
            }
          }

          // PASO 3: Si no encontró por IDs, buscar por nombre de producto (fallback)
          if (ventasMatch.length === 0) {
            ventasMatch = facturaciones.filter(f => {
              const productoNombre = f.producto?.nombre || '';
              const nroAcuerdoFactura = String(f.acuerdo || '').trim();
              const nroAcuerdoEsperado = String(acuerdo.nro_acuerdo).trim();

              // El acuerdo debe coincidir
              if (nroAcuerdoFactura !== nroAcuerdoEsperado) return false;

              // Buscar por nombre de producto
              const targetNames = [
                `${baseProducto} - Cuota ${cuotaNro}`,
                `${baseProducto} - Cuota ${cuotaNro} (Mora)`
              ];

              // Si es la última cuota, también buscar "Paz y salvo"
              if (esUltimaCuota) {
                targetNames.push(`${baseProducto} - Paz y salvo`);
              }

              return targetNames.some(name => {
                const normName = productoNombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const normTarget = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                return normName === normTarget;
              });
            });

            if (ventasMatch.length > 0) {
              console.log(`  💰 Cuota ${cuotaNro} encontrada por nombre de producto: ${ventasMatch[0].producto?.nombre}`);
            }
          }

          // Si encontró match en ventas (por cualquier método), marcar como pagado
          if (ventasMatch.length > 0) {
            // Usar la primera venta encontrada
            const venta = ventasMatch[0];
            const fechaPago = venta.fecha || '';
            const valorPagado = venta.valor_neto || 0;

            // Solo actualizar si el estado cambió
            if (cuota.estado_pago !== 'pagado' || cuota.fecha_de_pago !== fechaPago || cuota.valor_pagado !== valorPagado) {
              // Actualizar en Strapi
              await axios.put(
                `https://strapi-project-d3p7.onrender.com/api/carteras/${cuota.documentId}`,
                {
                  data: {
                    estado_pago: 'pagado',
                    fecha_de_pago: fechaPago,
                    valor_pagado: valorPagado
                  }
                },
                {
                  headers: {
                    'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                  }
                }
              );

              cuota.estado_pago = 'pagado';
              cuota.fecha_de_pago = fechaPago;
              cuota.valor_pagado = valorPagado;
              cuotasActualizadas++;
              console.log(`  ✅ Cuota ${cuotaNro}: Actualizada a Pagado (${fechaPago})`);
            } else {
              console.log(`  ⏭️ Cuota ${cuotaNro}: Ya estaba como Pagado (sin cambios)`);
            }
          } else {
            // PASO 2: Si NO encontró en ventas, verificar estado según fecha límite
            const fechaLimite = cuota.fecha_limite;
            if (fechaLimite && fechaLimite !== '1970-01-01') {
              const now = new Date();
              const colombiaOffset = -5 * 60;
              const localOffset = now.getTimezoneOffset();
              const colombiaTime = new Date(now.getTime() + (localOffset - colombiaOffset) * 60000);
              const hoy = new Date(colombiaTime.getFullYear(), colombiaTime.getMonth(), colombiaTime.getDate());
              const limite = new Date(fechaLimite + 'T00:00:00-05:00');

              const estadoPago = limite < hoy ? 'en_mora' : 'al_dia';

              // Solo actualizar si el estado cambió
              if (cuota.estado_pago !== estadoPago) {
                // Actualizar en Strapi
                await axios.put(
                  `https://strapi-project-d3p7.onrender.com/api/carteras/${cuota.documentId}`,
                  {
                    data: {
                      estado_pago: estadoPago,
                      fecha_de_pago: null,
                      valor_pagado: null
                    }
                  },
                  {
                    headers: {
                      'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );

                cuota.estado_pago = estadoPago;
                cuota.fecha_de_pago = '';
                cuota.valor_pagado = null;
                cuotasActualizadas++;
                console.log(`  ✅ Cuota ${cuotaNro}: Actualizada a ${estadoPago}`);
              } else {
                console.log(`  ⏭️ Cuota ${cuotaNro}: Ya estaba como ${estadoPago} (sin cambios)`);
              }
            }
          }

        } catch (error) {
          console.error(`  ❌ Error procesando cuota ${cuota.cuota_nro}:`, error.message);
          cuota.estado_pago = 'error';
          cuota.error = error.message;
        }
      }

      acuerdosProcessed.push(acuerdo);
    }

    console.log(`\n✅ [AUTO] Procesamiento completado:`);
    console.log(`   • Acuerdos procesados: ${acuerdosProcessed.length}`);
    console.log(`   • Cuotas actualizadas: ${cuotasActualizadas}`);

    res.json({
      success: true,
      acuerdos_procesados: acuerdosProcessed.length,
      cuotas_actualizadas: cuotasActualizadas,
      acuerdos: acuerdosProcessed,
      procesados: cuotasActualizadas,
      errores: 0
    });

  } catch (error) {
    console.error('❌ [AUTO] Error in carteras-masivo/auto:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint: Actualización Masiva de Carteras (MUST BE BEFORE GENERIC HANDLER)
// Procesa TODAS las cuotas pendientes y vencidas usando la lógica de Acuerdos:
// 1. Cuotas con estado_pago = null
// 2. Cuotas con estado_pago = 'al_dia' pero con fecha_limite < hoy
// 3. Opcionalmente: cuotas con estado_pago = 'en_mora' (query param: incluir_mora=true)
app.post('/api/carteras-masivo', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    const axios = require('axios');
    const incluirMora = req.query.incluir_mora === 'true';

    // Validar que solo daniel.cardona@sentiretaller.com pueda usar este endpoint
    const userEmail = req.user?.email || '';
    console.log(`📊 Usuario intentando acceso: ${userEmail}`);

    if (userEmail !== 'daniel.cardona@sentiretaller.com') {
      console.warn(`⚠️ Acceso denegado para: ${userEmail}`);
      return res.status(403).json({
        success: false,
        error: 'No tienes permisos para usar esta funcionalidad'
      });
    }

    console.log(`📊 Iniciando actualización masiva global de carteras ${incluirMora ? '(incluyendo mora)' : ''}...`);

    // Calcular fecha de hoy en Colombia (UTC-5)
    const now = new Date();
    const colombiaOffset = -5 * 60;
    const localOffset = now.getTimezoneOffset();
    const colombiaTime = new Date(now.getTime() + (localOffset - colombiaOffset) * 60000);
    const hoy = new Date(colombiaTime.getFullYear(), colombiaTime.getMonth(), colombiaTime.getDate());
    const hoyStr = hoy.toISOString().split('T')[0]; // YYYY-MM-DD

    console.log(`📅 Fecha de hoy (Colombia): ${hoyStr}`);

    // 1. Obtener carteras con estado_pago null
    console.log('🔍 Consultando carteras con estado_pago null...');
    const carterasNullResponse = await axios.get(
      `https://strapi-project-d3p7.onrender.com/api/carteras`,
      {
        params: {
          'filters[estado_pago][$null]': true,
          'pagination[page]': 1,
          'pagination[pageSize]': 100,
          'populate': 'producto'
        },
        headers: {
          'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
        }
      }
    );

    const carterasNull = carterasNullResponse.data.data || [];
    console.log(`✅ Encontradas ${carterasNull.length} carteras con estado_pago null`);

    // 2. Obtener carteras con estado_pago = 'al_dia' y fecha_limite < hoy
    console.log('🔍 Consultando carteras al_dia con fecha vencida...');
    const carterasAlDiaVencidasResponse = await axios.get(
      `https://strapi-project-d3p7.onrender.com/api/carteras`,
      {
        params: {
          'filters[estado_pago][$eq]': 'al_dia',
          'filters[fecha_limite][$lt]': hoyStr,
          'pagination[page]': 1,
          'pagination[pageSize]': 100,
          'populate': 'producto'
        },
        headers: {
          'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
        }
      }
    );

    const carterasAlDiaVencidas = carterasAlDiaVencidasResponse.data.data || [];
    console.log(`✅ Encontradas ${carterasAlDiaVencidas.length} carteras al_dia con fecha vencida`);

    // 3. Si incluir_mora=true, obtener también las carteras en mora (CON PAGINACIÓN COMPLETA)
    let carterasMora = [];
    if (incluirMora) {
      console.log('🔍 Consultando carteras en mora...');
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const carterasMoraResponse = await axios.get(
          `https://strapi-project-d3p7.onrender.com/api/carteras`,
          {
            params: {
              'filters[estado_pago][$eq]': 'en_mora',
              'pagination[page]': page,
              'pagination[pageSize]': 100,
              'populate': 'producto'
            },
            headers: {
              'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
            }
          }
        );

        const pageData = carterasMoraResponse.data.data || [];
        carterasMora = carterasMora.concat(pageData);

        const pagination = carterasMoraResponse.data.meta?.pagination;
        hasMore = pagination && page < pagination.pageCount;

        if (hasMore) {
          console.log(`  📄 Página ${page}: ${pageData.length} carteras (continuando...)`);
          page++;
        }
      }

      console.log(`✅ Encontradas ${carterasMora.length} carteras en mora (${page} página(s))`);
    }

    // 4. Combinar todos los arrays
    const carterasAProcesar = [...carterasNull, ...carterasAlDiaVencidas, ...carterasMora];
    console.log(`📊 Total de carteras a procesar: ${carterasAProcesar.length}`);

    if (carterasAProcesar.length === 0) {
      return res.json({
        success: true,
        message: 'No hay carteras pendientes de actualizar',
        acuerdos_procesados: 0,
        cuotas_actualizadas: 0,
        acuerdos: []
      });
    }

    // 4. Identificar acuerdos únicos (numero_documento + nro_acuerdo)
    const acuerdosUnicos = new Map();
    carterasAProcesar.forEach(item => {
      const nroAcuerdo = item.nro_acuerdo;
      const numeroDocumento = item.numero_documento;

      if (!nroAcuerdo || !numeroDocumento) return;

      const key = `${numeroDocumento}-${nroAcuerdo}`;
      if (!acuerdosUnicos.has(key)) {
        acuerdosUnicos.set(key, {
          numero_documento: numeroDocumento,
          nro_acuerdo: nroAcuerdo,
          producto: item.producto?.nombre || 'Sin producto'
        });
      }
    });

    // Procesar TODOS los acuerdos únicos (sin límite)
    const acuerdosAProcesar = Array.from(acuerdosUnicos.values());
    console.log(`📋 Identificados ${acuerdosAProcesar.length} acuerdos únicos a procesar`);

    // 5. Para cada acuerdo, traer TODAS sus cuotas de Strapi
    const acuerdosMap = new Map();

    for (const acuerdo of acuerdosAProcesar) {
      console.log(`🔍 Obteniendo todas las cuotas del acuerdo ${acuerdo.nro_acuerdo}...`);

      const todasLasCuotasResponse = await axios.get(
        `https://strapi-project-d3p7.onrender.com/api/carteras`,
        {
          params: {
            'filters[numero_documento]': acuerdo.numero_documento,
            'filters[nro_acuerdo]': acuerdo.nro_acuerdo,
            'pagination[pageSize]': 100,
            'populate': 'producto'
          },
          headers: {
            'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
          }
        }
      );

      const todasLasCuotas = todasLasCuotasResponse.data.data || [];
      console.log(`  ✅ Encontradas ${todasLasCuotas.length} cuotas`);

      const key = `${acuerdo.numero_documento}-${acuerdo.nro_acuerdo}`;
      acuerdosMap.set(key, {
        numero_documento: acuerdo.numero_documento,
        nro_acuerdo: acuerdo.nro_acuerdo,
        producto: acuerdo.producto,
        cuotas: todasLasCuotas.map(item => ({
          documentId: item.documentId || item.id,
          cuota_nro: item.cuota_nro,
          valor_cuota: item.valor_cuota,
          fecha_limite: item.fecha_limite,
          id_pago: item.id_pago,
          id_pago_mora: item.id_pago_mora,
          estado_pago: item.estado_pago,
          fecha_de_pago: item.fecha_de_pago,
          valor_pagado: item.valor_pagado
        }))
      });
    }

    console.log(`📋 Acuerdos completos listos para procesar: ${acuerdosMap.size}`);

    // 3. Procesar cada acuerdo (verificar estado de cuotas)
    const acuerdosProcessed = [];
    let cuotasActualizadas = 0;

    for (const [key, acuerdo] of acuerdosMap) {
      console.log(`\n🔄 Procesando acuerdo ${acuerdo.nro_acuerdo} - ${acuerdo.numero_documento}`);

      // Ordenar cuotas por número
      acuerdo.cuotas.sort((a, b) => (a.cuota_nro || 0) - (b.cuota_nro || 0));

      // 4. Obtener TODAS las ventas (facturaciones) del numero_documento para cruzar
      console.log(`📊 Obteniendo facturaciones de ${acuerdo.numero_documento}...`);
      const facturacionesResponse = await axios.get(
        `https://strapi-project-d3p7.onrender.com/api/facturaciones`,
        {
          params: {
            'filters[numero_documento]': acuerdo.numero_documento,
            'pagination[pageSize]': 100,
            'populate': 'producto'
          },
          headers: {
            'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
          }
        }
      );

      const facturaciones = facturacionesResponse.data.data || [];
      console.log(`  ✅ Encontradas ${facturaciones.length} facturaciones`);

      // Procesar cada cuota del acuerdo
      const nroCuotas = acuerdo.cuotas.length;

      for (const cuota of acuerdo.cuotas) {
        try {
          const baseProducto = acuerdo.producto;
          const cuotaNro = cuota.cuota_nro;
          const esUltimaCuota = cuotaNro === nroCuotas;
          let ventasMatch = [];

          // DEBUG: Log detallado para casos específicos
          const isDebugDoc = ['1019052530', '1010061800'].includes(acuerdo.numero_documento);
          if (isDebugDoc) {
            console.log(`\n🐛 [DEBUG] Procesando cuota ${cuotaNro} del documento ${acuerdo.numero_documento}`);
            console.log(`  - Estado actual: ${cuota.estado_pago}`);
            console.log(`  - id_pago: ${cuota.id_pago}`);
            console.log(`  - Total facturaciones disponibles: ${facturaciones.length}`);
            if (facturaciones.length > 0) {
              console.log(`  - Transacciones encontradas: ${facturaciones.map(f => f.transaccion).join(', ')}`);
            }
          }

          // PASO 1: Buscar PRIMERO por id_pago (más confiable y directo)
          if (cuota.id_pago) {
            if (isDebugDoc) {
              console.log(`  🔍 [DEBUG] Buscando por id_pago: "${cuota.id_pago}"`);
            }

            ventasMatch = facturaciones.filter(f => {
              const transaccion = String(f.transaccion || '').trim();
              const idPagoStr = String(cuota.id_pago).trim();
              const match = transaccion === idPagoStr;

              if (isDebugDoc && f.transaccion) {
                console.log(`    - Comparando "${transaccion}" === "${idPagoStr}" → ${match}`);
              }

              return match;
            });

            if (ventasMatch.length > 0) {
              console.log(`  🎯 Cuota ${cuotaNro} encontrada por id_pago: ${cuota.id_pago}`);
            } else if (isDebugDoc) {
              console.log(`  ❌ [DEBUG] NO encontrada por id_pago`);
            }
          }

          // PASO 2: Si no encontró por id_pago, buscar por id_pago_mora (pagos tardíos)
          if (ventasMatch.length === 0 && cuota.id_pago_mora) {
            ventasMatch = facturaciones.filter(f => {
              const transaccion = String(f.transaccion || '').trim();
              return transaccion === String(cuota.id_pago_mora).trim();
            });

            if (ventasMatch.length > 0) {
              console.log(`  🎯 Cuota ${cuotaNro} encontrada por id_pago_mora: ${cuota.id_pago_mora}`);
            }
          }

          // PASO 3: Si no encontró por IDs, buscar por nombre de producto (fallback)
          if (ventasMatch.length === 0) {
            ventasMatch = facturaciones.filter(f => {
              const productoNombre = f.producto?.nombre || '';
              const nroAcuerdoFactura = String(f.acuerdo || '').trim();
              const nroAcuerdoEsperado = String(acuerdo.nro_acuerdo).trim();

              // El acuerdo debe coincidir
              if (nroAcuerdoFactura !== nroAcuerdoEsperado) return false;

              // Buscar por nombre de producto
              const targetNames = [
                `${baseProducto} - Cuota ${cuotaNro}`,
                `${baseProducto} - Cuota ${cuotaNro} (Mora)`
              ];

              // Si es la última cuota, también buscar "Paz y salvo"
              if (esUltimaCuota) {
                targetNames.push(`${baseProducto} - Paz y salvo`);
              }

              return targetNames.some(name => {
                const normName = productoNombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                const normTarget = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
                return normName === normTarget;
              });
            });

            if (ventasMatch.length > 0) {
              console.log(`  💰 Cuota ${cuotaNro} encontrada por nombre de producto: ${ventasMatch[0].producto?.nombre}`);
            }
          }

          // Si encontró match en ventas (por cualquier método), marcar como pagado
          if (ventasMatch.length > 0) {
            // Usar la primera venta encontrada
            const venta = ventasMatch[0];
            const fechaPago = venta.fecha || '';
            const valorPagado = venta.valor_neto || 0;

            // Solo actualizar si el estado cambió
            if (cuota.estado_pago !== 'pagado' || cuota.fecha_de_pago !== fechaPago || cuota.valor_pagado !== valorPagado) {
              // Actualizar en Strapi
              await axios.put(
                `https://strapi-project-d3p7.onrender.com/api/carteras/${cuota.documentId}`,
                {
                  data: {
                    estado_pago: 'pagado',
                    fecha_de_pago: fechaPago,
                    valor_pagado: valorPagado
                  }
                },
                {
                  headers: {
                    'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`,
                    'Content-Type': 'application/json'
                  }
                }
              );

              cuota.estado_pago = 'pagado';
              cuota.fecha_de_pago = fechaPago;
              cuota.valor_pagado = valorPagado;
              cuotasActualizadas++;
              console.log(`  ✅ Cuota ${cuotaNro}: Actualizada a Pagado (${fechaPago})`);
            } else {
              console.log(`  ⏭️ Cuota ${cuotaNro}: Ya estaba como Pagado (sin cambios)`);
            }
          } else {
            // PASO 2: Si NO encontró en ventas, verificar estado según fecha límite
            const fechaLimite = cuota.fecha_limite;
            if (fechaLimite && fechaLimite !== '1970-01-01') {
              const now = new Date();
              const colombiaOffset = -5 * 60;
              const localOffset = now.getTimezoneOffset();
              const colombiaTime = new Date(now.getTime() + (localOffset - colombiaOffset) * 60000);
              const hoy = new Date(colombiaTime.getFullYear(), colombiaTime.getMonth(), colombiaTime.getDate());
              const limite = new Date(fechaLimite + 'T00:00:00-05:00');

              const estadoPago = limite < hoy ? 'en_mora' : 'al_dia';

              // Solo actualizar si el estado cambió
              if (cuota.estado_pago !== estadoPago) {
                // Actualizar en Strapi
                await axios.put(
                  `https://strapi-project-d3p7.onrender.com/api/carteras/${cuota.documentId}`,
                  {
                    data: {
                      estado_pago: estadoPago,
                      fecha_de_pago: null,
                      valor_pagado: null
                    }
                  },
                  {
                    headers: {
                      'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`,
                      'Content-Type': 'application/json'
                    }
                  }
                );

                cuota.estado_pago = estadoPago;
                cuota.fecha_de_pago = '';
                cuota.valor_pagado = null;
                cuotasActualizadas++;
                console.log(`  ✅ Cuota ${cuotaNro}: Actualizada a ${estadoPago}`);
              } else {
                console.log(`  ⏭️ Cuota ${cuotaNro}: Ya estaba como ${estadoPago} (sin cambios)`);
              }
            }
          }

        } catch (error) {
          console.error(`  ❌ Error procesando cuota ${cuota.cuota_nro}:`, error.message);
          cuota.estado_pago = 'error';
          cuota.error = error.message;
        }
      }

      acuerdosProcessed.push(acuerdo);
    }

    console.log(`\n✅ Procesamiento completado:`);
    console.log(`   • Acuerdos procesados: ${acuerdosProcessed.length}`);
    console.log(`   • Cuotas actualizadas: ${cuotasActualizadas}`);

    res.json({
      success: true,
      acuerdos_procesados: acuerdosProcessed.length,
      cuotas_actualizadas: cuotasActualizadas,
      acuerdos: acuerdosProcessed,
      procesados: cuotasActualizadas,
      errores: 0
    });

  } catch (error) {
    console.error('❌ Error in carteras-masivo:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Generar y enviar paz y salvo desde Acuerdos (DEBE estar ANTES del handler genérico)
app.post('/api/paz-y-salvo', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    const { nombres, apellidos, cedula, celular, producto, acuerdo } = req.body;

    // Validar datos requeridos
    if (!nombres || !apellidos || !cedula || !producto || !acuerdo) {
      return res.status(400).json({
        success: false,
        error: 'Faltan datos requeridos: nombres, apellidos, cedula, producto, acuerdo'
      });
    }

    console.log('[PazYSalvo] Generando paz y salvo para:', { nombres, apellidos, cedula, producto, acuerdo });

    // Usar pdfService para generar y enviar el paz y salvo
    const resultado = await pdfService.generarYEnviarPazYSalvo({
      nombres,
      apellidos,
      cedula,
      celular: celular || '',
      producto,
      acuerdo
    });

    console.log('[PazYSalvo] Resultado:', resultado);

    res.json({
      success: resultado.success,
      pdfUrl: resultado.pdfUrl,
      callbellSent: resultado.callbellSent,
      message: resultado.success
        ? `Paz y salvo generado${resultado.callbellSent ? ' y enviado por WhatsApp' : ''}`
        : 'Error generando paz y salvo',
      error: resultado.error
    });

  } catch (error) {
    console.error('[PazYSalvo] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Universal POST handler for API client compatibility
// Mapea las llamadas POST del cliente a las funciones de servicio correctas
app.post('/api/:functionName', ensureAuthenticated, ensureDomain, async (req, res) => {
  const { functionName } = req.params;
  const { args } = req.body;

  console.log(`📞 API Call: ${functionName}`, args);

  try {
    let result;

    // Mapear nombres de funciones a sus implementaciones
    switch (functionName) {
      // === CITIZEN & CRM ===
      case 'getCitizenServer':
        result = await fr360Service.getCitizen(args[0]);
        break;

      case 'fetchCrmByEmail':
        result = await strapiService.fetchCrmByEmail(args[0]);
        break;

      case 'fetchCrmByCelular':
        result = await strapiService.fetchCrmByCelular(args[0]);
        break;

      case 'updateCelularCRM':
        result = await strapiService.updateCelularCRM(args[0], args[1]);
        break;

      case 'updateCelularStrapiCarteras':
        result = await strapiService.updateCelularStrapiCarteras(args[0], args[1]);
        break;

      case 'updateCelularFR360Links':
        result = await strapiService.updateCelularFR360Links(args[0], args[1]);
        break;

      case 'fetchCrmStrapiOnly':
        result = await strapiService.fetchCrmStrapiOnly(args[0]);
        break;

      case 'sincronizarCrmPorNumeroDocumento':
        result = await strapiService.sincronizarCrmPorNumeroDocumento(args[0]);
        break;

      case 'fetchCrmStrapiBatch':
        result = await strapiService.fetchCrmStrapiBatch(args[0]);
        break;

      // === PRODUCTS ===
      case 'getProductosServer':
        result = await strapiService.getProducts({ mode: 'names' });
        break;

      case 'getProductosCatalog':
        result = await strapiService.getProducts({ mode: 'catalog' });
        break;

      case 'getActiveMembershipPlans':
        result = await frappService.getActiveMembershipPlans();
        break;

      case 'getProductHandleFromFRAPP':
        result = await frappService.getProductHandleFromFRAPP(args[0]);
        break;

      // === CALLBELL ===
      case 'getCallbellContact':
        result = await callbellService.getCallbellContact(args[0]);
        break;

      case 'sendWhatsAppMessage':
        result = await callbellService.sendWhatsAppMessage(args[0], args[1], args[2]);
        break;

      case 'checkMessageStatus':
        result = await callbellService.checkMessageStatus(args[0]);
        break;

      // === MEMBERSHIPS ===
      case 'traerMembresiasServer':
        result = await oldMembershipService.traerMembresiasServer(args[0]);
        break;

      case 'fetchMembresiasFRAPP':
        result = await frappService.fetchMembresiasFRAPP(args[0]);
        break;

      case 'registerMembFRAPP':
        result = await frappService.registerMembFRAPP(args[0]);
        break;

      case 'updateMembershipFRAPP':
        result = await frappService.updateMembershipFRAPP(args[0], args[1], args[2], args[3]);
        break;

      case 'freezeMembershipFRAPP':
        result = await frappService.freezeMembershipFRAPP(args[0], args[1], args[2], args[3]);
        break;

      case 'appendPatrocinioRecord':
        result = await frappService.appendPatrocinioRecord(args[0]);
        break;

      case 'updateUserFRAPP':
        result = await frappService.updateUserFRAPP(args[0], args[1]);
        break;

      // === CLICKUP TICKETS ===
      case 'createClickUpTask':
        result = await clickupService.createTask(args[0]);
        break;

      case 'saveConfianzaRecord':
        result = await strapiService.saveConfianzaRecord(args[0]);
        break;

      // === SALES & AGREEMENTS ===
      case 'fetchVentas':
        result = await strapiService.fetchVentas(args[0]);
        break;

      case 'fetchFacturaciones':
        result = await strapiService.fetchVentas(args[0]);
        break;

      case 'fetchAcuerdos':
        result = await strapiService.fetchAcuerdos(args[0]);
        break;

      case 'getComerciales':
        result = await strapiService.getComerciales();
        break;

      case 'updateVentaComercial':
        result = await strapiService.updateFacturacionComercial(args[0], args[1]);
        break;

      case 'updateFacturacion':
        result = await strapiService.updateFacturacion(args[0], args[1]);
        break;

      case 'processSinglePayment':
        result = await fr360Service.processSinglePayment(args[0]);
        break;

      case 'resolvePagoYActualizarCartera':
        result = await fr360Service.resolvePagoYActualizarCartera(args[0]);
        break;

      case 'crearAcuerdo':
        result = await strapiService.crearAcuerdo(...args);
        break;

      case 'consultarAcuerdo':
        result = await strapiService.consultarAcuerdo(args[0]);
        break;

      case 'fetchCarteraByAcuerdo':
        result = await strapiService.fetchCarteraByAcuerdo(args[0]);
        break;

      // === ANTICIPADOS 2026 ===
      case 'fetchAnticipadosPendientes':
        result = await strapiService.fetchAnticipadosPendientes();
        break;

      // === COBRANZA / DESBLOQUEO ===
      case 'obtenerCandidatosDesbloqueo':
        result = await cobranzaService.obtenerCandidatosDesbloqueo();
        break;

      case 'desbloquearUsuario':
        // args[0] = objeto usuario con: cedula, nombres, apellidos, etc.
        result = await cobranzaService.desbloquearUsuario(args[0]);
        break;

      // === COBRANZA / BLOQUEO ===
      case 'obtenerCandidatosBloqueo':
        result = await cobranzaService.obtenerCandidatosBloqueo();
        break;

      case 'bloquearUsuario':
        // args[0] = objeto usuario con: cedula, nombres, apellidos, cuotas, etc.
        result = await cobranzaService.bloquearUsuario(args[0]);
        break;

      // === COBRANCIO WEB (Notificaciones) ===
      case 'obtenerResumenCobrancio':
        result = await cobrancioWebService.obtenerResumenCobrancio();
        break;

      case 'obtenerCandidatosMora':
        result = await cobrancioWebService.obtenerCandidatosMora();
        break;

      case 'obtenerCandidatosFecha':
        result = await cobrancioWebService.obtenerCandidatosFecha();
        break;

      case 'obtenerCandidatosPrevio':
        result = await cobrancioWebService.obtenerCandidatosPrevio();
        break;

      case 'procesarNotificacionCobrancio':
        // args[0] = candidato, args[1] = tipoAviso, args[2] = soloSincronizar
        result = await cobrancioWebService.procesarNotificacion(args[0], args[1], args[2]);
        break;

      case 'verificarLeyDejenDeFregar':
        result = await cobrancioWebService.leyDejenDeFregar();
        break;

      // === LINKS ===
      case 'getLinksByIdentityDocument':
        result = await fr360Service.getLinksByIdentityDocument(args[0]);
        break;

      // === USER ===
      case 'getUserEmail':
        result = req.user.email;
        break;

      case 'getColombiaTodayParts':
        // Retornar la fecha actual en zona horaria de Colombia (UTC-5)
        const nowColombia = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Bogota' }));
        result = {
          year: nowColombia.getFullYear(),
          month: nowColombia.getMonth() + 1,
          day: nowColombia.getDate()
        };
        break;

      default:
        return res.status(404).json({
          success: false,
          error: `Function '${functionName}' not found`,
          availableFunctions: [
            'getCitizenServer', 'fetchCrmByEmail', 'fetchCrmByCelular', 'fetchCrmStrapiOnly', 'sincronizarCrmPorNumeroDocumento', 'fetchCrmStrapiBatch',
            'updateCelularCRM', 'updateCelularStrapiCarteras', 'updateCelularFR360Links',
            'getProductosServer', 'getProductosCatalog', 'getActiveMembershipPlans', 'getProductHandleFromFRAPP',
            'getCallbellContact', 'sendWhatsAppMessage', 'checkMessageStatus',
            'traerMembresiasServer', 'fetchMembresiasFRAPP', 'registerMembFRAPP', 'updateMembershipFRAPP', 'updateUserFRAPP',
            'fetchVentas', 'fetchFacturaciones', 'fetchAcuerdos', 'getComerciales', 'updateVentaComercial', 'updateFacturacion', 'processSinglePayment', 'crearAcuerdo', 'consultarAcuerdo',
            'fetchCarteraByAcuerdo', 'fetchAnticipadosPendientes',
            'obtenerCandidatosDesbloqueo', 'desbloquearUsuario',
            'obtenerCandidatosBloqueo', 'bloquearUsuario',
            'getLinksByIdentityDocument', 'getUserEmail', 'getColombiaTodayParts',
            'createClickUpTask'
          ]
        });
    }

    // Enviar respuesta exitosa
    res.json({
      success: true,
      result: result
    });

  } catch (error) {
    console.error(`❌ Error in ${functionName}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.details || null
    });
  }
});

// Obtener datos de ciudadano por UID
app.get('/api/citizen/:uid', async (req, res) => {
  try {
    const data = await fr360Service.getCitizen(req.params.uid);
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error getting citizen:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener productos (nombres)
app.get('/api/products', async (req, res) => {
  try {
    const products = await strapiService.getProducts({ mode: 'names' });
    res.json({ success: true, data: products });
  } catch (error) {
    console.error('Error getting products:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener catálogo completo de productos
app.get('/api/products/catalog', async (req, res) => {
  try {
    const catalog = await strapiService.getProducts({ mode: 'catalog' });
    res.json({ success: true, data: catalog });
  } catch (error) {
    console.error('Error getting catalog:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener descripción de un producto
app.get('/api/products/description/:productName', async (req, res) => {
  try {
    const description = await strapiService.getProducts({
      mode: 'description',
      productName: req.params.productName
    });
    res.json({ success: true, data: description });
  } catch (error) {
    console.error('Error getting product description:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Crear link de pago
app.post('/api/payment-link', async (req, res) => {
  try {
    const result = await fr360Service.createPaymentLink(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error creating payment link:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Guardar link de pago en base de datos
app.post('/api/payment-link/save', async (req, res) => {
  try {
    const result = await fr360Service.savePaymentLinkToDatabase(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error saving payment link:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener ventas por UID
app.get('/api/ventas/:uid', async (req, res) => {
  try {
    const ventas = await strapiService.fetchVentas(req.params.uid);
    res.json({ success: true, data: ventas });
  } catch (error) {
    console.error('Error getting ventas:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener acuerdos por UID
app.get('/api/acuerdos/:uid', async (req, res) => {
  try {
    const acuerdos = await strapiService.fetchAcuerdos(req.params.uid);
    res.json({ success: true, data: acuerdos });
  } catch (error) {
    console.error('Error getting acuerdos:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Consultar acuerdo por número
app.get('/api/acuerdo/:nroAcuerdo', async (req, res) => {
  try {
    const acuerdo = await strapiService.consultarAcuerdo(req.params.nroAcuerdo);
    res.json(acuerdo);
  } catch (error) {
    console.error('Error consulting acuerdo:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener membresías (FRAPP)
app.get('/api/membresias/:uid', async (req, res) => {
  try {
    const membresias = await frappService.fetchMembresiasFRAPP(req.params.uid);
    res.json({ success: true, data: membresias });
  } catch (error) {
    console.error('Error getting membresias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener membresías antiguas (WordPress)
app.get('/api/membresias/old/:uid', async (req, res) => {
  try {
    const membresias = await oldMembershipService.traerMembresiasServer(req.params.uid);
    res.json({ success: true, data: membresias });
  } catch (error) {
    console.error('Error getting old membresias:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Registrar membresía
app.post('/api/membresias', async (req, res) => {
  try {
    const result = await frappService.registerMembFRAPP(req.body);
    res.json(result);
  } catch (error) {
    console.error('Error registering membership:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Actualizar membresía
app.put('/api/membresias/:membershipId', async (req, res) => {
  try {
    const { changedById, reason, changes } = req.body;
    const result = await frappService.updateMembershipFRAPP(
      req.params.membershipId,
      changedById,
      reason,
      changes
    );
    res.json(result);
  } catch (error) {
    console.error('Error updating membership:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener planes de membresía activos
app.get('/api/membership-plans', async (req, res) => {
  try {
    const plans = await frappService.getActiveMembershipPlans();
    res.json({ success: true, data: plans });
  } catch (error) {
    console.error('Error getting membership plans:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener links de pago por UID
app.get('/api/links/:uid', async (req, res) => {
  try {
    const links = await fr360Service.getLinksByIdentityDocument(req.params.uid);
    res.json({ success: true, data: links });
  } catch (error) {
    console.error('Error getting payment links:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Eliminar link de pago por ID
app.delete('/api/payment-link/:linkId', async (req, res) => {
  try {
    const result = await fr360Service.deletePaymentLink(req.params.linkId);
    res.json(result);
  } catch (error) {
    console.error('Error deleting payment link:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Retomas Udea - Obtener links de pago no pagados para Udea 2026
app.get('/api/retomas-udea', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    const axios = require('axios');

    // 1. Obtener todos los payment links de Udea 2026
    console.log('📋 Fetching payment links for Udea 2026...');
    let allPaymentLinks = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await axios.get('https://fr360-7cwi.onrender.com/api/v1/payment-links/list', {
        params: {
          pageSize: 100,
          productStartsWith: 'Curso Intensivo UDEA 2026',
          page
        },
        headers: {
          'Authorization': `Bearer ${process.env.FR360_BEARER_TOKEN}`
        }
      });

      if (response.data && response.data.data && response.data.data.length > 0) {
        allPaymentLinks = allPaymentLinks.concat(response.data.data);
        page++;
        // Si recibimos menos de 100, ya no hay más páginas
        if (response.data.data.length < 100) {
          hasMore = false;
        }
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Total payment links fetched: ${allPaymentLinks.length}`);

    // 2. Filtrar solo los productos específicos
    const targetProducts = [
      'Élite - 12 meses - Cuota 1',
      'Curso Intensivo UDEA 2026'
    ];

    const filteredLinks = allPaymentLinks.filter(link =>
      targetProducts.includes(link.product)
    );

    console.log(`🔍 Filtered to target products: ${filteredLinks.length}`);

    // 3. Obtener TODAS las facturaciones de Udea 2026 de Strapi en una sola consulta
    console.log('📊 Obteniendo facturaciones de Udea 2026 desde Strapi...');
    let allFacturaciones = [];
    let strapiPage = 1;
    let hasMoreFacturaciones = true;

    while (hasMoreFacturaciones) {
      try {
        const strapiResponse = await axios.get(
          `https://strapi-project-d3p7.onrender.com/api/facturaciones`,
          {
            params: {
              'filters[producto][nombre][$contains]': 'UDEA 2026',
              'pagination[page]': strapiPage,
              'pagination[pageSize]': 100
            },
            headers: {
              'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
            }
          }
        );

        const data = strapiResponse.data.data || [];
        allFacturaciones = allFacturaciones.concat(data);

        const pagination = strapiResponse.data.meta?.pagination;
        if (pagination && strapiPage < pagination.pageCount) {
          strapiPage++;
        } else {
          hasMoreFacturaciones = false;
        }
      } catch (error) {
        console.error('❌ Error fetching facturaciones from Strapi:', error.message);
        hasMoreFacturaciones = false;
      }
    }

    console.log(`✅ Total facturaciones Udea 2026 en Strapi: ${allFacturaciones.length}`);

    // 4. Crear un Set con todos los invoiceIds que SÍ están pagados
    const paidInvoiceIds = new Set(
      allFacturaciones
        .map(f => f.transaccion)
        .filter(Boolean)
    );

    console.log(`💰 Total invoiceIds pagados: ${paidInvoiceIds.size}`);

    // 5. Filtrar links que NO están en el Set de pagados
    const unpaidLinks = filteredLinks.filter(link => {
      if (!link.invoiceId) {
        console.log(`⚠️ Link sin invoiceId: ${link.identityDocument} - ${link.givenName}`);
        return false;
      }

      const isPaid = paidInvoiceIds.has(link.invoiceId);

      if (!isPaid) {
        console.log(`✅ Link NO pagado encontrado: ${link.invoiceId} - ${link.identityDocument}`);
      }

      return !isPaid;
    });

    console.log(`💰 Unpaid links found: ${unpaidLinks.length}`);

    // 6. Extraer cédulas únicas de los links no pagados
    const uniqueIdentityDocuments = [...new Set(
      unpaidLinks
        .map(link => link.identityDocument)
        .filter(Boolean)
    )];

    console.log(`📋 Cédulas únicas con links no pagados: ${uniqueIdentityDocuments.length}`);

    // 7. Verificar si estas cédulas YA compraron "Curso Intensivo UDEA 2026" con otro link
    console.log('🔍 Verificando si las cédulas ya compraron Curso Intensivo UDEA 2026 con otro link...');

    const documentosQueYaCompraron = new Set();

    // Strapi tiene límite de longitud en URL, así que hacemos batch de 50 cédulas a la vez
    const batchSize = 50;
    for (let i = 0; i < uniqueIdentityDocuments.length; i += batchSize) {
      const batch = uniqueIdentityDocuments.slice(i, i + batchSize);

      let batchPage = 1;
      let hasMoreBatch = true;

      while (hasMoreBatch) {
        try {
          const verificacionResponse = await axios.get(
            `https://strapi-project-d3p7.onrender.com/api/facturaciones`,
            {
              params: {
                'filters[numero_documento][$in]': batch,
                'filters[producto][nombre][$startsWith]': 'Curso Intensivo UDEA 2026',
                'pagination[page]': batchPage,
                'pagination[pageSize]': 100
              },
              headers: {
                'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
              }
            }
          );

          const facturaciones = verificacionResponse.data.data || [];

          // Agregar las cédulas que encontramos al Set
          facturaciones.forEach(f => {
            if (f.numero_documento) {
              documentosQueYaCompraron.add(f.numero_documento);
            }
          });

          const pagination = verificacionResponse.data.meta?.pagination;
          if (pagination && batchPage < pagination.pageCount) {
            batchPage++;
          } else {
            hasMoreBatch = false;
          }
        } catch (error) {
          console.error(`❌ Error verificando batch de cédulas:`, error.message);
          hasMoreBatch = false;
        }
      }
    }

    console.log(`❌ Cédulas que YA compraron con otro link: ${documentosQueYaCompraron.size}`);

    // 8. Filtrar links excluyendo las cédulas que ya compraron
    const linksRealesmenteNoComprados = unpaidLinks.filter(link => {
      return !documentosQueYaCompraron.has(link.identityDocument);
    });

    console.log(`✅ Links realmente no comprados (sin falsos positivos): ${linksRealesmenteNoComprados.length}`);

    // 9. Extraer identityDocument únicos con información completa
    const uniqueContacts = new Map();

    linksRealesmenteNoComprados.forEach(link => {
      const doc = link.identityDocument;
      if (doc && !uniqueContacts.has(doc)) {
        uniqueContacts.set(doc, {
          identityDocument: doc,
          givenName: link.givenName || '',
          familyName: link.familyName || '',
          email: link.email || '',
          phone: link.phone || '',
          product: link.product,
          invoiceId: link.invoiceId,
          createdAt: link.createdAt
        });
      }
    });

    const result = Array.from(uniqueContacts.values());

    console.log(`👥 Contactos finales para retoma (sin falsos positivos): ${result.length}`);

    res.json({
      success: true,
      data: result,
      summary: {
        totalLinks: allPaymentLinks.length,
        filteredLinks: filteredLinks.length,
        unpaidLinks: unpaidLinks.length,
        documentosYaCompraron: documentosQueYaCompraron.size,
        linksReales: linksRealesmenteNoComprados.length,
        uniqueContacts: result.length
      }
    });

  } catch (error) {
    console.error('❌ Error in retomas-udea:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint optimizado para traer TODAS las carteras de Udea 2026 en batch
app.get('/api/carteras-udea2026', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    const axios = require('axios');

    console.log('📊 Fetching ALL Udea 2026 carteras from Strapi...');

    let allCarteras = [];
    let page = 1;
    let hasMore = true;

    // Fetch all pages of carteras with producto containing "UDEA 2026"
    while (hasMore) {
      const response = await axios.get(
        `https://strapi-project-d3p7.onrender.com/api/carteras`,
        {
          params: {
            'filters[producto][nombre][$contains]': 'UDEA 2026',
            'pagination[page]': page,
            'pagination[pageSize]': 100
          },
          headers: {
            'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
          }
        }
      );

      const data = response.data.data || [];

      // Extract cartera data from Strapi response structure
      const carteras = data.map(item => ({
        id: item.id,
        nro_acuerdo: item.nro_acuerdo,
        valor_total_acuerdo: item.valor_total_acuerdo,
        numero_documento: item.numero_documento,
        producto: item.producto
      }));

      allCarteras = allCarteras.concat(carteras);

      const pagination = response.data.meta?.pagination;
      if (pagination && page < pagination.pageCount) {
        page++;
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Total carteras Udea 2026 encontradas: ${allCarteras.length}`);

    res.json({
      success: true,
      data: allCarteras,
      total: allCarteras.length
    });

  } catch (error) {
    console.error('❌ Error fetching carteras Udea 2026:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Obtener CRM por UID
app.get('/api/crm/:uid', async (req, res) => {
  try {
    const crm = await strapiService.fetchCrmStrapiOnly(req.params.uid);
    res.json({ success: true, data: crm });
  } catch (error) {
    console.error('Error getting CRM:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Obtener CRM por email
app.get('/api/crm/email/:email', async (req, res) => {
  try {
    const crm = await strapiService.fetchCrmByEmail(req.params.email);
    res.json({ success: true, data: crm });
  } catch (error) {
    console.error('Error getting CRM by email:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Enviar mensaje de WhatsApp
app.post('/api/whatsapp/send', async (req, res) => {
  try {
    const { phoneNumber, product, linkURL } = req.body;
    const result = await callbellService.sendWhatsAppMessage(phoneNumber, product, linkURL);
    res.json(result);
  } catch (error) {
    console.error('Error sending WhatsApp:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verificar estado de mensaje WhatsApp
app.get('/api/whatsapp/status/:uuid', async (req, res) => {
  try {
    const status = await callbellService.checkMessageStatus(req.params.uuid);
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('Error checking message status:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Manejo de errores 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.path
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  console.error('Error global:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   🚀 FR360 Server Running             ║
║                                        ║
║   Port: ${PORT.toString().padEnd(31)}║
║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(23)}║
║   URL: http://localhost:${PORT.toString().padEnd(17)}║
╚════════════════════════════════════════╝
  `);
});
