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
    const response = await fetch(`${process.env.FACTURADOR_WEBHOOK_BASE_URL}/api/webhooks/recent`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.FACTURADOR_WEBHOOK_BEARER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching webhooks:', error);
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
        result = await frappService.saveConfianzaRecord(args[0]);
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
            'getProductosServer', 'getProductosCatalog', 'getActiveMembershipPlans',
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
