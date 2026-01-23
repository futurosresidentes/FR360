/**
 * World Office Service
 * Maneja las operaciones de facturación con World Office:
 * 1. Buscar o crear cliente (findOrCreateCustomer)
 * 2. Crear factura (createInvoice)
 * 3. Contabilizar factura (accountInvoice)
 * 4. Emitir ante la DIAN (emitDianInvoice)
 */

const axios = require('axios');
const cityCache = require('./worldOfficeCityCache');

// Configuración desde variables de entorno
const WO_API_URL = process.env.WORLDOFFICE_API_URL;
const WO_API_TOKEN = process.env.WORLDOFFICE_API_TOKEN;
const WO_MODO_PRODUCCION = process.env.WORLDOFFICE_MODO_PRODUCCION === 'true';
const WO_EMITIR_DIAN = process.env.WORLDOFFICE_EMITIR_DIAN === 'true';
const WO_MAX_RETRIES = parseInt(process.env.WORLDOFFICE_MAX_RETRIES || '3');
const WO_RETRY_DELAY = parseInt(process.env.WORLDOFFICE_RETRY_DELAY || '1000');

// Cliente axios configurado
const woClient = axios.create({
  baseURL: WO_API_URL,
  timeout: 120000, // 2 minutos
  headers: {
    'Content-Type': 'application/json',
    'Authorization': WO_API_TOKEN
  }
});

// ============ CONSTANTES ============

// ISBNs por categoría
const ISBNS_BASICAS = [
  "978-628-95885-0-7",
  "978-628-95885-1-4",
  "978-628-95885-2-1",
  "978-628-95885-3-8",
  "978-628-95885-5-2",
  "978-628-96023-4-0",
  "978-628-96023-5-7",
  "978-628-96023-7-1",
  "978-628-96166-3-7",
  "978-628-96023-9-5",
  "978-628-96023-8-8"
];

const ISBNS_CLINICAS = [
  "978-628-95885-4-5",
  "978-628-95885-6-9",
  "978-628-95885-7-6",
  "978-628-96023-0-2",
  "978-628-96023-1-9",
  "978-628-96023-2-6",
  "978-628-96023-3-3",
  "978-628-96023-6-4",
  "978-628-96166-5-1",
  "978-628-96166-4-4",
  "978-628-96166-2-0",
  "978-628-96166-1-3",
  "978-628-96166-0-6"
];

const ISBNS_TODOS = [...ISBNS_BASICAS, ...ISBNS_CLINICAS];

// Tope exento de IVA (24 libros × $200,000)
const TOPE_EXENTO_IVA = 4800000;

// Mapeo de productos a inventarios
const PRODUCT_INVENTORY_MAP = {
  'iaura': { id: 1004, hasIVA: true, centroCosto: 1 },
  'sculapp': { id: 1008, hasIVA: true, centroCosto: 2 },
  'asesoria': { id: 1003, hasIVA: true, centroCosto: 1 },
  'publicidad': { id: 1062, hasIVA: true, centroCosto: 2 },
  'simulacion': { id: 1054, hasIVA: true, centroCosto: 1 },
  'acceso vip': { id: 1057, hasIVA: true, centroCosto: 1 },
  'ingles': { id: 1059, hasIVA: true, centroCosto: 1 },
  'vip - rmastery': { id: 1067, hasIVA: true, centroCosto: 1 },
  'default': { id: 1010, hasIVA: false, centroCosto: 1 } // FR Libros (sin IVA)
};

// ID del inventario MIR (para excedente con IVA)
const MIR_INVENTORY_ID = 1001;

// Mapeo de comerciales a IDs de World Office
const COMERCIALES_MAP = {
  'Santiago Flórez Rojo': 1016,
  'Lorena Blandón Carmona': 1024,
  'Giancarlo Aguilar Fonnegra': 1013,
  'Ángela Yirley Silva David': 1006,
  'Angélica Solórzano Torres': 2259,
  'Daniel Cardona': 2259
};

const DEFAULT_COMERCIAL_ID = 2259;
const DEFAULT_CITY_ID = 1; // Medellín

// ============ HELPERS ============

/**
 * Retry helper con backoff
 */
