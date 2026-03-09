/**
 * Cobranza Service - Manejo de bloqueo y desbloqueo de usuarios morosos
 */

const axios = require('axios');

// Environment variables
const FRAPP_BASE_URL = process.env.FRAPP_BASE_URL;
const FRAPP_API_KEY_ADMIN_READ = process.env.FRAPP_API_KEY_ADMIN_READ; // Para listar usuarios (users-memberships)
const FRAPP_API_KEY_WRITE = process.env.FRAPP_API_KEY_WRITE;
const STRAPI_BASE_URL = process.env.STRAPI_BASE_URL;
const STRAPI_TOKEN = process.env.STRAPI_TOKEN;
const GOOGLE_CHAT_WEBHOOK = process.env.GOOGLE_CHAT_WEBHOOK;
const ACTIVECAMPAIGN_API_TOKEN = process.env.ACTIVECAMPAIGN_API_TOKEN;
const CRM_API_URL = 'https://sentire13136.api-us1.com';
const CALLBELL_API_KEY = process.env.CALLBELL_API_KEY;
const CALLBELL_TEMPLATE_UUID_BLOQUEO = 'da8f51b47c394adab67bd9948c035ac8';

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
 * Obtener usuarios morosos de Frapp (paginado)
 */
async function getFrappMorosos() {
  console.log('=== PASO 1: Consultando usuarios morosos en Frapp ===');
  const frappMorosos = [];
  let frappPage = 1;
  const frappLimit = 500;
  let frappHasMore = true;

  while (frappHasMore) {
    const url = `${FRAPP_BASE_URL}/api/users-memberships?page=${frappPage}&limit=${frappLimit}&status=moroso`;

    try {
      const response = await axios.get(url, {
        headers: { 'x-api-key': FRAPP_API_KEY_ADMIN_READ },
        timeout: 30000
      });

      if (response.status === 403) {
        console.error('Error 403 en Frapp - Sin permisos');
        break;
      }

      const usuarios = response.data?.users || [];
      if (usuarios.length === 0) {
        frappHasMore = false;
        break;
      }

      const usuariosMapeados = usuarios.map(u => ({
        _id: u.id,
        numero_documento: u.identityDocument,
        nombres: u.givenName,
        apellidos: u.familyName,
        telefono: u.phoneNumber || u.phone || null,
        email: u.email
      }));

      frappMorosos.push(...usuariosMapeados);
      console.log(`Frapp página ${frappPage}: ${usuarios.length} usuarios`);

      if (response.data?.pagination?.hasNextPage === false || usuarios.length < frappLimit) {
        frappHasMore = false;
      } else {
        frappPage++;
      }
    } catch (e) {
      console.error(`Error en Frapp página ${frappPage}:`, e.message);
      break;
    }

    if (frappPage > 50) break;
  }

  console.log(`Total morosos en Frapp: ${frappMorosos.length}`);
  return frappMorosos;
}

/**
 * Obtener cuotas de Strapi por lotes de cédulas
 */
async function getStrapiCuotas(cedulas) {
  console.log('=== PASO 2: Consultando cuotas en Strapi ===');
  const loteSize = 25;
  const cuotasByCedula = {};

  for (let i = 0; i < cedulas.length; i += loteSize) {
    const lote = cedulas.slice(i, i + loteSize);
    console.log(`Consultando lote ${Math.floor(i / loteSize) + 1}: ${lote.length} cédulas`);

    const filters = lote.map((c, idx) => `filters[$or][${idx}][numero_documento][$eq]=${encodeURIComponent(c)}`);

    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
      const queryParts = [
        ...filters,
        'filters[estado_firma][$eq]=firmado',
        'pagination[pageSize]=100',
        `pagination[page]=${currentPage}`
      ];

      const url = `${STRAPI_BASE_URL}/api/carteras?${queryParts.join('&')}`;

      try {
        const response = await axios.get(url, {
          headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
          timeout: 30000
        });

        if (response.data?.data) {
          response.data.data.forEach(cuota => {
            const cedula = String(cuota.numero_documento);
            if (!cuotasByCedula[cedula]) cuotasByCedula[cedula] = [];
            cuotasByCedula[cedula].push(cuota);
          });

          if (response.data.meta?.pagination) {
            totalPages = response.data.meta.pagination.pageCount;
          }
        }
      } catch (e) {
        console.error(`Error en Strapi lote ${Math.floor(i / loteSize) + 1}:`, e.message);
      }

      currentPage++;
      await new Promise(r => setTimeout(r, 300));
    }
  }

  return cuotasByCedula;
}

