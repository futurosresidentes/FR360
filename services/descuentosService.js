/**
 * Descuentos Service
 * Genera descuentos para clientes con cuotas pendientes
 * basándose en carteras y cobranzas de Strapi
 */
const axios = require('axios');
const fr360Service = require('./fr360Service');

const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;

const strapiHeaders = {
  'Authorization': `Bearer ${STRAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

/**
 * Obtiene todas las carteras con estado al_dia o en_mora (firmadas)
 */
async function getCarterasPendientes() {
  const allCarteras = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const url = `${STRAPI_BASE_URL}/api/carteras?filters[$and][0][$or][0][estado_pago][$eq]=al_dia&filters[$and][0][$or][1][estado_pago][$eq]=en_mora&filters[$and][1][estado_firma][$eq]=firmado&populate[producto][fields][0]=nombre&pagination[page]=${page}&pagination[pageSize]=${pageSize}&sort=numero_documento:asc`;

    const response = await axios.get(url, { headers: strapiHeaders });
    const data = response.data.data || [];
    allCarteras.push(...data);

    const { pageCount } = response.data.meta?.pagination || {};
    if (page >= pageCount) break;
    page++;
  }

  return allCarteras;
}

/**
 * Obtiene registros de cobranzas (bloqueos/desbloqueos) para una cédula
 */
async function getCobranzasPorCedula(cedula) {
  const allCobranzas = [];
  let page = 1;

  while (true) {
    const url = `${STRAPI_BASE_URL}/api/cobranzas?filters[numero_documento][$eq]=${encodeURIComponent(cedula)}&filters[$or][0][aviso][$eq]=Bloqueo&filters[$or][1][aviso][$eq]=Desbloqueo&pagination[page]=${page}&pagination[pageSize]=100&sort=createdAt:asc`;

    const response = await axios.get(url, { headers: strapiHeaders });
    const data = response.data.data || [];
    allCobranzas.push(...data);

    const { pageCount } = response.data.meta?.pagination || {};
    if (page >= pageCount) break;
    page++;
  }

  return allCobranzas;
}

/**
 * Calcula los días totales de bloqueo a partir de registros de cobranzas
 */
function calcularDiasBloqueado(cobranzas) {
  let totalDias = 0;
  let ultimoBloqueo = null;

  for (const c of cobranzas) {
    const aviso = c.aviso;
    const fecha = new Date(c.createdAt);

    if (aviso === 'Bloqueo') {
      ultimoBloqueo = fecha;
    } else if (aviso === 'Desbloqueo' && ultimoBloqueo) {
      const diff = (fecha - ultimoBloqueo) / (1000 * 60 * 60 * 24);
      totalDias += Math.max(0, Math.round(diff));
      ultimoBloqueo = null;
    }
  }

  // Si hay un bloqueo sin desbloqueo, contar hasta hoy
  if (ultimoBloqueo) {
    const hoy = new Date();
    const diff = (hoy - ultimoBloqueo) / (1000 * 60 * 60 * 24);
    totalDias += Math.max(0, Math.round(diff));
  }

  return totalDias;
}

/**
 * Calcula días de mora de una cuota
 */
function calcularDiasMora(fechaLimite) {
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const partes = fechaLimite.split('-');
  const limiteUTC = Date.UTC(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
  return Math.floor((hoyUTC - limiteUTC) / (1000 * 60 * 60 * 24));
}

/**
 * Crea un link de pago en ePayco para el descuento
 */
async function crearLinkDescuento(data) {
  const expirationDate = data.fecha_fin.replace(/-/g, '/') + ' 23:59:59';

  const productoLabel = data.producto_nombre ? `${data.producto_nombre} - Pago anticipado` : `Descuento ${data.campana}`;

  const paymentData = {
    identityDocument: data.numero_documento,
    givenName: data.nombres || '',
    familyName: data.apellidos || '',
    email: data.correo || '',
    phone: data.celular || '',
    product: productoLabel,
    description: productoLabel,
    title: 'Futuros Residentes',
    amount: data.valor_con_descuento,
    numberOfPayments: 1,
    quantity: 1,
    onePayment: true,
    currency: 'COP',
    id: 0,
    typeSell: '2',
    tax: 0,
    expirationDate,
    commercial: 'Sistema',
    startType: 'inmediato',
    startDate: data.fecha_inicio
  };

  console.log(`[DESCUENTOS] Creando link ePayco para ${data.numero_documento}: $${data.valor_con_descuento.toLocaleString()}`);
  const result = await fr360Service.createPaymentLink(paymentData);

  if (result.success && result.data) {
    // El link viene anidado en result.data.data.data.routeLink
    const responseData = result.data?.data?.data || result.data?.data || result.data || {};
    const link = responseData.routeLink || responseData.url || responseData.link || '';
    const invoiceId = (responseData.invoceNumber || '').toString();
    const externalId = (responseData.id || '').toString();
    if (link) {
      console.log(`[DESCUENTOS] ✅ Link creado: ${link} | invoiceId: ${invoiceId}`);
    }
    return { link, invoiceId, externalId };
  }

  console.log('[DESCUENTOS] ⚠️ No se pudo crear link:', result.message || 'Error desconocido');
  return { link: '', invoiceId: '', externalId: '' };
}

/**
 * Crea un registro de descuento en Strapi
 */
async function crearDescuento(data) {
  // Crear link de pago
  let linkResult = { link: '', invoiceId: '', externalId: '' };
  try {
    linkResult = await crearLinkDescuento(data);
  } catch (error) {
    console.log(`[DESCUENTOS] ⚠️ Error creando link para ${data.numero_documento}: ${error.message}`);
  }

  const payload = {
    data: {
      numero_documento: data.numero_documento,
      celular: data.celular || '',
      correo: data.correo || '',
      fecha_inicio: data.fecha_inicio,
      fecha_fin: data.fecha_fin,
      valor_normal: data.valor_normal,
      valor_con_descuento: data.valor_con_descuento,
      dias_acceso_extras: data.dias_acceso_extras,
      campana: data.campana || '',
      link: linkResult.link,
      id_factura: linkResult.invoiceId,
      observaciones: data.observaciones || ''
    }
  };

  const response = await axios.post(`${STRAPI_BASE_URL}/api/descuentos`, payload, {
    headers: strapiHeaders
  });

  // Guardar en base de datos FR360
  if (linkResult.link) {
    const linkDataToSave = {
      salesRep: 'Daniel Mauricio Cardona Alzate',
      identityType: 'CC',
      identityDocument: data.numero_documento,
      givenName: data.nombres || '',
      familyName: data.apellidos || '',
      email: data.correo || '',
      phone: data.celular || '',
      product: data.producto_nombre ? `${data.producto_nombre} - Pago anticipado` : `${data.numero_documento} - Pago anticipado`,
      amount: data.valor_con_descuento,
      expiryDate: `${data.fecha_fin}T23:59:00Z`,
      linkURL: linkResult.link,
      invoiceId: linkResult.invoiceId,
      externalId: linkResult.externalId,
      agreementId: data.nro_acuerdo || null,
      service: 'epayco',
      accessDate: data.inicio_plataforma ? `${data.inicio_plataforma}T05:00:00Z` : null
    };

    try {
      const saveResult = await fr360Service.savePaymentLinkToDatabase(linkDataToSave);
      if (saveResult.success) {
        console.log(`[DESCUENTOS] ✅ Link guardado en FR360 DB para ${data.numero_documento}`);
      } else {
        console.log(`[DESCUENTOS] ⚠️ No se pudo guardar link en FR360 DB: ${saveResult.message || 'Error'}`);
      }
    } catch (error) {
      console.log(`[DESCUENTOS] ⚠️ Error guardando link en FR360 DB: ${error.message}`);
    }
  }

  return { ...response.data, link: linkResult.link };
}

/**
 * Obtiene todos los descuentos vigentes
 */
async function getDescuentosVigentes() {
  const hoy = new Date().toISOString().split('T')[0];
  const url = `${STRAPI_BASE_URL}/api/descuentos?filters[fecha_fin][$gte]=${hoy}&pagination[pageSize]=200&sort=createdAt:desc`;

  const response = await axios.get(url, { headers: strapiHeaders });
  return response.data.data || [];
}

/**
 * Obtiene las cédulas que ya tienen descuento en una campaña específica
 */
async function getCedulasEnCampana(campana) {
  const cedulasSet = new Set();
  let page = 1;

  while (true) {
    const url = `${STRAPI_BASE_URL}/api/descuentos?filters[campana][$eq]=${encodeURIComponent(campana)}&pagination[page]=${page}&pagination[pageSize]=200&fields[0]=numero_documento`;

    const response = await axios.get(url, { headers: strapiHeaders });
    const data = response.data.data || [];
    for (const d of data) {
      if (d.numero_documento) cedulasSet.add(d.numero_documento);
    }

    const { pageCount } = response.data.meta?.pagination || {};
    if (page >= pageCount) break;
    page++;
  }

  return cedulasSet;
}

/**
 * Proceso principal: analiza carteras y genera descuentos
 * @param {number} limite - Máximo de clientes a procesar (0 = todos)
 * @param {string} campana - Nombre de la campaña (ej: "Marzo2026")
 * @returns {Promise<Object>} Resultado del proceso
 */
async function generarDescuentos(limite = 1, campana = 'Marzo2026') {
  console.log(`[DESCUENTOS] Iniciando proceso - Campaña: ${campana}`);

  // 0. Obtener cédulas que ya están en esta campaña para no duplicar
  console.log('[DESCUENTOS] 0. Verificando duplicados en campaña...');
  const cedulasYaEnCampana = await getCedulasEnCampana(campana);
  console.log(`[DESCUENTOS] Cédulas ya en campaña "${campana}": ${cedulasYaEnCampana.size}`);

  // 1. Obtener todas las carteras pendientes (al_dia o en_mora, firmadas)
  console.log('[DESCUENTOS] 1. Obteniendo carteras pendientes...');
  const carteras = await getCarterasPendientes();
  console.log(`[DESCUENTOS] Total cuotas pendientes encontradas: ${carteras.length}`);

  // 2. Agrupar por numero_documento
  const porCliente = {};
  for (const c of carteras) {
    const cedula = c.numero_documento;
    if (!cedula) continue;
    if (!porCliente[cedula]) {
      porCliente[cedula] = {
        cedula,
        nombres: c.nombres || '',
        apellidos: c.apellidos || '',
        celular: c.celular || '',
        correo: c.correo || '',
        nro_acuerdo: c.nro_acuerdo || '',
        inicio_plataforma: c.inicio_plataforma || '',
        producto_nombre: '',
        cuotas: []
      };
    }
    porCliente[cedula].cuotas.push(c);
    if (c.celular) porCliente[cedula].celular = c.celular;
    if (c.correo) porCliente[cedula].correo = c.correo;
    if (c.nombres) porCliente[cedula].nombres = c.nombres;
    if (c.apellidos) porCliente[cedula].apellidos = c.apellidos;
    if (c.nro_acuerdo) porCliente[cedula].nro_acuerdo = c.nro_acuerdo;
    if (c.inicio_plataforma) porCliente[cedula].inicio_plataforma = c.inicio_plataforma;
    if (c.producto?.nombre) porCliente[cedula].producto_nombre = c.producto.nombre;
  }

  console.log(`[DESCUENTOS] Clientes únicos con cuotas pendientes: ${Object.keys(porCliente).length}`);

  const hoy = new Date();
  const mesActual = hoy.getMonth(); // 0-indexed (marzo = 2)
  const anioActual = hoy.getFullYear();

  const resultados = [];
  const descartados = { soloMarzo: 0, sinCuotas: 0, yaEnCampana: 0 };

  for (const [cedula, cliente] of Object.entries(porCliente)) {
    // Filtro 0: no duplicar si ya está en esta campaña
    if (cedulasYaEnCampana.has(cedula)) {
      descartados.yaEnCampana++;
      continue;
    }

    const cuotas = cliente.cuotas;

    // Filtro 1: debe tener al menos 1 cuota pendiente
    if (cuotas.length === 0) {
      descartados.sinCuotas++;
      continue;
    }

    // Filtro 2: no puede ser que SOLO tenga cuotas para marzo 2026
    const cuotasNoMarzo = cuotas.filter(c => {
      if (!c.fecha_limite) return true;
      const partes = c.fecha_limite.split('-');
      const mes = parseInt(partes[1]) - 1;
      const anio = parseInt(partes[0]);
      return !(mes === mesActual && anio === anioActual);
    });

    if (cuotasNoMarzo.length === 0) {
      // Todas las cuotas son solo de marzo
      descartados.soloMarzo++;
      continue;
    }

    // 3. Buscar bloqueos/desbloqueos en cobranzas
    console.log(`[DESCUENTOS] Consultando cobranzas para ${cedula}...`);
    const cobranzas = await getCobranzasPorCedula(cedula);
    const diasBloqueado = calcularDiasBloqueado(cobranzas);

    // 4. Calcular valor_normal (suma de cuotas pendientes + recargo 5% si mora >= 6 días)
    let valorNormal = 0;
    for (const cuota of cuotas) {
      const valorCuota = cuota.valor_cuota || 0;
      const valorPagado = cuota.valor_pagado || 0;
      const pendiente = valorCuota - valorPagado;

      if (pendiente <= 0) continue;

      const diasMora = cuota.fecha_limite ? calcularDiasMora(cuota.fecha_limite) : 0;

      if (diasMora >= 6) {
        // Recargo del 5% por mora
        valorNormal += Math.round(pendiente * 1.05);
      } else {
        valorNormal += pendiente;
      }
    }

    if (valorNormal <= 0) continue;

    // 5. Calcular valor con descuento (20% off)
    const valorConDescuento = Math.round(valorNormal * 0.80);

    // 6. Días acceso extras
    let diasAccesoExtras = diasBloqueado - 15;
    if (diasAccesoExtras < 0) diasAccesoExtras = diasBloqueado;

    // 7. Observaciones
    const observaciones = `Días bloqueado: ${diasBloqueado} | Cuotas pendientes: ${cuotas.length} | Bloqueos: ${cobranzas.filter(c => c.aviso === 'Bloqueo').length} | Desbloqueos: ${cobranzas.filter(c => c.aviso === 'Desbloqueo').length}`;

    const descuento = {
      numero_documento: cedula,
      nombres: cliente.nombres,
      apellidos: cliente.apellidos,
      celular: cliente.celular,
      correo: cliente.correo,
      nro_acuerdo: cliente.nro_acuerdo,
      inicio_plataforma: cliente.inicio_plataforma,
      producto_nombre: cliente.producto_nombre,
      campana,
      fecha_inicio: hoy.toISOString().split('T')[0],
      fecha_fin: '2026-03-31',
      valor_normal: valorNormal,
      valor_con_descuento: valorConDescuento,
      dias_acceso_extras: diasAccesoExtras,
      observaciones
    };

    // Crear en Strapi
    console.log(`[DESCUENTOS] Creando descuento para ${cedula}: $${valorNormal.toLocaleString()} → $${valorConDescuento.toLocaleString()} (${diasBloqueado} días bloqueado)`);
    const created = await crearDescuento(descuento);
    resultados.push({ ...descuento, strapiId: created.data?.id || created.data?.documentId });

    if (limite > 0 && resultados.length >= limite) {
      console.log(`[DESCUENTOS] Límite alcanzado: ${limite} cliente(s).`);
      break;
    }
  }

  console.log(`[DESCUENTOS] Proceso terminado. Creados: ${resultados.length}, Ya en campaña: ${descartados.yaEnCampana}, Solo-marzo: ${descartados.soloMarzo}, Sin cuotas: ${descartados.sinCuotas}`);

  return {
    success: true,
    creados: resultados.length,
    descartados,
    resultados
  };
}

/**
 * Verifica qué id_factura ya están pagados consultando facturaciones en lotes de 30
 * @param {string[]} idFacturas - Array de id_factura a verificar
 * @returns {Promise<Set<string>>} Set con los id_factura que están pagados
 */
async function verificarPagosDescuentos(idFacturas) {
  const pagados = new Set();
  const facturas = idFacturas.filter(id => id && id.trim());

  if (facturas.length === 0) return pagados;

  const BATCH_SIZE = 30;
  for (let i = 0; i < facturas.length; i += BATCH_SIZE) {
    const batch = facturas.slice(i, i + BATCH_SIZE);
    const filters = batch.map((id, idx) => `filters[transaccion][$in][${idx}]=${encodeURIComponent(id.trim())}`).join('&');
    const url = `${STRAPI_BASE_URL}/api/facturaciones?${filters}&fields[0]=transaccion&pagination[pageSize]=100`;

    try {
      const response = await axios.get(url, { headers: strapiHeaders });
      const data = response.data.data || [];
      for (const f of data) {
        if (f.transaccion) pagados.add(f.transaccion.trim());
      }
    } catch (error) {
      console.log(`[DESCUENTOS] ⚠️ Error verificando lote de facturaciones: ${error.message}`);
    }
  }

  return pagados;
}

module.exports = {
  generarDescuentos,
  getDescuentosVigentes,
  crearDescuento,
  getCarterasPendientes,
  getCobranzasPorCedula,
  getCedulasEnCampana,
  calcularDiasBloqueado,
  calcularDiasMora,
  verificarPagosDescuentos
};