async function retryWithBackoff(fn, maxRetries = WO_MAX_RETRIES, retryDelay = WO_RETRY_DELAY) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      // No reintentar errores no recuperables
      const status = error.response?.status;
      if (status === 400 || status === 401 || status === 403 || status === 404) {
        throw error;
      }

      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1);
        console.log(`[WO] ⏱️ Reintento ${attempt}/${maxRetries} en ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Obtiene la fecha actual en formato Colombia (YYYY-MM-DD)
 */
function getColombiaDate() {
  const now = new Date();
  // Ajustar a UTC-5 (Colombia)
  const colombiaOffset = -5 * 60;
  const localOffset = now.getTimezoneOffset();
  const colombiaTime = new Date(now.getTime() + (localOffset - colombiaOffset) * 60000);

  return colombiaTime.toISOString().split('T')[0];
}

/**
 * Separa un nombre completo en sus partes
 */
function parseFullName(givenName, familyName) {
  const nombres = (givenName || '').trim().split(/\s+/);
  const apellidos = (familyName || '').trim().split(/\s+/);

  return {
    primerNombre: nombres[0] || '',
    segundoNombre: nombres.slice(1).join(' ') || '',
    primerApellido: apellidos[0] || '',
    segundoApellido: apellidos.slice(1).join(' ') || ''
  };
}

/**
 * Obtiene el ID del comercial en World Office
 */
function getComercialWOId(comercialName) {
  if (!comercialName) return DEFAULT_COMERCIAL_ID;

  // Buscar coincidencia exacta
  if (COMERCIALES_MAP[comercialName]) {
    return COMERCIALES_MAP[comercialName];
  }

  // Buscar coincidencia parcial (normalizada)
  const normalizedSearch = comercialName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  for (const [name, id] of Object.entries(COMERCIALES_MAP)) {
    const normalizedName = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (normalizedName.includes(normalizedSearch) || normalizedSearch.includes(normalizedName)) {
      return id;
    }
  }

  return DEFAULT_COMERCIAL_ID;
}

/**
 * Obtiene la configuración de inventario para un producto
 */
function getInventoryConfig(productName) {
  if (!productName) return PRODUCT_INVENTORY_MAP.default;

  const normalizedProduct = productName.toLowerCase();

  for (const [key, config] of Object.entries(PRODUCT_INVENTORY_MAP)) {
    if (key !== 'default' && normalizedProduct.includes(key)) {
      return config;
    }
  }

  return PRODUCT_INVENTORY_MAP.default;
}

/**
 * Obtiene los ISBNs según el tipo de producto
 */
function getISBNsForProduct(productName) {
  if (!productName) return ISBNS_TODOS;

  const normalizedProduct = productName.toLowerCase();

  // UDEA solo usa ISBNs de clínicas
  if (normalizedProduct.includes('udea') || normalizedProduct.includes('intensivo')) {
    return ISBNS_CLINICAS;
  }

  // Productos Élite usan todos los ISBNs
  return ISBNS_TODOS;
}

/**
 * Construye los renglones de la factura
 */
function buildInvoiceLines(amount, productName, bookOffset = 0) {
  const allIsbns = getISBNsForProduct(productName);
  const inventoryConfig = getInventoryConfig(productName);

  // Calcular cuántos ISBNs incluir según el monto (cada libro = $200,000)
  const PRECIO_POR_LIBRO = 200000;
  const disponibles = Math.max(allIsbns.length - bookOffset, 1);
  const cantidadLibros = Math.min(Math.ceil(amount / PRECIO_POR_LIBRO), disponibles);
  const isbns = allIsbns.slice(bookOffset, bookOffset + cantidadLibros);
  const isbnsConcepto = `ISBNS: ${isbns.join(', ')}`;

  const renglones = [];

  // Si el producto tiene IVA específico (no es libros)
  if (inventoryConfig.id !== 1010) {
    renglones.push({
      idInventario: inventoryConfig.id,
      unidadMedida: 'und',
      cantidad: 1,
      valorUnitario: amount,
      valorTotal: amount,
      idBodega: 1,
      idCentroCosto: inventoryConfig.centroCosto,
      concepto: productName || 'Servicio',
      porDescuento: 0,
      obsequio: false,
      valorTotalRenglon: 0
    });
    return renglones;
  }

  // Para productos de libros (FR Libros sin IVA)
  if (amount <= TOPE_EXENTO_IVA) {
    // Un solo renglón sin IVA
    renglones.push({
      idInventario: 1010, // FR Libros
      unidadMedida: 'und',
      cantidad: 1,
      valorUnitario: amount,
      valorTotal: amount,
      idBodega: 1,
      idCentroCosto: 1,
      concepto: isbnsConcepto,
      porDescuento: 0,
      obsequio: false,
      valorTotalRenglon: 0
    });
  } else {
    // Dos renglones: FR Libros (tope) + MIR (excedente con IVA)
    renglones.push({
      idInventario: 1010, // FR Libros (sin IVA)
      unidadMedida: 'und',
      cantidad: 1,
      valorUnitario: TOPE_EXENTO_IVA,
      valorTotal: TOPE_EXENTO_IVA,
      idBodega: 1,
      idCentroCosto: 1,
      concepto: isbnsConcepto,
      porDescuento: 0,
      obsequio: false,
      valorTotalRenglon: 0
    });

    const excedente = amount - TOPE_EXENTO_IVA;
    renglones.push({
      idInventario: MIR_INVENTORY_ID, // MIR (con IVA)
      unidadMedida: 'und',
      cantidad: 1,
      valorUnitario: excedente,
      valorTotal: excedente,
      idBodega: 1,
      idCentroCosto: 1,
      concepto: 'Excedente con IVA',
      porDescuento: 0,
      obsequio: false,
      valorTotalRenglon: 0
    });
  }

  return renglones;
}

// ============ OPERACIONES PRINCIPALES ============

/**
 * 1. Buscar o crear cliente en World Office
 * @param {Object} data - Datos del cliente
 * @param {string} data.identityDocument - Cédula
 * @param {string} data.givenName - Nombres
 * @param {string} data.familyName - Apellidos
 * @param {string} data.email - Correo
 * @param {string} data.phone - Teléfono
 * @param {string} data.address - Dirección
 * @param {string} data.city - Ciudad
 * @param {string} data.comercial - Nombre del comercial
 * @returns {Promise<Object>} { customerId, customerData, comercialWOId, action }
 */
async function findOrCreateCustomer(data) {
  console.log(`[WO] 🔍 Buscando/creando cliente: ${data.identityDocument}`);

  if (!WO_API_URL || !WO_API_TOKEN) {
    throw new Error('World Office no está configurado (faltan WORLDOFFICE_API_URL o WORLDOFFICE_API_TOKEN)');
  }

  // Obtener ID de ciudad
  let cityId = DEFAULT_CITY_ID;
  if (data.city) {
    const cityFound = await cityCache.findCityByName(data.city);
    if (cityFound) {
      cityId = cityFound.id;
    }
  }

  // Obtener ID del comercial
  const comercialWOId = getComercialWOId(data.comercial);

  // Parsear nombres
  const { primerNombre, segundoNombre, primerApellido, segundoApellido } = parseFullName(data.givenName, data.familyName);

  // Payload para crear/actualizar
  const customerPayload = {
    idTerceroTipoIdentificacion: 3, // Cédula de Ciudadanía
    identificacion: data.identityDocument,
    primerNombre,
    segundoNombre,
    primerApellido,
    segundoApellido,
    idCiudad: cityId,
    direccion: data.address || 'Sin dirección',
    telefono: data.phone || '',
    email: data.email || '',
    idClasificacionImpuestos: 1,
    idTerceroTipoContribuyente: 6,
    plazoDias: 1,
    idTerceroTipos: [4], // Cliente
    responsabilidadFiscal: [5, 7]
  };

  return await retryWithBackoff(async (attempt) => {
    console.log(`[WO] Intento ${attempt}: Buscando cliente por cédula...`);

    // 1. Buscar cliente existente
    try {
      const searchResponse = await woClient.get(`/api/v1/terceros/identificacion/${data.identityDocument}`);

      if (searchResponse.data.status === 'OK' && searchResponse.data.data) {
        const existingCustomer = searchResponse.data.data;
        console.log(`[WO] ✅ Cliente encontrado: ID ${existingCustomer.id}`);

        // Actualizar datos del cliente
        try {
          await woClient.put('/api/v1/terceros/editarTercero', {
            ...customerPayload,
            id: existingCustomer.id
          });
          console.log(`[WO] ✅ Cliente actualizado: ID ${existingCustomer.id}`);
        } catch (updateError) {
          console.warn(`[WO] ⚠️ No se pudo actualizar cliente (continuando): ${updateError.message}`);
        }

        return {
          customerId: existingCustomer.id,
          customerData: {
            id: existingCustomer.id,
            name: `${primerNombre} ${segundoNombre} ${primerApellido} ${segundoApellido}`.replace(/\s+/g, ' ').trim(),
            email: data.email,
            phone: data.phone,
            cityId,
            address: data.address,
            document: data.identityDocument
          },
          comercialWOId,
          action: 'updated'
        };
      }
    } catch (searchError) {
      // 404 significa que no existe, continuar a crear
      if (searchError.response?.status !== 404) {
        throw searchError;
      }
    }

    // 2. Crear nuevo cliente
    console.log(`[WO] Cliente no encontrado, creando nuevo...`);

    const createResponse = await woClient.post('/api/v1/terceros/crearTercero', customerPayload);

    if (createResponse.data.status === 'OK' && createResponse.data.data?.id) {
      const newCustomerId = createResponse.data.data.id;
      console.log(`[WO] ✅ Cliente creado: ID ${newCustomerId}`);

      return {
        customerId: newCustomerId,
        customerData: {
          id: newCustomerId,
          name: `${primerNombre} ${segundoNombre} ${primerApellido} ${segundoApellido}`.replace(/\s+/g, ' ').trim(),
          email: data.email,
          phone: data.phone,
          cityId,
          address: data.address,
          document: data.identityDocument
        },
        comercialWOId,
        action: 'created'
      };
    }

    throw new Error(`Respuesta inesperada al crear cliente: ${JSON.stringify(createResponse.data)}`);
  });
}

/**
 * 2. Crear factura en World Office
 * @param {Object} data - Datos de la factura
 * @param {number} data.customerId - ID del cliente en WO
 * @param {number} data.comercialWOId - ID del comercial en WO
 * @param {number} data.amount - Monto total
 * @param {string} data.productName - Nombre del producto
 * @returns {Promise<Object>} { documentoId, numeroFactura, total, subtotal, ivaTotal, renglones }
 */
async function createInvoice(data) {
  console.log(`[WO] 📄 Creando factura para cliente ${data.customerId}, monto: $${data.amount}`);

  if (!WO_MODO_PRODUCCION) {
    console.log('[WO] ⚠️ Modo simulación activo - No se creará factura real');
    return {
      simulado: true,
      documentoId: 99999,
      numeroFactura: 'SIM-' + Date.now(),
      total: data.amount,
      subtotal: data.amount,
      ivaTotal: 0
    };
  }

  const renglones = buildInvoiceLines(data.amount, data.productName, data.bookOffset || 0);

  const invoicePayload = {
    fecha: getColombiaDate(),
    prefijo: 16,
    concepto: data.productName || 'Factura',
    documentoTipo: 'FV',
    idEmpresa: 1,
    idTerceroExterno: data.customerId,
    idTerceroInterno: data.comercialWOId || DEFAULT_COMERCIAL_ID,
    idFormaPago: 1001,
    idMoneda: 31,
    trm: 1,
    porcentajeDescuento: false,
    porcentajeTodosRenglones: false,
    valDescuento: 0,
    reglones: renglones
  };

  console.log(`[WO] Creando factura...`);

  const response = await woClient.post('/api/v1/documentos/crearDocumentoVenta', invoicePayload);

  const resData = response.data;
  if (resData.status === 'OK' || resData.status === 'CREATED' || resData.data?.id) {
    const docData = resData.data || {};
    const result = {
      simulado: false,
      documentoId: docData.id || resData.documentoId,
      numeroFactura: docData.numero || resData.numeroFactura,
      total: resData.total || data.amount,
      subtotal: resData.subtotal || data.amount,
      ivaTotal: resData.ivaTotal || 0,
      concepto: docData.concepto || data.productName
    };

    console.log(`[WO] ✅ Factura creada: Nro ${result.numeroFactura}, Doc ID ${result.documentoId}`);
    return result;
  }

  throw new Error(`Respuesta inesperada al crear factura: ${JSON.stringify(resData)}`);
}

/**
 * 3. Contabilizar factura en World Office
 * @param {number} documentoId - ID del documento a contabilizar
 * @returns {Promise<Object>} { status, accountingDate }
 */
async function accountInvoice(documentoId) {
  console.log(`[WO] 📊 Contabilizando factura: Doc ID ${documentoId}`);

  if (!WO_MODO_PRODUCCION) {
    console.log('[WO] ⚠️ Modo simulación activo - No se contabilizará');
    return {
      simulado: true,
      status: 'OK',
      accountingDate: new Date().toISOString()
    };
  }

  return await retryWithBackoff(async (attempt) => {
    console.log(`[WO] Intento ${attempt}: Contabilizando...`);

    const response = await woClient.post(`/api/v1/documentos/contabilizarDocumento/${documentoId}`, {});

    if (response.data.status === 'OK') {
      console.log(`[WO] ✅ Factura contabilizada: Doc ID ${documentoId}`);
      return {
        simulado: false,
        status: 'OK',
        accountingDate: new Date().toISOString()
      };
    }

    throw new Error(`Respuesta inesperada al contabilizar: ${JSON.stringify(response.data)}`);
  });
}

/**
 * 4. Emitir factura ante la DIAN
 * @param {number} documentoId - ID del documento a emitir
 * @returns {Promise<Object>} { status, cufe }
 */
async function emitDianInvoice(documentoId) {
  console.log(`[WO] 🏛️ Emitiendo factura ante DIAN: Doc ID ${documentoId}`);

  if (!WO_MODO_PRODUCCION || !WO_EMITIR_DIAN) {
    console.log('[WO] ⚠️ Emisión DIAN desactivada - No se emitirá');
    return {
      simulado: true,
      status: 'SKIPPED',
      message: 'Emisión DIAN desactivada por configuración'
    };
  }

  return await retryWithBackoff(async (attempt) => {
    console.log(`[WO] Intento ${attempt}: Emitiendo ante DIAN...`);

    try {
      const response = await woClient.post(`/api/v1/documentos/facturaElectronica/${documentoId}`, {});

      if (response.data.status === 'ACCEPTED' || response.data.status === 'OK') {
        console.log(`[WO] ✅ Factura emitida ante DIAN: Doc ID ${documentoId}`);
        return {
          simulado: false,
          status: 'ACCEPTED',
          cufe: response.data.cufe || response.data.data?.cufe
        };
      }

      throw new Error(`Respuesta inesperada de DIAN: ${JSON.stringify(response.data)}`);

    } catch (error) {
      // 409 significa que ya fue emitida, no es error fatal
      if (error.response?.status === 409) {
        console.log(`[WO] ⚠️ Factura ya estaba emitida ante DIAN (409)`);
        return {
          simulado: false,
          status: 'ALREADY_EMITTED',
          message: 'La factura ya fue emitida anteriormente'
        };
      }
      throw error;
    }
  });
}

/**
 * Proceso completo de facturación
 * Ejecuta los 4 pasos en secuencia
 * @param {Object} data - Datos completos del cliente y factura
 * @returns {Promise<Object>} Resultado de todo el proceso
 */
async function processFullInvoice(data) {
  console.log(`[WO] 🚀 Iniciando proceso completo de facturación`);
  console.log(`[WO] Cliente: ${data.givenName} ${data.familyName} (${data.identityDocument})`);
  console.log(`[WO] Producto: ${data.productName}, Monto: $${data.amount}`);

  const result = {
    success: false,
    customer: null,
    invoice: null,
    accounting: null,
    dian: null,
    errors: []
  };

  try {
    // 1. Buscar o crear cliente
    result.customer = await findOrCreateCustomer(data);
    console.log(`[WO] ✅ Paso 1/4 completado: Cliente ${result.customer.action}`);

    // 2. Crear factura
    result.invoice = await createInvoice({
      customerId: result.customer.customerId,
      comercialWOId: result.customer.comercialWOId,
      amount: data.amount,
      productName: data.productName
    });
    console.log(`[WO] ✅ Paso 2/4 completado: Factura ${result.invoice.numeroFactura}`);

    // 3. Contabilizar
    result.accounting = await accountInvoice(result.invoice.documentoId);
    console.log(`[WO] ✅ Paso 3/4 completado: Contabilización OK`);

    // 4. Emitir ante DIAN
    result.dian = await emitDianInvoice(result.invoice.documentoId);
    console.log(`[WO] ✅ Paso 4/4 completado: DIAN ${result.dian.status}`);

    result.success = true;
    console.log(`[WO] 🎉 Proceso completo de facturación exitoso`);

  } catch (error) {
    console.error(`[WO] ❌ Error en proceso de facturación:`, error.message);
    result.errors.push(error.message);
  }

  return result;
}

module.exports = {
  findOrCreateCustomer,
  createInvoice,
  accountInvoice,
  emitDianInvoice,
  processFullInvoice,
  // Helpers exportados para testing
  getComercialWOId,
  getInventoryConfig,
  getISBNsForProduct,
  buildInvoiceLines,
  getColombiaDate,
  // Constantes
  ISBNS_BASICAS,
  ISBNS_CLINICAS,
  ISBNS_TODOS,
  TOPE_EXENTO_IVA,
  COMERCIALES_MAP
};
