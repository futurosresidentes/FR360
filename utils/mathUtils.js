/**
 * Convierte un valor a número de forma segura
 * @param {any} val - Valor a convertir
 * @returns {number} Número convertido o 0 si falla
 */
function toNumber(val) {
  const num = parseFloat(val);
  return isNaN(num) ? 0 : num;
}

/**
 * Suma los elementos de un array
 * @param {Array<number>} arr - Array de números
 * @returns {number} Suma total
 */
function sumar(arr) {
  if (!Array.isArray(arr)) return 0;
  return arr.reduce((acc, val) => acc + toNumber(val), 0);
}

module.exports = {
  toNumber,
  sumar
};
