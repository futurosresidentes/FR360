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
app.use(session({
  secret: process.env.SESSION_SECRET || 'fr360-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  proxy: true, // Trust the reverse proxy
  cookie: {
    secure: true, // Always use secure cookies in Render (HTTPS)
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
// Aplicar middleware de autenticación a todas las rutas /api/*
app.use('/api/*', ensureAuthenticated, ensureDomain);

// Universal POST handler for API client compatibility
// Mapea las llamadas POST del cliente a las funciones de servicio correctas
app.post('/api/:functionName', async (req, res) => {
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

      case 'saveConfianzaRecord':
        result = await frappService.saveConfianzaRecord(args[0]);
        break;

      // === SALES & AGREEMENTS ===
      case 'fetchVentas':
        result = await strapiService.fetchVentas(args[0]);
        break;

      case 'fetchAcuerdos':
        result = await strapiService.fetchAcuerdos(args[0]);
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

      // === LINKS ===
      case 'getLinksByIdentityDocument':
        result = await fr360Service.getLinksByIdentityDocument(args[0]);
        break;

      // === USER ===
      case 'getUserEmail':
        result = req.user.email;
        break;

      default:
        return res.status(404).json({
          success: false,
          error: `Function '${functionName}' not found`,
          availableFunctions: [
            'getCitizenServer', 'fetchCrmByEmail', 'fetchCrmStrapiOnly', 'sincronizarCrmPorNumeroDocumento',
            'getProductosServer', 'getProductosCatalog', 'getActiveMembershipPlans',
            'getCallbellContact', 'sendWhatsAppMessage', 'checkMessageStatus',
            'traerMembresiasServer', 'fetchMembresiasFRAPP', 'registerMembFRAPP', 'updateMembershipFRAPP',
            'fetchVentas', 'fetchAcuerdos', 'processSinglePayment', 'crearAcuerdo', 'consultarAcuerdo',
            'getLinksByIdentityDocument', 'getUserEmail'
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