/**
 * Evaluar candidatos a desbloqueo
 * Criterio: todas las cuotas con ≤5 días de mora
 */
function evaluarCandidatos(frappByCedula, cuotasByCedula) {
  console.log('=== PASO 3: Evaluando candidatos a desbloqueo ===');
  const candidatos = [];
  const todasLasCedulas = Object.keys(frappByCedula);

  todasLasCedulas.forEach(cedula => {
    const cuotas = cuotasByCedula[cedula] || [];

    // Si no tiene cuotas en Strapi, es candidato (probablemente bloqueado por error)
    if (cuotas.length === 0) {
      candidatos.push({
        cedula,
        cuotas: [],
        frappId: frappByCedula[cedula]?.frappId,
        nombres: frappByCedula[cedula]?.nombres || '',
        apellidos: frappByCedula[cedula]?.apellidos || '',
        telefono: frappByCedula[cedula]?.telefono || null,
        email: frappByCedula[cedula]?.email,
        razon: 'Sin cuotas en Strapi'
      });
      return;
    }

    let tieneMoraGrave = false;
    let maxDiasMora = 0;

    cuotas.forEach(cuota => {
      if (cuota.estado_pago === 'en_mora') {
        const diasMora = calcularDiasMora(cuota.fecha_limite);
        maxDiasMora = Math.max(maxDiasMora, diasMora);
        if (diasMora > 5) {
          tieneMoraGrave = true;
        }
      }
    });

    if (!tieneMoraGrave) {
      const primeraQuota = cuotas[0];
      candidatos.push({
        cedula,
        cuotas: cuotas.map(c => ({
          cuota_nro: c.cuota_nro,
          estado_pago: c.estado_pago,
          fecha_limite: c.fecha_limite,
          diasMora: c.estado_pago === 'en_mora' ? calcularDiasMora(c.fecha_limite) : 0
        })),
        frappId: frappByCedula[cedula]?.frappId,
        nombres: primeraQuota?.nombres || frappByCedula[cedula]?.nombres || '',
        apellidos: primeraQuota?.apellidos || frappByCedula[cedula]?.apellidos || '',
        telefono: primeraQuota?.celular || frappByCedula[cedula]?.telefono || null,
        email: primeraQuota?.correo || frappByCedula[cedula]?.email,
        razon: `Todas las cuotas ≤5 días mora (max: ${maxDiasMora})`
      });
    }
  });

  console.log(`Total candidatos para desbloqueo: ${candidatos.length}`);
  return candidatos;
}

/**
 * Obtener candidatos a desbloqueo
 */
async function obtenerCandidatosDesbloqueo() {
  // Paso 1: Frapp morosos
  const frappMorosos = await getFrappMorosos();
  const frappByCedula = {};
  frappMorosos.forEach(u => {
    const cedula = String(u.numero_documento);
    if (cedula) {
      frappByCedula[cedula] = {
        frappId: u._id,
        nombres: u.nombres,
        apellidos: u.apellidos,
        telefono: u.telefono,
        email: u.email
      };
    }
  });

  // Paso 2: Strapi cuotas
  const todasLasCedulas = Object.keys(frappByCedula);

  if (todasLasCedulas.length === 0) {
    return { candidatos: [], stats: { frappMorosos: 0, totalCedulas: 0 } };
  }

  const cuotasByCedula = await getStrapiCuotas(todasLasCedulas);

  // Paso 3: Evaluar candidatos
  const candidatos = evaluarCandidatos(frappByCedula, cuotasByCedula);

  return {
    candidatos,
    stats: {
      frappMorosos: Object.keys(frappByCedula).length,
      totalCedulas: todasLasCedulas.length
    }
  };
}

