const moment = require('moment-timezone');

/**
 * Obtiene la fecha actual en Colombia (hora de Bogotá)
 * @returns {Object} { year, month, day, hour, minute, second }
 */
function getColombiaTodayParts() {
  const now = moment().tz('America/Bogota');
  return {
    year: now.year(),
    month: now.month() + 1, // moment usa 0-11
    day: now.date(),
    hour: now.hour(),
    minute: now.minute(),
    second: now.second()
  };
}

/**
 * Formatea una fecha a DD/MM/YYYY
 * @param {string|Date} dateString - Fecha a formatear
 * @returns {string} Fecha formateada
 */
function formatDDMMYYYY(dateString) {
  if (!dateString) return '';
  const m = moment(dateString);
  if (!m.isValid()) return '';
  return m.format('DD/MM/YYYY');
}

/**
 * Calcula la diferencia en meses entre dos fechas
 * @param {string|Date} startDate - Fecha de inicio
 * @param {string|Date} endDate - Fecha de fin
 * @returns {number} Número de meses
 */
function calcularMeses(startDate, endDate) {
  const start = moment(startDate);
  const end = moment(endDate);
  return end.diff(start, 'months');
}

/**
 * Convierte una fecha local a UTC
 * @param {Date} date - Fecha local
 * @returns {Date} Fecha en UTC
 */
function toUTC(date) {
  return moment(date).utc().toDate();
}

/**
 * Encuentra la fecha más reciente de un array
 * @param {Array<string|Date>} dates - Array de fechas
 * @returns {Date|null} Fecha más reciente
 */
function ultimaFecha(dates) {
  if (!dates || dates.length === 0) return null;
  const validDates = dates
    .map(d => moment(d))
    .filter(m => m.isValid())
    .sort((a, b) => b - a);
  return validDates.length > 0 ? validDates[0].toDate() : null;
}

module.exports = {
  getColombiaTodayParts,
  formatDDMMYYYY,
  calcularMeses,
  toUTC,
  ultimaFecha
};
