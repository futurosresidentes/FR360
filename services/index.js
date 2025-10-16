/**
 * FR360 Services Index
 *
 * Exports all service modules for convenient importing
 *
 * Usage:
 *   const services = require('./services');
 *   const products = await services.strapi.getProducts({ mode: 'catalog' });
 *
 * Or import individual services:
 *   const { strapi, fr360, frapp, callbell, oldMembership } = require('./services');
 */

const strapiService = require('./strapiService');
const fr360Service = require('./fr360Service');
const frappService = require('./frappService');
const callbellService = require('./callbellService');
const oldMembershipService = require('./oldMembershipService');

module.exports = {
  strapi: strapiService,
  fr360: fr360Service,
  frapp: frappService,
  callbell: callbellService,
  oldMembership: oldMembershipService,

  // Also export individual services for backward compatibility
  strapiService,
  fr360Service,
  frappService,
  callbellService,
  oldMembershipService
};
