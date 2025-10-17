const axios = require('axios');

// Old WordPress platform configuration
const WP_BASE_URL = process.env.OLD_MEMB_BASE_URL;
const WP_AUTH_TOKEN = process.env.OLD_MEMB_AUTH;

// Validate required environment variables
if (!WP_BASE_URL || !WP_AUTH_TOKEN) {
  console.error('❌ Missing required WordPress environment variables');
  console.error('Required: OLD_MEMB_BASE_URL, OLD_MEMB_AUTH');
}

/**
 * Calculate months between two dates
 * @param {string} start - Start date
 * @param {string} end - End date
 * @returns {number|null} Number of months or null
 */
function calcularMeses(start, end) {
  if (!start || !end) return null;
  const d1 = new Date(start);
  const d2 = new Date(end);
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
  return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24 * 30));
}

/**
 * Format date to DD/MM/YYYY
 * @param {string} s - Date string
 * @returns {string} Formatted date or empty string
 */
function formatDDMMYYYY(s) {
  const d = new Date(s);
  if (isNaN(d)) return '';

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();

  return `${day}/${month}/${year}`;
}

/**
 * Fetch memberships from old WordPress platform
 * @param {string} uid - User ID
 * @returns {Promise<Object>} Object with user info and memberships, or error info
 */
async function traerMembresiasServer(uid) {
  try {
    const url = `${WP_BASE_URL}/wp-json/almus/v1/user?user_id=${encodeURIComponent(uid)}&type=login`;

    console.log('🔍 WordPress request:', {
      url,
      hasToken: !!WP_AUTH_TOKEN,
      tokenLength: WP_AUTH_TOKEN?.length
    });

    const response = await axios.get(url, {
      headers: {
        'AUTH': WP_AUTH_TOKEN,
        'User-Agent': 'FR360-NodeJS/1.0',
        'Accept': '*/*'
      },
      validateStatus: function (status) {
        return status < 500; // No throw on 4xx errors
      },
      timeout: 15000,
      maxRedirects: 5
    });

    console.log('📡 WordPress response:', {
      status: response.status,
      hasData: !!response.data,
      dataKeys: response.data ? Object.keys(response.data) : []
    });

    if (response.status !== 200) {
      console.log('⚠️ WordPress returned non-200:', response.status, response.data);

      // Si es 404 y el código es invalid_user_id, el usuario no existe en WordPress
      if (response.status === 404 && response.data?.code === 'invalid_user_id') {
        console.log('ℹ️ Usuario no encontrado en WordPress (404 - invalid_user_id)');
        return {
          error: true,
          message: '<p style="color:#666;font-style:italic;">Sin membresías en plataforma vieja (Wordpress)</p>'
        };
      }

      // Si es 401, el servicio puede estar deprecado o el token expiró
      if (response.status === 401) {
        console.log('ℹ️ WordPress service unavailable (401 - auth expired)');
        return {
          error: true,
          message: '<p style="color:#666;font-style:italic;">Servicio de membresías antiguas no disponible</p>'
        };
      }

      return { error: true, message: '' };
    }

    const apiData = response.data;
    const memberships = apiData.memberships || [];

    // Retornar objeto completo con info del usuario y membresías
    return {
      user: {
        first_name: apiData.first_name || '',
        last_name: apiData.last_name || '',
        user_email: apiData.user_email || '',
        user_login: apiData.user_login || uid,
        roles: apiData.roles || ''
      },
      memberships: memberships
    };

  } catch (error) {
    console.log('❌ Error fetching WordPress memberships:', error.message);

    // Si es error de red o timeout, mostrar mensaje amigable
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      console.log('ℹ️ WordPress service unavailable (network error)');
      return {
        error: true,
        message: '<p style="color:#666;font-style:italic;">Servicio de membresías antiguas no disponible</p>'
      };
    }

    // Para otros errores, mostrar genérico
    return {
      error: true,
      message: '<p style="color:#666;font-style:italic;">Error al consultar membresías antiguas</p>'
    };
  }
}

module.exports = {
  traerMembresiasServer,
  calcularMeses,
  formatDDMMYYYY
};
