/**
 * FR360 API Client
 * Clean replacement for Google Apps Script client-side calls
 * All functions return Promises for modern async/await usage
 */

class FR360ApiClient {
  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl;
  }

  /**
   * Generic API call handler
   * @private
   */
  async _call(endpoint, ...args) {
    try {
      const response = await fetch(`${this.baseUrl}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ args })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Handle error responses from backend
      if (data.success === false) {
        throw new Error(data.error || 'Error desconocido del servidor');
      }

      // Return result or full data object
      return data.result !== undefined ? data.result : data;
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  }

  /**
   * Wrapper for legacy callback-style code
   * Usage: api.legacy('functionName', args).then(successHandler).catch(failureHandler)
   */
  legacy(endpoint, ...args) {
    return this._call(endpoint, ...args);
  }

  // ===== CITIZEN & CRM =====

  async getCitizenServer(uid) {
    return this._call('getCitizenServer', uid);
  }

  async fetchCrmByEmail(email) {
    return this._call('fetchCrmByEmail', email);
  }

  async fetchCrmStrapiOnly(uid) {
    return this._call('fetchCrmStrapiOnly', uid);
  }

  async sincronizarCrmPorNumeroDocumento(uid) {
    return this._call('sincronizarCrmPorNumeroDocumento', uid);
  }

  // ===== PRODUCTS =====

  async getProductosServer() {
    return this._call('getProductosServer');
  }

  async getProductosCatalog() {
    return this._call('getProductosCatalog');
  }

  async getActiveMembershipPlans() {
    return this._call('getActiveMembershipPlans');
  }

  // ===== CALLBELL =====

  async getCallbellContact(celular) {
    return this._call('getCallbellContact', celular);
  }

  async sendWhatsAppMessage(celular, producto, linkUrl) {
    return this._call('sendWhatsAppMessage', celular, producto, linkUrl);
  }

  async checkMessageStatus(messageUuid) {
    return this._call('checkMessageStatus', messageUuid);
  }

  // ===== MEMBERSHIPS =====

  async traerMembresiasServer(uid) {
    return this._call('traerMembresiasServer', uid);
  }

  async fetchMembresiasFRAPP(uid) {
    return this._call('fetchMembresiasFRAPP', uid);
  }

  async registerMembFRAPP(payload) {
    return this._call('registerMembFRAPP', payload);
  }

  async updateMembershipFRAPP(membershipId, changedById, reason, changes) {
    return this._call('updateMembershipFRAPP', membershipId, changedById, reason, changes);
  }

  async freezeMembershipFRAPP(membershipId, changedById, reason, changes) {
    return this._call('freezeMembershipFRAPP', membershipId, changedById, reason, changes);
  }

  async updateUserFRAPP(userId, userData) {
    return this._call('updateUserFRAPP', userId, userData);
  }

  async appendPatrocinioRecord(data) {
    return this._call('appendPatrocinioRecord', data);
  }

  async saveConfianzaRecord(data) {
    return this._call('saveConfianzaRecord', data);
  }

  // ===== CLICKUP TICKETS =====

  async createClickUpTask(taskData) {
    return this._call('createClickUpTask', taskData);
  }

  // ===== SALES & AGREEMENTS =====

  async fetchVentas(uid) {
    return this._call('fetchVentas', uid);
  }

  async fetchAcuerdos(uid) {
    return this._call('fetchAcuerdos', uid);
  }

  async processSinglePayment(formData) {
    return this._call('processSinglePayment', formData);
  }

  async resolvePagoYActualizarCartera(payload) {
    return this._call('resolvePagoYActualizarCartera', payload);
  }

  async crearAcuerdo(...args) {
    return this._call('crearAcuerdo', ...args);
  }

  async consultarAcuerdo(nroAcuerdo) {
    return this._call('consultarAcuerdo', nroAcuerdo);
  }

  // ===== LINKS =====

  async getLinksByIdentityDocument(uid) {
    return this._call('getLinksByIdentityDocument', uid);
  }

  // ===== USER =====

  async getUserEmail() {
    // User email is already available in USER_EMAIL global variable
    // No need to call server
    return Promise.resolve(USER_EMAIL);
  }
}

// Create global instance
window.api = new FR360ApiClient();

// Helper function for retry logic
window.apiWithRetry = async function(fn, tries = 3, wait = 1000) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < tries) {
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
};
