/**
 * Cobrancio Web Service - Notificaciones de cobranza
 * Replica la funcionalidad de cobrancioWeb_FULL() del Apps Script
 */

const axios = require('axios');

// Environment variables
const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const CALLBELL_API_KEY = process.env.CALLBELL_API_KEY;

// Templates de Callbell según tipo de aviso
const CALLBELL_TEMPLATES = {
  mora: '507318f5b976412ba79e68d0071abf54',      // [nombre, 'hoy', linkPago]
  fecha: '5fdb30cc5cba41d1801b7b9a5ce1c621',     // [nombre, dia, linkPago]
  previo: '50c4528f8aa641918a846e65ebeafe1d'     // [nombre, linkPago, fechaPago]
};

// Channel UUIDs de Callbell según producto
const CALLBELL_CHANNELS = {
  rmastery: '2ebf8ea7211c48c98487286a885d1ae2',
  default: '419794db654d4de1b85bedfdc3673801'
};

/**
 * Calcula días de mora desde fecha límite
 */
function calcularDiasMora(fechaLimite) {
  const hoy = new Date();
  const hoyUTC = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const partes = fechaLimite.split('-');
  const limiteUTC = Date.UTC(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
  const diff = hoyUTC - limiteUTC;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

/**
 * Formatea fecha de YYYY-MM-DD a DD/MM/YYYY
 */
function formatearFecha(fechaStr) {
  const partes = fechaStr.split('-');
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

/**
 * Normaliza teléfono agregando código de país 57 si es necesario
 */
function normalizarTelefono(telefono) {
  if (!telefono) return null;
  let tel = telefono.toString().replace(/\D/g, '');
  if (/^3\d{9}$/.test(tel)) {
    return '+57' + tel;
  }
  if (tel.length === 12 && tel.startsWith('57')) {
    return '+' + tel;
  }
  return tel.startsWith('+') ? tel : '+' + tel;
}

/**
 * Verifica si una fecha es domingo
 */
function esDomingo(fecha) {
  return fecha.getDay() === 0;
}

/**
 * Verifica si una fecha es festivo consultando Strapi
 */
async function esFestivo(fecha) {
  const year = fecha.getFullYear();
  const month = String(fecha.getMonth() + 1).padStart(2, '0');
  const day = String(fecha.getDate()).padStart(2, '0');
  const fechaStr = `${year}-${month}-${day}`;

  try {
    const url = `${STRAPI_BASE_URL}/api/festivos?filters[fecha][$eq]=${fechaStr}`;
    const response = await axios.get(url, {
      headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
      timeout: 10000
    });

    if (response.data?.data?.length > 0) {
      const festivo = response.data.data[0];
      const activo = festivo.attributes ? festivo.attributes.activo : festivo.activo;
      return activo === true;
    }
    return false;
  } catch (e) {
    console.error(`Error verificando festivo ${fechaStr}:`, e.message);
    return false;
  }
}

/**
 * Verifica si hoy es domingo o festivo (Ley dejen de fregar)
 */
async function leyDejenDeFregar() {
  const hoy = new Date();

  if (esDomingo(hoy)) {
    return { activa: true, razon: 'Hoy es domingo' };
  }

  if (await esFestivo(hoy)) {
    return { activa: true, razon: 'Hoy es festivo' };
  }

  return { activa: false };
}

/**
 * Verifica si una fecha es domingo o festivo
 */
async function esDomingoOFestivo(fecha) {
  if (esDomingo(fecha)) return true;
  return await esFestivo(fecha);
}

/**
 * Obtiene links de cobranzas ya notificadas desde Strapi (historial)
 */
async function obtenerLinksCobranzasHistorico(tipoAviso) {
  const linksNotificados = new Set();
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const url = `${STRAPI_BASE_URL}/api/cobranzas?filters[aviso][$eq]=${encodeURIComponent(tipoAviso)}&pagination[pageSize]=100&pagination[page]=${currentPage}`;

    try {
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
        timeout: 15000
      });

      if (response.status === 200 && response.data?.data) {
        response.data.data.forEach(cobranza => {
          const obs = cobranza.observaciones || cobranza.attributes?.observaciones || '';
          const linkMatch = obs.match(/Link:\s*(https?:\/\/[^\s|]+)/i);
          if (linkMatch && linkMatch[1]) {
            linksNotificados.add(linkMatch[1].trim());
          }
        });

        if (response.data.meta?.pagination) {
          totalPages = response.data.meta.pagination.pageCount;
        }
      }
    } catch (e) {
      console.error(`Error obteniendo cobranzas ${tipoAviso}:`, e.message);
      break;
    }

    currentPage++;
    if (currentPage <= totalPages) {
      await new Promise(r => setTimeout(r, 200));
    }
  }

  console.log(`Historial "${tipoAviso}": ${linksNotificados.size} links encontrados`);
  return linksNotificados;
}

