/**
 * Cobranza Service - Manejo de bloqueo y desbloqueo de usuarios morosos
 */

const axios = require('axios');

// Environment variables
const WP_BASE_URL = process.env.OLD_MEMB_BASE_URL;
const WP_AUTH = process.env.OLD_MEMB_AUTH;
const FRAPP_BASE_URL = process.env.FRAPP_BASE_URL;
const FRAPP_API_KEY_READ = process.env.FRAPP_API_KEY;
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
 * PASO 1: Obtener usuarios morosos de WordPress (paginado)
 */
async function getWordPressMorosos() {
  console.log('=== PASO 1: Consultando usuarios en WordPress ===');
  const allWpUsers = [];
  let wpPage = 1;
  const wpPerPage = 5000;
  let wpHasMore = true;

  while (wpHasMore) {
    const url = `${WP_BASE_URL}/wp-json/almus/v1/all_users?page=${wpPage}&per_page=${wpPerPage}`;

    try {
      const response = await axios.get(url, {
        headers: { 'AUTH': WP_AUTH },
        timeout: 30000
      });

      const usuarios = response.data?.users || [];
      if (usuarios.length === 0) {
        wpHasMore = false;
        break;
      }

      allWpUsers.push(...usuarios);
      console.log(`WP página ${wpPage}: ${usuarios.length} usuarios (total: ${allWpUsers.length})`);

      if (usuarios.length < wpPerPage) {
        wpHasMore = false;
      } else {
        wpPage++;
      }
    } catch (e) {
      console.error(`Error en WP página ${wpPage}:`, e.message);
      break;
    }

    if (wpPage > 10) break; // Límite de seguridad
  }

  // Filtrar solo morosos
  const wpMorosos = allWpUsers.filter(u => {
    if (!u.roles) return false;
    const rolesStr = Array.isArray(u.roles) ? u.roles.join(',') : String(u.roles);
    return rolesStr.toLowerCase().includes('moroso');
  });

  console.log(`Total usuarios WP: ${allWpUsers.length}, Morosos: ${wpMorosos.length}`);
  return wpMorosos;
}

/**
 * PASO 2: Obtener usuarios morosos de Frapp (paginado)
 */
