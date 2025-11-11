// index.js - FR360 Commercial Management Panel
require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');

// Importar servicios
const strapiService = require('./services/strapiService');
const fr360Service = require('./services/fr360Service');
const frappService = require('./services/frappService');
const callbellService = require('./services/callbellService');
const oldMembershipService = require('./services/oldMembershipService');
const clickupService = require('./services/clickupService');

// Importar middleware de autenticación
const { ensureAuthenticated, ensureDomain, ensureSpecialUser } = require('./middleware/auth');

// Importar rutas de autenticación
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

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
    console.log('[ePayco] Fetching last 100 transactions (2 pages)');

    // Paso 1: Obtener token dinámico
    const token = await getEpaycoToken();

    // Paso 2: Consultar múltiples páginas para obtener más transacciones
    // La API limita a 50 por página, así que hacemos 2 requests
    const page1Response = await fetch('https://apify.epayco.co/transaction?limit=50&page=1', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!page1Response.ok) {
      const errorText = await page1Response.text();
      console.error(`[ePayco] Error page 1: ${errorText}`);
      return res.status(page1Response.status).json({ success: false, error: errorText });
    }

    const page1Data = await page1Response.json();
    console.log(`[ePayco] Page 1 fetched: ${page1Data?.data?.data?.length || 0} transactions`);

    // Página 2
    const page2Response = await fetch('https://apify.epayco.co/transaction?limit=50&page=2', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!page2Response.ok) {
      console.warn('[ePayco] Page 2 failed, returning only page 1');
      return res.json(page1Data);
    }

    const page2Data = await page2Response.json();
    console.log(`[ePayco] Page 2 fetched: ${page2Data?.data?.data?.length || 0} transactions`);

    // Combinar ambas páginas
    const combinedData = {
      ...page1Data,
      data: {
        ...page1Data.data,
        data: [...(page1Data.data?.data || []), ...(page2Data.data?.data || [])]
      }
    };

    console.log(`[ePayco] Total transactions: ${combinedData.data.data.length}`);

    res.json(combinedData);
  } catch (error) {
    console.error('[ePayco] Error fetching transactions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint: Actualización Masiva de Carteras (MUST BE BEFORE GENERIC HANDLER)
// Procesa N acuerdos con estado_pago null y los actualiza usando la lógica de Acuerdos
app.post('/api/carteras-masivo', ensureAuthenticated, ensureDomain, async (req, res) => {
  try {
    const axios = require('axios');
    const cantidad = parseInt(req.query.cantidad) || 10;

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

    console.log(`📊 Iniciando actualización masiva de ${cantidad} acuerdos...`);

    // 1. Obtener carteras con estado_pago null para identificar acuerdos pendientes
    console.log('🔍 Consultando carteras con estado_pago null...');
    const carterasNullResponse = await axios.get(
      `https://strapi-project-d3p7.onrender.com/api/carteras`,
      {
        params: {
          'filters[estado_pago][$null]': true,
          'pagination[page]': 1,
          'pagination[pageSize]': cantidad * 10, // Traer más registros para encontrar N acuerdos únicos
          'populate': 'producto'
        },
        headers: {
          'Authorization': `Bearer ${process.env.STRAPI_TOKEN}`
        }
      }
    );

    const carterasNull = carterasNullResponse.data.data || [];
    console.log(`✅ Encontradas ${carterasNull.length} carteras con estado_pago null`);

    if (carterasNull.length === 0) {
      return res.json({
        success: true,
        message: 'No hay carteras pendientes de actualizar',
        acuerdos_procesados: 0,
        cuotas_actualizadas: 0,
        acuerdos: []
      });
    }

    // 2. Identificar acuerdos únicos (numero_documento + nro_acuerdo)
    const acuerdosUnicos = new Map();
    carterasNull.forEach(item => {
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

    // Limitar a la cantidad solicitada de acuerdos
    const acuerdosAProcesar = Array.from(acuerdosUnicos.values()).slice(0, cantidad);
    console.log(`📋 Identificados ${acuerdosAProcesar.length} acuerdos únicos a procesar`);

    // 3. Para cada acuerdo, traer TODAS sus cuotas de Strapi
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

          // PASO 1: Buscar PRIMERO por id_pago (más confiable y directo)
          if (cuota.id_pago) {
            ventasMatch = facturaciones.filter(f => {
              const transaccion = String(f.transaccion || '').trim();
              return transaccion === String(cuota.id_pago).trim();
            });

            if (ventasMatch.length > 0) {
              console.log(`  🎯 Cuota ${cuotaNro} encontrada por id_pago: ${cuota.id_pago}`);
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
            console.log(`  ✅ Cuota ${cuotaNro}: Pagado (${fechaPago})`);
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
              console.log(`  ✅ Cuota ${cuotaNro}: ${estadoPago}`);
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

      // === UDEA 2026 ===
      case 'fetchUdea2026Facturaciones':
        result = await strapiService.fetchUdea2026Facturaciones();
        break;

      case 'fetchCarteraByAcuerdo':
        result = await strapiService.fetchCarteraByAcuerdo(args[0]);
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
            'getCitizenServer', 'fetchCrmByEmail', 'fetchCrmStrapiOnly', 'sincronizarCrmPorNumeroDocumento', 'fetchCrmStrapiBatch',
            'getProductosServer', 'getProductosCatalog', 'getActiveMembershipPlans', 'getProductHandleFromFRAPP',
            'getCallbellContact', 'sendWhatsAppMessage', 'checkMessageStatus',
            'traerMembresiasServer', 'fetchMembresiasFRAPP', 'registerMembFRAPP', 'updateMembershipFRAPP', 'updateUserFRAPP',
            'fetchVentas', 'fetchFacturaciones', 'fetchAcuerdos', 'getComerciales', 'updateVentaComercial', 'processSinglePayment', 'crearAcuerdo', 'consultarAcuerdo',
            'fetchUdea2026Facturaciones', 'fetchCarteraByAcuerdo',
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