/**
 * Desbloquear un usuario específico
 */
async function desbloquearUsuario(usuario) {
  const resultados = {
    frappOk: false,
    strapiOk: false,
    chatOk: false,
    crmOk: false,
    errores: []
  };

  const cedula = usuario.cedula;

  // 1. Frapp - Cambiar status a active
  if (usuario.frappId) {
    console.log(`Desbloqueando en Frapp: ${usuario.frappId}`);
    try {
      const frappUrl = `${FRAPP_BASE_URL}/api/users/${usuario.frappId}`;
      const response = await axios.put(frappUrl,
        { status: 'active' },
        {
          headers: { 'x-api-key': FRAPP_API_KEY_WRITE },
          timeout: 15000
        }
      );
      if (response.status === 200 && response.data?.success) {
        resultados.frappOk = true;
        console.log(`✅ Frapp: status cambiado a active`);
      }
    } catch (e) {
      resultados.errores.push(`Frapp: ${e.message}`);
      console.error(`❌ Frapp error:`, e.message);
    }
  }

  // 2. Strapi - Registrar en cobranzas
  try {
    const strapiUrl = `${STRAPI_BASE_URL}/api/cobranzas`;
    const response = await axios.post(strapiUrl,
      {
        data: {
          numero_documento: cedula,
          aviso: 'Desbloqueo',
          observaciones: ''
        }
      },
      {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
        timeout: 15000
      }
    );
    if (response.status === 200 || response.status === 201) {
      resultados.strapiOk = true;
      console.log(`✅ Strapi: desbloqueo registrado`);
    }
  } catch (e) {
    resultados.errores.push(`Strapi: ${e.message}`);
    console.error(`❌ Strapi error:`, e.message);
  }

  // 3. Google Chat - Notificar
  if (GOOGLE_CHAT_WEBHOOK) {
    try {
      let chatMessage = 'El siguiente estudiante ha sido ✔️ *desbloqueado* en la plataforma por FR360:\n\n';
      chatMessage += `📋 *Datos del estudiante:*\n`;
      chatMessage += `   • Cédula: ${cedula}\n`;
      chatMessage += `   • Nombre: ${usuario.nombres} ${usuario.apellidos}\n`;
      if (usuario.telefono) chatMessage += `   • Teléfono: ${usuario.telefono}\n`;
      if (usuario.email) chatMessage += `   • Email: ${usuario.email}\n`;

      chatMessage += `\n💳 *Cuotas del estudiante:*\n`;
      if (usuario.cuotas && usuario.cuotas.length > 0) {
        usuario.cuotas.forEach(c => {
          let emoji = '⚠️';
          if (c.estado_pago === 'pagado') emoji = '✅';
          else if (c.estado_pago === 'al_dia') emoji = '🆗';
          else if (c.estado_pago === 'en_mora') emoji = '🚫';
          chatMessage += `   ${emoji} Cuota #${c.cuota_nro} - ${c.estado_pago}${c.diasMora > 0 ? ` (${c.diasMora} días mora)` : ''}\n`;
        });
      } else {
        chatMessage += '   Sin cuotas registradas\n';
      }

      await axios.post(GOOGLE_CHAT_WEBHOOK, { text: chatMessage }, { timeout: 10000 });
      resultados.chatOk = true;
      console.log(`✅ Google Chat: notificación enviada`);
    } catch (e) {
      resultados.errores.push(`Chat: ${e.message}`);
      console.error(`❌ Google Chat error:`, e.message);
    }
  }

  // 4. CRM - Actualizar estado (si tiene crmId)
  if (usuario.crmId && ACTIVECAMPAIGN_API_TOKEN) {
    try {
      const getUrl = `${CRM_API_URL}/api/3/contacts/${usuario.crmId}/fieldValues`;
      const getResponse = await axios.get(getUrl, {
        headers: { 'Api-Token': ACTIVECAMPAIGN_API_TOKEN },
        timeout: 15000
      });

      if (getResponse.data?.fieldValues?.length > 0) {
        const fieldValueId = getResponse.data.fieldValues[0].id;
        const updateUrl = `${CRM_API_URL}/api/3/fieldValues/${fieldValueId}`;
        await axios.put(updateUrl,
          {
            fieldValue: {
              contact: usuario.crmId,
              field: '3',
              value: '||Activo||'
            }
          },
          {
            headers: { 'Api-Token': ACTIVECAMPAIGN_API_TOKEN },
            timeout: 15000
          }
        );
        resultados.crmOk = true;
        console.log(`✅ CRM: estado actualizado a Activo`);
      }
    } catch (e) {
      resultados.errores.push(`CRM: ${e.message}`);
      console.error(`❌ CRM error:`, e.message);
    }
  }

  return resultados;
}