/**
 * Obtiene cuotas de Strapi con filtros dinámicos
 */
async function obtenerCuotasStrapi(filtros = {}) {
  const cuotas = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const queryParts = ['pagination[pageSize]=100', `pagination[page]=${currentPage}`];

    Object.entries(filtros).forEach(([key, value]) => {
      queryParts.push(`filters[${key}]=${encodeURIComponent(value)}`);
    });

    const url = `${STRAPI_BASE_URL}/api/carteras?${queryParts.join('&')}`;

    try {
      const response = await axios.get(url, {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
        timeout: 30000
      });

      if (response.status === 200 && response.data?.data) {
        cuotas.push(...response.data.data);

        if (response.data.meta?.pagination) {
          totalPages = response.data.meta.pagination.pageCount;
        }
      }
    } catch (e) {
      console.error(`Error obteniendo cuotas página ${currentPage}:`, e.message);
      break;
    }

    currentPage++;
    if (currentPage <= totalPages) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return cuotas;
}

/**
 * Envía mensaje de WhatsApp vía Callbell
 */
async function enviarMensajeCallbell(telefono, nombre, fechaPago, linkPago, producto, tipoAviso) {
  if (!CALLBELL_API_KEY) {
    console.error('CALLBELL_API_KEY no configurada');
    return false;
  }

  const telefonoNormalizado = normalizarTelefono(telefono);
  if (!telefonoNormalizado) {
    console.error('Teléfono inválido:', telefono);
    return false;
  }

  // Seleccionar template y valores según tipo
  let templateUuid;
  let templateValues;

  if (tipoAviso === 'mora') {
    templateUuid = CALLBELL_TEMPLATES.mora;
    templateValues = [nombre, 'hoy', linkPago];
  } else if (tipoAviso === 'previo') {
    templateUuid = CALLBELL_TEMPLATES.previo;
    templateValues = [nombre, linkPago, fechaPago];
  } else {
    // fecha (hoy, mañana, pasado mañana)
    templateUuid = CALLBELL_TEMPLATES.fecha;
    templateValues = [nombre, fechaPago, linkPago];
  }

  // Seleccionar canal según producto
  const channelUuid = (producto && producto.toLowerCase().includes('rmastery'))
    ? CALLBELL_CHANNELS.rmastery
    : CALLBELL_CHANNELS.default;

  const payload = {
    to: telefonoNormalizado,
    from: 'whatsapp',
    type: 'text',
    channel_uuid: channelUuid,
    content: { text: 'Cobro' },
    template_values: templateValues,
    template_uuid: templateUuid,
    optin_contact: true
  };

  try {
    const response = await axios.post('https://api.callbell.eu/v1/messages/send', payload, {
      headers: {
        'Authorization': `Bearer ${CALLBELL_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    console.log(`Callbell enviado a ${telefonoNormalizado}: ${response.status}`);
    return response.status >= 200 && response.status < 300;
  } catch (e) {
    console.error(`Error Callbell:`, e.message);
    return false;
  }
}

/**
 * Registra cobranza en Strapi
 */
async function registrarCobranzaStrapi(cedula, telefono, tipoAviso, linkPago, fechaPago) {
  try {
    const response = await axios.post(`${STRAPI_BASE_URL}/api/cobranzas`, {
      data: {
        numero_documento: String(cedula),
        aviso: tipoAviso,
        observaciones: `Tel: ${telefono || 'N/A'} | Link: ${linkPago} | Fecha pago: ${fechaPago}`
      }
    }, {
      headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
      timeout: 15000
    });

    return response.status === 200 || response.status === 201;
  } catch (e) {
    console.error(`Error registrando cobranza:`, e.message);
    return false;
  }
}

// ============================================================
// FUNCIONES PRINCIPALES DE COBRANCIO
// ============================================================

/**
 * Obtiene candidatos para cobro por MORA (3-5 días)
 */
async function obtenerCandidatosMora() {
  console.log('=== Obteniendo candidatos MORA (3-5 días) ===');

  // Verificar ley dejen de fregar
  const ley = await leyDejenDeFregar();
  if (ley.activa) {
    return { error: ley.razon, candidatos: [] };
  }

  // Obtener links ya notificados
  const linksYaNotificados = await obtenerLinksCobranzasHistorico('Aviso mora');

  // Obtener cuotas en mora firmadas
  const cuotasEnMora = await obtenerCuotasStrapi({
    'estado_pago][$eq': 'en_mora',
    'estado_firma][$eq': 'firmado'
  });

  console.log(`Total cuotas en mora: ${cuotasEnMora.length}`);

  // Filtrar cuotas con 3-5 días de mora
  const candidatos = [];
  const procesados = new Set();

  cuotasEnMora.forEach(cuota => {
    const diasMora = calcularDiasMora(cuota.fecha_limite);
    const linkPago = cuota.link_pago || '';

    if (diasMora >= 3 && diasMora <= 5 && linkPago && !linksYaNotificados.has(linkPago) && !procesados.has(linkPago)) {
      procesados.add(linkPago);

      candidatos.push({
        cedula: String(cuota.numero_documento),
        nombre: cuota.nombres ? cuota.nombres.split(' ')[0] : '',
        nombreCompleto: `${cuota.nombres || ''} ${cuota.apellidos || ''}`.trim(),
        telefono: normalizarTelefono(cuota.celular),
        linkPago: linkPago,
        producto: cuota.producto || '',
        diasMora: diasMora,
        fechaLimite: cuota.fecha_limite,
        fechaFormateada: formatearFecha(cuota.fecha_limite)
      });
    }
  });

  console.log(`Candidatos MORA (3-5 días): ${candidatos.length}`);
  return { candidatos, totalCuotas: cuotasEnMora.length };
}

/**
 * Obtiene candidatos para cobro por FECHA (hoy, mañana, pasado mañana)
 */
async function obtenerCandidatosFecha() {
  console.log('=== Obteniendo candidatos FECHA ===');

  try {
    const hoy = new Date();
    const manana = new Date(hoy.getTime() + 1 * 24 * 60 * 60 * 1000);
    const pasadoManana = new Date(hoy.getTime() + 2 * 24 * 60 * 60 * 1000);

    // Verificar si hoy es domingo/festivo
    if (await esDomingoOFestivo(hoy)) {
      return {
        error: 'Hoy es domingo o festivo',
        candidatos: { hoy: [], manana: [], pasadoManana: [], cobroMananaHoy: false, cobroPasadoMananaHoy: false }
      };
    }

    // Obtener links ya notificados
    const linksYaNotificados = await obtenerLinksCobranzasHistorico('Aviso fecha');

    const resultado = {
      hoy: [],
      manana: [],
      pasadoManana: [],
      cobroMananaHoy: false,
      cobroPasadoMananaHoy: false
    };

    // Función helper para obtener candidatos de una fecha
    const obtenerCandidatosDeFecha = async (fecha, etiqueta) => {
      const fechaStr = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

      const cuotas = await obtenerCuotasStrapi({
        'estado_pago][$eq': 'al_dia',
        'fecha_limite][$eq': fechaStr,
        'estado_firma][$eq': 'firmado'
      });

      const candidatos = [];
      const procesados = new Set();

      cuotas.forEach(cuota => {
        const linkPago = cuota.link_pago || '';

        if (linkPago && !linksYaNotificados.has(linkPago) && !procesados.has(linkPago)) {
          procesados.add(linkPago);

          candidatos.push({
            cedula: String(cuota.numero_documento),
            nombre: cuota.nombres ? cuota.nombres.split(' ')[0] : '',
            nombreCompleto: `${cuota.nombres || ''} ${cuota.apellidos || ''}`.trim(),
            telefono: normalizarTelefono(cuota.celular),
            linkPago: linkPago,
            producto: cuota.producto || '',
            fechaLimite: cuota.fecha_limite,
            fechaFormateada: formatearFecha(cuota.fecha_limite),
            etiquetaDia: etiqueta
          });
        }
      });

      return candidatos;
    };

    // Lógica de festivos: si mañana Y pasado mañana son festivos, cobrar todo hoy
    const mananaEsFestivo = await esDomingoOFestivo(manana);
    const pasadoMananaEsFestivo = await esDomingoOFestivo(pasadoManana);

    // Siempre cobrar lo de hoy
    resultado.hoy = await obtenerCandidatosDeFecha(hoy, 'Hoy');

    // Si mañana es festivo, cobrar lo de mañana hoy
    if (mananaEsFestivo) {
      resultado.manana = await obtenerCandidatosDeFecha(manana, 'Mañana');
      resultado.cobroMananaHoy = true;
      console.log(`Mañana es festivo. Cobrando ${resultado.manana.length} cuotas de mañana hoy.`);
    }

    // Si pasado mañana Y mañana son festivos, cobrar lo de pasado mañana hoy
    if (pasadoMananaEsFestivo && mananaEsFestivo) {
      resultado.pasadoManana = await obtenerCandidatosDeFecha(pasadoManana, 'Pasado mañana');
      resultado.cobroPasadoMananaHoy = true;
      console.log(`Pasado mañana también es festivo. Cobrando ${resultado.pasadoManana.length} cuotas de pasado mañana hoy.`);
    }

    console.log(`Candidatos FECHA - Hoy: ${resultado.hoy.length}, Mañana: ${resultado.manana.length}, Pasado mañana: ${resultado.pasadoManana.length}`);
    return { candidatos: resultado };

  } catch (error) {
    console.error('Error en obtenerCandidatosFecha:', error.message);
    return {
      error: error.message,
      candidatos: { hoy: [], manana: [], pasadoManana: [], cobroMananaHoy: false, cobroPasadoMananaHoy: false }
    };
  }
}

/**
 * Obtiene candidatos para cobro PREVIO (7 días antes)
 */
async function obtenerCandidatosPrevio() {
  console.log('=== Obteniendo candidatos PREVIO (7 días antes) ===');

  // Verificar ley dejen de fregar
  const ley = await leyDejenDeFregar();
  if (ley.activa) {
    return { error: ley.razon, candidatos: [] };
  }

  // Obtener links ya notificados
  const linksYaNotificados = await obtenerLinksCobranzasHistorico('Aviso previo');

  // Calcular fecha objetivo (hoy + 7 días)
  const hoy = new Date();
  const fechaObjetivo = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
  const fechaObjetivoStr = `${fechaObjetivo.getFullYear()}-${String(fechaObjetivo.getMonth() + 1).padStart(2, '0')}-${String(fechaObjetivo.getDate()).padStart(2, '0')}`;

  console.log(`Buscando cuotas con vencimiento en: ${fechaObjetivoStr}`);

  // Obtener cuotas al día que vencen en 7 días
  const cuotasAlDia = await obtenerCuotasStrapi({
    'estado_pago][$eq': 'al_dia',
    'fecha_limite][$eq': fechaObjetivoStr,
    'estado_firma][$eq': 'firmado'
  });

  console.log(`Total cuotas al día con vencimiento en 7 días: ${cuotasAlDia.length}`);

  const candidatos = [];
  const procesados = new Set();

  cuotasAlDia.forEach(cuota => {
    const linkPago = cuota.link_pago || '';

    if (linkPago && !linksYaNotificados.has(linkPago) && !procesados.has(linkPago)) {
      procesados.add(linkPago);

      candidatos.push({
        cedula: String(cuota.numero_documento),
        nombre: cuota.nombres ? cuota.nombres.split(' ')[0] : '',
        nombreCompleto: `${cuota.nombres || ''} ${cuota.apellidos || ''}`.trim(),
        telefono: normalizarTelefono(cuota.celular),
        linkPago: linkPago,
        producto: cuota.producto || '',
        fechaLimite: cuota.fecha_limite,
        fechaFormateada: formatearFecha(cuota.fecha_limite)
      });
    }
  });

  console.log(`Candidatos PREVIO: ${candidatos.length}`);
  return { candidatos, fechaObjetivo: fechaObjetivoStr, totalCuotas: cuotasAlDia.length };
}

/**
 * Procesa una notificación individual
 */
async function procesarNotificacion(candidato, tipoAviso, soloSincronizar = false) {
  const resultado = {
    exito: false,
    callbellEnviado: false,
    strapiRegistrado: false,
    error: null
  };

  const tipoStrapiAviso = tipoAviso === 'mora' ? 'Aviso mora' :
                          tipoAviso === 'previo' ? 'Aviso previo' : 'Aviso fecha';

  try {
    // Si NO es solo sincronizar, enviar mensaje de Callbell
    if (!soloSincronizar && candidato.telefono) {
      const fechaParam = tipoAviso === 'mora' ? 'hoy' :
                         tipoAviso === 'previo' ? candidato.fechaFormateada :
                         (candidato.etiquetaDia || 'Hoy');

      resultado.callbellEnviado = await enviarMensajeCallbell(
        candidato.telefono,
        candidato.nombre,
        fechaParam,
        candidato.linkPago,
        candidato.producto,
        tipoAviso
      );
    }

    // Registrar en Strapi
    resultado.strapiRegistrado = await registrarCobranzaStrapi(
      candidato.cedula,
      candidato.telefono,
      tipoStrapiAviso,
      candidato.linkPago,
      candidato.fechaFormateada
    );

    resultado.exito = resultado.strapiRegistrado;
  } catch (e) {
    resultado.error = e.message;
    console.error(`Error procesando notificación:`, e.message);
  }

  return resultado;
}

/**
 * Obtiene resumen de candidatos para todos los tipos de cobranza
 */
async function obtenerResumenCobrancio() {
  const [mora, fecha, previo] = await Promise.all([
    obtenerCandidatosMora(),
    obtenerCandidatosFecha(),
    obtenerCandidatosPrevio()
  ]);

  return {
    mora: {
      candidatos: mora.candidatos?.length || 0,
      error: mora.error
    },
    fecha: {
      hoy: fecha.candidatos?.hoy?.length || 0,
      manana: fecha.candidatos?.manana?.length || 0,
      pasadoManana: fecha.candidatos?.pasadoManana?.length || 0,
      cobroMananaHoy: fecha.candidatos?.cobroMananaHoy || false,
      cobroPasadoMananaHoy: fecha.candidatos?.cobroPasadoMananaHoy || false,
      error: fecha.error
    },
    previo: {
      candidatos: previo.candidatos?.length || 0,
      fechaObjetivo: previo.fechaObjetivo,
      error: previo.error
    }
  };
}

module.exports = {
  // Funciones principales
  obtenerCandidatosMora,
  obtenerCandidatosFecha,
  obtenerCandidatosPrevio,
  procesarNotificacion,
  obtenerResumenCobrancio,

  // Utilidades
  leyDejenDeFregar,
  calcularDiasMora,
  formatearFecha,
  normalizarTelefono
};
