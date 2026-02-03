/**
 * Puppeteer configuration
 * Skip Chrome download in production (we use @sparticuz/chromium instead)
 */
const { join } = require('path');

/** @type {import("puppeteer").Configuration} */
module.exports = {
  // Skip Chrome download in production environments
  skipDownload: process.env.NODE_ENV === 'production',
  // Cache directory for development
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