// ============================================================
// FUNCIONES DE BLOQUEO
// ============================================================

/**
 * Obtener usuarios activos de Frapp (sin status moroso)
 */
async function getFrappActivos() {
  console.log('=== BLOQUEO PASO 1: Consultando usuarios activos en Frapp ===');
  const frappLimit = 500;

  function mapUsuarios(usuarios) {
    return usuarios
      .filter(u => {
        const status = (u.status || '').toString().toLowerCase();
        return status !== 'moroso';
      })
      .map(u => ({
        _id: u.id,
        numero_documento: u.identityDocument,
        nombres: u.givenName,
        apellidos: u.familyName,
        telefono: u.phoneNumber || u.phone || null,
        email: u.email
      }));
  }

  async function fetchPage(page) {
    const url = `${FRAPP_BASE_URL}/api/users-memberships?page=${page}&limit=${frappLimit}`;
    const response = await axios.get(url, {
      headers: { 'x-api-key': FRAPP_API_KEY_ADMIN_READ },
      timeout: 30000
    });
    return response.data;
  }

  // Primera página para saber el total
  const firstData = await fetchPage(1);
  const firstUsers = firstData?.users || [];
  if (firstUsers.length === 0) return [];

  const frappActivos = mapUsuarios(firstUsers);
  console.log(`Frapp página 1: ${frappActivos.length} usuarios activos (de ${firstUsers.length} totales)`);

  // Estimar total de páginas y consultar el resto en paralelo
  const totalPages = firstData?.pagination?.totalPages || Math.ceil((firstData?.pagination?.total || firstUsers.length) / frappLimit);
  if (totalPages > 1) {
    const pageNumbers = [];
    for (let p = 2; p <= Math.min(totalPages, 50); p++) pageNumbers.push(p);

    // Lanzar en lotes de 5 para no saturar
    const BATCH_SIZE = 5;
    for (let i = 0; i < pageNumbers.length; i += BATCH_SIZE) {
      const batch = pageNumbers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (page) => {
        try {
          const data = await fetchPage(page);
          const usuarios = data?.users || [];
          const mapped = mapUsuarios(usuarios);
          console.log(`Frapp página ${page}: ${mapped.length} usuarios activos (de ${usuarios.length} totales)`);
          return mapped;
        } catch (e) {
          console.error(`Error en Frapp página ${page}:`, e.message);
          return [];
        }
      }));
      results.forEach(r => frappActivos.push(...r));
    }
  }

  console.log(`Total usuarios activos en Frapp: ${frappActivos.length}`);
  return frappActivos;
}

/**
 * Obtener TODAS las cuotas en mora de Strapi
 */
