const axios = require('axios');

// Old WordPress platform configuration
const WP_BASE_URL = process.env.WP_BASE_URL || 'https://app.cursofuturosresidentes.com';
const WP_AUTH_TOKEN = process.env.WP_AUTH_TOKEN;

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
 * @returns {Promise<string>} HTML table with memberships or error message
 */
async function traerMembresiasServer(uid) {
  try {
    const url = `${WP_BASE_URL}/wp-json/almus/v1/user?user_id=${encodeURIComponent(uid)}&type=login`;

    const response = await axios.get(url, {
      headers: {
        'AUTH': WP_AUTH_TOKEN
      }
    });

    if (response.status !== 200) return '';

    const data = response.data.memberships || [];
    if (!data.length) return '';

    let html = '<table><thead><tr>'
      + '<th>Id</th><th>Membresía</th><th>Fecha inicio</th>'
      + '<th>Fecha fin</th><th>Estado</th><th class="actions-header">Acciones</th></tr></thead><tbody>';

    data.forEach(m => {
      let role = (m.roles || '').replace(/elite/gi, 'Élite');
      let months = calcularMeses(m.start_date, m.expiry_date);

      if (months != null) {
        const color = m.status === 'active' ? '#fff' : '#999';
        role += ` <span style="color:${color}">(${months} ${months === 1 ? 'mes' : 'meses'})</span>`;
      }

      const highlightClass = m.status === 'active' ? ' class="highlight"' : '';

      html += `<tr${highlightClass}>`
        + `<td>${m.id || ''}</td>`
        + `<td>${role}</td>`
        + `<td>${formatDDMMYYYY(m.start_date)}</td>`
        + `<td>${formatDDMMYYYY(m.expiry_date)}</td>`
        + `<td>${m.status || ''}</td>`
        + `</tr>`;
    });

    return html + '</tbody></table>';
  } catch (error) {
    console.log('❌ Error fetching WordPress memberships:', error.message);
    return `<p style="color:red">Error interno: ${error.message}</p>`;
  }
}

module.exports = {
  traerMembresiasServer,
  calcularMeses,
  formatDDMMYYYY
};