async function getFrappMorosos() {
  console.log('=== PASO 2: Consultando usuarios morosos en Frapp ===');
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
 * PASO 3: Obtener cuotas de Strapi por lotes de cédulas
 */
async function getStrapiCuotas(cedulas) {
  console.log('=== PASO 3: Consultando cuotas en Strapi ===');
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
 * PASO 4: Evaluar candidatos a desbloqueo
 * Criterio: todas las cuotas con ≤5 días de mora
 */
function evaluarCandidatos(wpByCedula, frappByCedula, cuotasByCedula) {
  console.log('=== PASO 4: Evaluando candidatos a desbloqueo ===');
  const candidatos = [];
  const todasLasCedulas = new Set([
    ...Object.keys(wpByCedula),
    ...Object.keys(frappByCedula)
  ]);

  todasLasCedulas.forEach(cedula => {
    const cuotas = cuotasByCedula[cedula] || [];

    // Si no tiene cuotas en Strapi, es candidato (probablemente bloqueado por error)
    if (cuotas.length === 0) {
      candidatos.push({
        cedula,
        cuotas: [],
        wpId: wpByCedula[cedula]?.wpId,
        frappId: frappByCedula[cedula]?.frappId,
        nombres: frappByCedula[cedula]?.nombres || wpByCedula[cedula]?.nombres || '',
        apellidos: frappByCedula[cedula]?.apellidos || wpByCedula[cedula]?.apellidos || '',
        telefono: frappByCedula[cedula]?.telefono || null,
        email: frappByCedula[cedula]?.email || wpByCedula[cedula]?.email,
        crmId: wpByCedula[cedula]?.crmId,
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
        wpId: wpByCedula[cedula]?.wpId,
        frappId: frappByCedula[cedula]?.frappId,
        nombres: primeraQuota?.nombres || frappByCedula[cedula]?.nombres || wpByCedula[cedula]?.nombres || '',
        apellidos: primeraQuota?.apellidos || frappByCedula[cedula]?.apellidos || wpByCedula[cedula]?.apellidos || '',
        telefono: primeraQuota?.celular || frappByCedula[cedula]?.telefono || null,
        email: primeraQuota?.correo || frappByCedula[cedula]?.email || wpByCedula[cedula]?.email,
        crmId: wpByCedula[cedula]?.crmId,
        razon: `Todas las cuotas ≤5 días mora (max: ${maxDiasMora})`
      });
    }
  });

  console.log(`Total candidatos para desbloqueo: ${candidatos.length}`);
  return candidatos;
}

/**
 * Obtener candidatos a desbloqueo (pasos 1-4)
 */
async function obtenerCandidatosDesbloqueo() {
  // Paso 1: WordPress
  const wpMorosos = await getWordPressMorosos();
  const wpByCedula = {};
  wpMorosos.forEach(u => {
    const cedula = String(u.user_login);
    if (cedula) {
      wpByCedula[cedula] = {
        wpId: u.id,
        nombres: u.first_name || '',
        apellidos: u.last_name || '',
        email: u.email,
        roles: u.roles,
        crmId: u.crmid
      };
    }
  });

  // Paso 2: Frapp
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

  // Paso 3: Strapi cuotas
  const todasLasCedulas = [...new Set([
    ...Object.keys(wpByCedula),
    ...Object.keys(frappByCedula)
  ])];

  if (todasLasCedulas.length === 0) {
    return { candidatos: [], stats: { wpMorosos: 0, frappMorosos: 0, totalCedulas: 0 } };
  }

  const cuotasByCedula = await getStrapiCuotas(todasLasCedulas);

  // Paso 4: Evaluar candidatos
  const candidatos = evaluarCandidatos(wpByCedula, frappByCedula, cuotasByCedula);

  return {
    candidatos,
    stats: {
      wpMorosos: Object.keys(wpByCedula).length,
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
    wpOk: false,
    frappOk: false,
    strapiOk: false,
    chatOk: false,
    crmOk: false,
    errores: []
  };

  const cedula = usuario.cedula;

  // 1. WordPress - Quitar rol moroso
  if (usuario.wpId || cedula) {
    console.log(`Desbloqueando en WordPress: ${cedula}`);
    try {
      const wpUrl = `${WP_BASE_URL}/wp-json/almus/v1/unassign_role`;
      const response = await axios.post(wpUrl,
        `user_id=${usuario.wpId || cedula}&roles=moroso`,
        {
          headers: {
            'AUTH': WP_AUTH,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      );
      if (response.status === 200) {
        resultados.wpOk = true;
        console.log(`✅ WordPress: rol moroso removido`);
      }
    } catch (e) {
      resultados.errores.push(`WordPress: ${e.message}`);
      console.error(`❌ WordPress error:`, e.message);
    }
  }

  // 2. Frapp - Cambiar status a active
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

  // 3. Strapi - Registrar en cobranzas
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

  // 4. Google Chat - Notificar
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

  // 5. CRM - Actualizar estado (si tiene crmId)
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
 * Obtener TODOS los usuarios de WordPress (paginado)
 */
async function getAllWordPressUsers() {
  console.log('=== BLOQUEO PASO 1: Consultando TODOS los usuarios en WordPress ===');
  const allWpUsers = [];
  let wpPage = 1;
  const wpPerPage = 5000;
  let wpHasMore = true;

  while (wpHasMore) {
    const url = `${WP_BASE_URL}/wp-json/almus/v1/all_users?page=${wpPage}&per_page=${wpPerPage}`;

    try {
      const response = await axios.get(url, {
        headers: { 'AUTH': WP_AUTH },
        timeout: 30000
      });

      const usuarios = response.data?.users || [];
      if (usuarios.length === 0) {
        wpHasMore = false;
        break;
      }

      allWpUsers.push(...usuarios);
      console.log(`WP página ${wpPage}: ${usuarios.length} usuarios (total: ${allWpUsers.length})`);

      if (usuarios.length < wpPerPage) {
        wpHasMore = false;
      } else {
        wpPage++;
      }
    } catch (e) {
      console.error(`Error en WP página ${wpPage}:`, e.message);
      break;
    }

    if (wpPage > 10) break;
  }

  return allWpUsers;
}

/**
 * Obtener usuarios activos de Frapp (sin status moroso)
 */
async function getFrappActivos() {
  console.log('=== BLOQUEO PASO 2: Consultando usuarios activos en Frapp ===');
  const frappActivos = [];
  let frappPage = 1;
  const frappLimit = 500;
  let frappHasMore = true;

  while (frappHasMore) {
    const url = `${FRAPP_BASE_URL}/api/users-memberships?page=${frappPage}&limit=${frappLimit}`;

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

      // Filtrar solo los que NO tienen status moroso
      const usuariosMapeados = usuarios
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

      frappActivos.push(...usuariosMapeados);
      console.log(`Frapp página ${frappPage}: ${usuariosMapeados.length} usuarios activos (de ${usuarios.length} totales)`);

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

  console.log(`Total usuarios activos en Frapp: ${frappActivos.length}`);
  return frappActivos;
}

/**
 * Obtener TODAS las cuotas en mora de Strapi
 */
async function getStrapiCuotasEnMora() {
  console.log('=== BLOQUEO PASO 3: Consultando TODAS las cuotas EN MORA desde Strapi ===');
  const todasLasCuotasEnMora = [];
  let currentPage = 1;
  let totalPages = 1;

  while (currentPage <= totalPages) {
    const queryParts = [
      'filters[estado_pago][$eq]=en_mora',
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
        todasLasCuotasEnMora.push(...response.data.data);

        if (response.data.meta?.pagination) {
          totalPages = response.data.meta.pagination.pageCount;
          console.log(`Página ${currentPage}/${totalPages}: ${response.data.data.length} cuotas en mora`);
        }
      }
    } catch (e) {
      console.error(`Error en página ${currentPage}:`, e.message);
      break;
    }

    currentPage++;
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`Total cuotas en mora obtenidas: ${todasLasCuotasEnMora.length}`);
  return todasLasCuotasEnMora;
}

/**
 * Obtener candidatos a bloqueo
 * Criterio: cuotas con mora >= 6 días Y usuario NO bloqueado
 */
async function obtenerCandidatosBloqueo() {
  // Paso 1: Todos los usuarios de WordPress
  const allWpUsers = await getAllWordPressUsers();

  // Identificar cédulas que YA tienen rol moroso
  const cedulasConMoroso = new Set();
  allWpUsers.forEach(u => {
    if (u.roles) {
      const rolesStr = Array.isArray(u.roles) ? u.roles.join(',') : String(u.roles);
      if (rolesStr.toLowerCase().includes('moroso')) {
        cedulasConMoroso.add(String(u.user_login));
      }
    }
  });
  console.log(`Cédulas con rol moroso en WP: ${cedulasConMoroso.size}`);

  // Filtrar usuarios SIN rol moroso
  const wpActivos = allWpUsers.filter(u => {
    const cedula = String(u.user_login);
    return !cedulasConMoroso.has(cedula);
  });
  console.log(`Usuarios SIN rol moroso en WP: ${wpActivos.length}`);

  // Mapear por cédula
  const wpByCedula = {};
  wpActivos.forEach(u => {
    const cedula = String(u.user_login);
    if (cedula) {
      wpByCedula[cedula] = {
        wpId: u.id,
        nombres: u.first_name || '',
        apellidos: u.last_name || '',
        email: u.email,
        roles: u.roles,
        crmId: u.crmid,
        telefono: u.billing_phone || null
      };
    }
  });

  // Paso 2: Usuarios activos en Frapp
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

  // Paso 3: Obtener cuotas en mora de Strapi
  const todasLasCuotasEnMora = await getStrapiCuotasEnMora();

  // Paso 4: Filtrar cuotas con mora >= 6 días
  console.log('=== BLOQUEO PASO 4: Filtrando cuotas con mora >= 6 días ===');
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

  // Paso 5: Cruzar mora grave con usuarios activos
  console.log('=== BLOQUEO PASO 5: Evaluando candidatos a bloqueo ===');
  const candidatos = [];

  cedulasConMoraGrave.forEach(cedula => {
    const enWP = wpByCedula[cedula];
    const enFrapp = frappByCedula[cedula];

    // Solo si existe en WP (sin rol moroso) o en Frapp (sin status moroso)
    if (!enWP && !enFrapp) {
      return; // Ya está bloqueado o no existe
    }

    const cuotas = cuotasMoraGraveByCedula[cedula];
    const maxDiasMora = Math.max(...cuotas.map(c => c.diasMora));

    // Obtener datos de la primera cuota
    const primeraQuota = cuotas[0];
    const celular = primeraQuota.celular || enFrapp?.telefono || enWP?.telefono || null;
    const nombres = primeraQuota.nombres || enFrapp?.nombres || enWP?.nombres || '';
    const apellidos = primeraQuota.apellidos || enFrapp?.apellidos || enWP?.apellidos || '';
    const email = primeraQuota.correo || enFrapp?.email || enWP?.email || null;

    candidatos.push({
      cedula: cedula,
      cuotas: cuotas.map(c => ({
        cuota_nro: c.cuota_nro,
        estado_pago: c.estado_pago,
        fecha_limite: c.fecha_limite,
        diasMora: c.diasMora
      })),
      maxDiasMora: maxDiasMora,
      wpId: enWP?.wpId,
      frappId: enFrapp?.frappId,
      nombres: nombres,
      apellidos: apellidos,
      telefono: celular,
      email: email,
      crmId: enWP?.crmId,
      activoEnWP: !!enWP,
      activoEnFrapp: !!enFrapp
    });
  });

  console.log(`Total candidatos para bloqueo: ${candidatos.length}`);

  return {
    success: true,
    candidatos,
    stats: {
      totalWP: allWpUsers.length,
      wpConMoroso: cedulasConMoroso.size,
      wpActivos: wpActivos.length,
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
    wpOk: false,
    frappOk: false,
    strapiOk: false,
    chatOk: false,
    crmOk: false,
    callbellOk: false,
    errores: []
  };

  const cedula = usuario.cedula;

  // 1. WordPress - Asignar rol moroso
  let wpIdToUse = usuario.wpId;

  // Si no tenemos wpId, intentar obtenerlo
  if (!wpIdToUse) {
    console.log(`Buscando usuario en WordPress por cédula: ${cedula}`);
    try {
      const wpUserUrl = `${WP_BASE_URL}/wp-json/almus/v1/user?user_id=${cedula}&type=login`;
      const response = await axios.get(wpUserUrl, {
        headers: { 'AUTH': WP_AUTH },
        timeout: 15000
      });

      if (response.status === 200 && response.data?.user_login) {
        wpIdToUse = cedula;
        const rolesStr = String(response.data.roles || '').toLowerCase();
        if (rolesStr.includes('moroso')) {
          console.log(`ℹ️ Usuario ya tiene rol moroso en WP`);
          resultados.wpOk = true;
          wpIdToUse = null;
        }
      }
    } catch (e) {
      console.log(`⚠️ Usuario no encontrado en WP: ${e.message}`);
    }
  }

  if (wpIdToUse) {
    console.log(`Bloqueando en WordPress: ${cedula}`);
    try {
      const wpUrl = `${WP_BASE_URL}/wp-json/almus/v1/assign_role`;
      const response = await axios.post(wpUrl,
        `user_id=${wpIdToUse}&roles=moroso`,
        {
          headers: {
            'AUTH': WP_AUTH,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 15000
        }
      );
      if (response.status === 200) {
        resultados.wpOk = true;
        console.log(`✅ WordPress: rol moroso asignado`);
      }
    } catch (e) {
      resultados.errores.push(`WordPress: ${e.message}`);
      console.error(`❌ WordPress error:`, e.message);
    }
  } else if (!resultados.wpOk) {
    resultados.wpOk = true; // No existe en WP, se considera ok
    console.log('⊗ WordPress: Sin wpId, omitido');
  }

  // 2. Frapp - Cambiar status a moroso
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

  // Verificar si al menos uno fue exitoso
  if (!resultados.wpOk && !resultados.frappOk) {
    return resultados;
  }

  // 3. Strapi - Registrar bloqueo en cobranzas
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

  // 4. Google Chat - Notificar bloqueo
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

  // 5. CRM - Actualizar estado a "Dado de baja por mora"
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

  // 6. Callbell - Enviar mensaje WhatsApp
  if (usuario.telefono && CALLBELL_API_KEY) {
    try {
      const callbellUrl = 'https://api.callbell.eu/v1/messages/send';
      const callbellPayload = {
        to: usuario.telefono.toString(),
        from: 'whatsapp',
        type: 'text',
        content: { text: 'Pago' },
        template_uuid: CALLBELL_TEMPLATE_UUID_BLOQUEO,
        optin_contact: true
      };

      const response = await axios.post(callbellUrl, callbellPayload, {
        headers: {
          'Authorization': `Bearer ${CALLBELL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      resultados.callbellOk = true;
      console.log(`✅ Callbell: mensaje enviado`);
    } catch (e) {
      resultados.errores.push(`Callbell: ${e.message}`);
      console.error(`❌ Callbell error:`, e.message);
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