async function getStrapiCuotasEnMora() {
  console.log('=== BLOQUEO PASO 2: Consultando TODAS las cuotas EN MORA desde Strapi ===');

  async function fetchPage(page) {
    const queryParts = [
      'filters[estado_pago][$eq]=en_mora',
      'filters[estado_firma][$eq]=firmado',
      'pagination[pageSize]=100',
      `pagination[page]=${page}`
    ];
    const url = `${STRAPI_BASE_URL}/api/carteras?${queryParts.join('&')}`;
    return axios.get(url, {
      headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
      timeout: 30000
    });
  }

  // Primera página para saber el total
  const firstResp = await fetchPage(1);
  const todasLasCuotasEnMora = [...(firstResp.data?.data || [])];
  const totalPages = firstResp.data?.meta?.pagination?.pageCount || 1;
  console.log(`Página 1/${totalPages}: ${todasLasCuotasEnMora.length} cuotas en mora`);

  if (totalPages > 1) {
    const pageNumbers = [];
    for (let p = 2; p <= totalPages; p++) pageNumbers.push(p);

    // Lanzar en lotes de 5
    const BATCH_SIZE = 5;
    for (let i = 0; i < pageNumbers.length; i += BATCH_SIZE) {
      const batch = pageNumbers.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(batch.map(async (page) => {
        try {
          const resp = await fetchPage(page);
          const data = resp.data?.data || [];
          console.log(`Página ${page}/${totalPages}: ${data.length} cuotas en mora`);
          return data;
        } catch (e) {
          console.error(`Error en página ${page}:`, e.message);
          return [];
        }
      }));
      results.forEach(r => todasLasCuotasEnMora.push(...r));
    }
  }

  console.log(`Total cuotas en mora obtenidas: ${todasLasCuotasEnMora.length}`);
  return todasLasCuotasEnMora;
}

/**
 * Obtener candidatos a bloqueo
 * Criterio: cuotas con mora >= 6 días Y usuario NO bloqueado
 */
async function obtenerCandidatosBloqueo() {
  // Paso 1: Usuarios activos en Frapp
  const frappActivos = await getFrappActivos();
  const frappByCedula = {};
  frappActivos.forEach(u => {
    const cedula = String(u.numero_documento);
    if (cedula) {
      frappByCedula[cedula] = {
        frappId: u._id,
        nombres: u.nombres,
        apellidos: u.apellidos,
        telefono: u.telefono,
        email: u.email
      };
    }
  });
  console.log(`Total cédulas activas en Frapp: ${Object.keys(frappByCedula).length}`);

  // Paso 2: Obtener cuotas en mora de Strapi
  const todasLasCuotasEnMora = await getStrapiCuotasEnMora();

  // Paso 3: Filtrar cuotas con mora >= 6 días
  console.log('=== BLOQUEO PASO 3: Filtrando cuotas con mora >= 6 días ===');
  const cuotasMoraGraveByCedula = {};

  todasLasCuotasEnMora.forEach(cuota => {
    const diasMora = calcularDiasMora(cuota.fecha_limite);

    if (diasMora >= 6) {
      const cedula = String(cuota.numero_documento);
      if (!cuotasMoraGraveByCedula[cedula]) {
        cuotasMoraGraveByCedula[cedula] = [];
      }
      cuotasMoraGraveByCedula[cedula].push({
        ...cuota,
        diasMora: diasMora
      });
    }
  });

  const cedulasConMoraGrave = Object.keys(cuotasMoraGraveByCedula);
  console.log(`Cédulas con mora >= 6 días: ${cedulasConMoraGrave.length}`);

  // Paso 4: Cruzar mora grave con usuarios activos en Frapp
  console.log('=== BLOQUEO PASO 4: Evaluando candidatos a bloqueo ===');
  const candidatos = [];

  cedulasConMoraGrave.forEach(cedula => {
    const enFrapp = frappByCedula[cedula];

    // Solo si existe en Frapp (sin status moroso)
    if (!enFrapp) {
      return; // Ya está bloqueado o no existe
    }

    const cuotas = cuotasMoraGraveByCedula[cedula];
    const maxDiasMora = Math.max(...cuotas.map(c => c.diasMora));

    // Obtener datos de la primera cuota
    const primeraQuota = cuotas[0];
    const celular = primeraQuota.celular || enFrapp?.telefono || null;
    const nombres = primeraQuota.nombres || enFrapp?.nombres || '';
    const apellidos = primeraQuota.apellidos || enFrapp?.apellidos || '';
    const email = primeraQuota.correo || enFrapp?.email || null;

    candidatos.push({
      cedula: cedula,
      cuotas: cuotas.map(c => ({
        cuota_nro: c.cuota_nro,
        estado_pago: c.estado_pago,
        fecha_limite: c.fecha_limite,
        diasMora: c.diasMora
      })),
      maxDiasMora: maxDiasMora,
      frappId: enFrapp?.frappId,
      nombres: nombres,
      apellidos: apellidos,
      telefono: celular,
      email: email,
      activoEnFrapp: !!enFrapp
    });
  });

  console.log(`Total candidatos para bloqueo: ${candidatos.length}`);

  return {
    success: true,
    candidatos,
    stats: {
      frappActivos: Object.keys(frappByCedula).length,
      cuotasEnMora: todasLasCuotasEnMora.length,
      cuotasMoraGrave: cedulasConMoraGrave.length
    }
  };
}

