/**
 * Normaliza un número de teléfono colombiano
 * @param {string} phoneInput - Número de teléfono a normalizar
 * @returns {string} Número normalizado en formato +57XXXXXXXXXX
 */
function normalizeColombianPhone(phoneInput) {
  if (!phoneInput) return '';

  // Remover espacios, guiones, paréntesis
  let cleaned = phoneInput.toString().replace(/[\s\-\(\)]/g, '');

  // Si comienza con +57, dejarlo así
  if (cleaned.startsWith('+57')) {
    return cleaned;
  }

  // Si comienza con 57 (sin +), agregar el +
  if (cleaned.startsWith('57') && cleaned.length >= 12) {
    return '+' + cleaned;
  }

  // Si comienza con 3 (celular colombiano), agregar +57
  if (cleaned.startsWith('3') && cleaned.length === 10) {
    return '+57' + cleaned;
  }

  // Si no tiene prefijo, asumir que es colombiano
  return '+57' + cleaned;
}

module.exports = {
  normalizeColombianPhone
};
