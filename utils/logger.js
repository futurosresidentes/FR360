/**
 * Simple logger utility
 * En producción, los logs de debug se deshabilitan automáticamente
 */

const isDevelopment = process.env.NODE_ENV !== 'production';

const logger = {
  /**
   * Log de debug - solo en desarrollo
   */
  debug: (...args) => {
    if (isDevelopment) {
      console.log('[DEBUG]', ...args);
    }
  },

  /**
   * Log de información - siempre se muestra
   */
  info: (...args) => {
    console.log('[INFO]', ...args);
  },

  /**
   * Log de advertencia - siempre se muestra
   */
  warn: (...args) => {
    console.warn('[WARN]', ...args);
  },

  /**
   * Log de error - siempre se muestra
   */
  error: (...args) => {
    console.error('[ERROR]', ...args);
  }
};

module.exports = logger;