/**
 * Bloquear un usuario específico
 */
async function bloquearUsuario(usuario) {
  const resultados = {
    frappOk: false,
    strapiOk: false,
    chatOk: false,
    crmOk: false,
    callbellOk: false,
    errores: []
  };

  const cedula = usuario.cedula;

  // 1. Frapp - Cambiar status a moroso
  if (usuario.frappId) {
    console.log(`Bloqueando en Frapp: ${usuario.frappId}`);
    try {
      const frappUrl = `${FRAPP_BASE_URL}/api/users/${usuario.frappId}`;
      const response = await axios.put(frappUrl,
        { status: 'moroso' },
        {
          headers: { 'x-api-key': FRAPP_API_KEY_WRITE },
          timeout: 15000
        }
      );
      if (response.status === 200 && response.data?.success) {
        resultados.frappOk = true;
        console.log(`✅ Frapp: status cambiado a moroso`);
      }
    } catch (e) {
      resultados.errores.push(`Frapp: ${e.message}`);
      console.error(`❌ Frapp error:`, e.message);
    }
  } else {
    resultados.frappOk = true;
    console.log('⊗ Frapp: Sin frappId, omitido');
  }

  // Verificar si fue exitoso
  if (!resultados.frappOk) {
    return resultados;
  }

  // 2. Strapi - Registrar bloqueo en cobranzas
  try {
    const strapiUrl = `${STRAPI_BASE_URL}/api/cobranzas`;
    const response = await axios.post(strapiUrl,
      {
        data: {
          numero_documento: cedula,
          aviso: 'Bloqueo',
          observaciones: ''
        }
      },
      {
        headers: { 'Authorization': `Bearer ${STRAPI_TOKEN}` },
        timeout: 15000
      }
    );
    if (response.status === 200 || response.status === 201) {
      resultados.strapiOk = true;
      console.log(`✅ Strapi: bloqueo registrado`);
    }
  } catch (e) {
    resultados.errores.push(`Strapi: ${e.message}`);
    console.error(`❌ Strapi error:`, e.message);
  }

  // 3. Google Chat - Notificar bloqueo
  if (GOOGLE_CHAT_WEBHOOK) {
    try {
      let chatMessage = 'El siguiente estudiante ha sido ✖️ *bloqueado* en la plataforma por FR360:\n\n';
      chatMessage += `📋 *Datos del estudiante:*\n`;
      chatMessage += `   • Cédula: ${cedula}\n`;
      chatMessage += `   • Nombre: ${usuario.nombres} ${usuario.apellidos}\n`;
      if (usuario.telefono) chatMessage += `   • Teléfono: ${usuario.telefono}\n`;
      if (usuario.email) chatMessage += `   • Email: ${usuario.email}\n`;

      chatMessage += `\n💳 *Cuotas en mora:*\n`;
      if (usuario.cuotas && usuario.cuotas.length > 0) {
        usuario.cuotas.forEach(c => {
          let emoji = '🚫';
          chatMessage += `   ${emoji} Cuota #${c.cuota_nro} - ${c.estado_pago} (${c.diasMora} días mora) - Vence: ${c.fecha_limite}\n`;
        });
      }

      await axios.post(GOOGLE_CHAT_WEBHOOK, { text: chatMessage }, { timeout: 10000 });
      resultados.chatOk = true;
      console.log(`✅ Google Chat: notificación enviada`);
    } catch (e) {
      resultados.errores.push(`Chat: ${e.message}`);
      console.error(`❌ Google Chat error:`, e.message);
    }
  }

  // 4. CRM - Actualizar estado a "Dado de baja por mora"
  if (usuario.crmId && ACTIVECAMPAIGN_API_TOKEN) {
    try {
      const getUrl = `${CRM_API_URL}/api/3/contacts/${usuario.crmId}/fieldValues`;
      const getResponse = await axios.get(getUrl, {
        headers: { 'Api-Token': ACTIVECAMPAIGN_API_TOKEN },
        timeout: 15000
      });

      if (getResponse.data?.fieldValues?.length > 0) {
        const fieldValueId = getResponse.data.fieldValues[0].id;
        const updateUrl = `${CRM_API_URL}/api/3/fieldValues/${fieldValueId}`;
        await axios.put(updateUrl,
          {
            fieldValue: {
              contact: usuario.crmId,
              field: '3',
              value: '||Dado de baja por mora||'
            }
          },
          {
            headers: { 'Api-Token': ACTIVECAMPAIGN_API_TOKEN },
            timeout: 15000
          }
        );
        resultados.crmOk = true;
        console.log(`✅ CRM: estado actualizado a "Dado de baja por mora"`);
      }
    } catch (e) {
      resultados.errores.push(`CRM: ${e.message}`);
      console.error(`❌ CRM error:`, e.message);
    }
  }

  // 5. Callbell - Enviar mensaje WhatsApp
  if (usuario.telefono && CALLBELL_API_KEY) {
    try {
      const callbellUrl = 'https://api.callbell.eu/v1/messages/send';

      // Normalizar teléfono: agregar código de país 57 si no lo tiene
      let telefonoNormalizado = usuario.telefono.toString().replace(/\D/g, '');
      if (telefonoNormalizado.length === 10 && telefonoNormalizado.startsWith('3')) {
        telefonoNormalizado = '57' + telefonoNormalizado;
      }

      const callbellPayload = {
        to: telefonoNormalizado,
        from: 'whatsapp',
        type: 'text',
        content: { text: 'Pago' },
        template_uuid: CALLBELL_TEMPLATE_UUID_BLOQUEO,
        optin_contact: true
      };

      console.log(`📱 Callbell payload:`, JSON.stringify(callbellPayload));

      const response = await axios.post(callbellUrl, callbellPayload, {
        headers: {
          'Authorization': `Bearer ${CALLBELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      console.log(`✅ Callbell response:`, response.data);
      resultados.callbellOk = true;
    } catch (e) {
      resultados.errores.push(`Callbell: ${e.message}`);
      console.error(`❌ Callbell error:`, e.message);
      if (e.response) {
        console.error(`❌ Callbell response:`, e.response.data);
      }
    }
  }

  return resultados;
}

module.exports = {
  obtenerCandidatosDesbloqueo,
  desbloquearUsuario,
  obtenerCandidatosBloqueo,
  bloquearUsuario,
  calcularDiasMora
};
