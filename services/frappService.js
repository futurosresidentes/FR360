const axios = require('axios');

// FRAPP API configuration
const FRAPP_BASE_URL = process.env.FRAPP_BASE_URL;
const FRAPP_API_KEY = process.env.FRAPP_API_KEY;
const FRAPP_API_KEY_READ = FRAPP_API_KEY;
const FRAPP_API_KEY_REGISTER = process.env.FRAPP_API_KEY_REGISTER || FRAPP_API_KEY;
const FRAPP_API_KEY_UPDATE = process.env.FRAPP_API_KEY_UPDATE || FRAPP_API_KEY;
const FRAPP_API_KEY_FILTERS = process.env.FRAPP_API_KEY_FILTERS || FRAPP_API_KEY;
const FRAPP_API_KEY_PLANS = process.env.FRAPP_API_KEY_PLANS || FRAPP_API_KEY;
const FRAPP_API_KEY_UPDATE_USER = process.env.FRAPP_API_KEY_UPDATE_USER || FRAPP_API_KEY;

// Validate required environment variables
if (!FRAPP_BASE_URL || !FRAPP_API_KEY) {
  console.error('❌ Missing required FRAPP environment variables');
  console.error('Required: FRAPP_BASE_URL, FRAPP_API_KEY');
}

// Log API keys configuration (only first 8 characters for security)
console.log('🔑 FRAPP API Keys configuradas:');
console.log('  - READ:', FRAPP_API_KEY_READ?.substring(0, 8) + '...');
console.log('  - REGISTER:', FRAPP_API_KEY_REGISTER?.substring(0, 8) + '...');
console.log('  - UPDATE:', FRAPP_API_KEY_UPDATE?.substring(0, 8) + '...');
console.log('  - FILTERS:', FRAPP_API_KEY_FILTERS?.substring(0, 8) + '...');
console.log('  - PLANS:', FRAPP_API_KEY_PLANS?.substring(0, 8) + '...');

/**
 * Retry helper with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Initial retry delay in milliseconds
 * @returns {Promise} Result of the function
 */
async function retryWithBackoff(fn, maxRetries = 5, retryDelay = 1000) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        console.log(`⏱️ Esperando ${retryDelay}ms antes del próximo intento...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw lastError;
}

/**
 * Fetch memberships from FRAPP by identity document
 * @param {string} uid - Identity document number
 * @returns {Promise<Object>} Object with user, memberships, and pagination
 */
async function fetchMembresiasFRAPP(uid) {
  const url = `${FRAPP_BASE_URL}/api/user/memberships?identityDocument=${encodeURIComponent(uid)}`;

  try {
    return await retryWithBackoff(async (attempt) => {
      console.log(`🔄 fetchMembresiasFRAPP attempt ${attempt}/5`);

      const response = await axios.get(url, {
        headers: {
          'x-api-key': FRAPP_API_KEY_READ
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status} - ${response.data}`);
      }

      const user = response.data.user || null;
      const memberships = Array.isArray(response.data.memberships) ? response.data.memberships : [];
      const pagination = response.data.pagination || {};

      return { user, memberships, pagination };
    });
  } catch (error) {
    console.log('❌ fetchMembresiasFRAPP failed after all retries:', error.message);
    // Return stable shape to not break the frontend
    return {
      user: null,
      memberships: [],
      pagination: {},
      error: error.message || 'unknown'
    };
  }
}

/**
 * Register a new membership in FRAPP
 * @param {Object} payload - Registration data
 * @returns {Promise<Object>} Result object with status
 */
async function registerMembFRAPP(payload) {
  const url = `${FRAPP_BASE_URL}/api/v2/auth/register`;

  console.log('=== REGISTRO DE MEMBRESÍA ===');
  console.log('Payload enviado:', JSON.stringify(payload, null, 2));
  console.log('URL:', url);

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'x-api-key': FRAPP_API_KEY_REGISTER,
        'Content-Type': 'application/json'
      }
    });

    console.log('Status HTTP:', response.status);
    console.log('Respuesta raw:', response.data);
    console.log('Respuesta parseada:', JSON.stringify(response.data, null, 2));

    const data = response.data;
    data.status = response.status;

    console.log('Datos finales a devolver:', JSON.stringify(data, null, 2));
    return data;
  } catch (error) {
    console.log('Error al registrar membresía:', error.message);

    if (error.response) {
      console.log('Status HTTP:', error.response.status);
      console.log('Respuesta raw:', error.response.data);

      const data = error.response.data;
      data.status = error.response.status;
      return data;
    } else {
      return {
        success: false,
        error: error.message,
        status: 500
      };
    }
  }
}

/**
 * Update a membership in FRAPP
 * @param {string} membershipId - Membership ID
 * @param {string} changedById - ID of user making the change
 * @param {string} reason - Reason for the update
 * @param {Object} changes - Changes to apply
 * @returns {Promise<Object>} Updated membership data
 */
async function updateMembershipFRAPP(membershipId, changedById, reason, changes) {
  const url = `${FRAPP_BASE_URL}/api/memberships/${membershipId}/update`;

  const payload = {
    changedById: changedById,
    reason: reason,
    changes: changes
  };

  console.log('🔄 Actualizando membresía:', membershipId);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.put(url, payload, {
      headers: {
        'x-api-key': FRAPP_API_KEY_UPDATE,
        'Content-Type': 'application/json'
      }
    });

    if (response.status === 200) {
      console.log('✅ Membresía actualizada exitosamente');
      return response.data;
    } else {
      throw new Error(response.data.message || JSON.stringify(response.data));
    }
  } catch (error) {
    console.log('❌ Error actualizando membresía:', error.message);

    if (error.response && error.response.data) {
      const err = error.response.data;
      throw new Error(err.message || JSON.stringify(err));
    }

    throw error;
  }
}

/**
 * Get active membership plans from FRAPP
 * @returns {Promise<Array>} Array of active membership plans
 */
async function getActiveMembershipPlans() {
  const url = `${FRAPP_BASE_URL}/api/plans`;

  console.log('=== OBTENIENDO PLANES DE MEMBRESÍA (via /api/plans) ===');
  console.log('URL:', url);
  console.log('API Key configurada:', FRAPP_API_KEY_PLANS ? 'SÍ' : 'NO');

  try {
    const response = await axios.get(url, {
      headers: {
        'x-api-key': FRAPP_API_KEY_PLANS
      }
    });

    console.log('✅ Status HTTP:', response.status);

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status} - ${response.data}`);
    }

    // Flatten plans + versions into a flat list for dropdowns
    // id = version.id (planVersionId), planId = plan.id
    const plans = response.data.data || [];
    const flatVersions = [];

    for (const plan of plans) {
      for (const version of (plan.versions || [])) {
        if (version.isActive) {
          flatVersions.push({
            id: version.id,
            planId: plan.id,
            name: plan.name + ' — ' + version.label,
            planName: plan.name,
            planHandle: plan.handle,
            versionLabel: version.label,
            isDefault: version.isDefault
          });
        }
      }
    }

    console.log('✅ Versiones activas encontradas:', flatVersions.length);
    return flatVersions;

  } catch (error) {
    console.error('❌ Error obteniendo planes de membresía:', error.message);

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
      console.error('Headers enviados:', error.config?.headers);
    }

    throw new Error(`No se pudieron cargar los planes: ${error.message}`);
  }
}

/**
 * Get product handle from FRAPP by product name
 * @param {string} productName - Product name to search
 * @returns {Promise<string|null>} Product handle or null
 */
async function getProductHandleFromFRAPP(productName) {
  const url = `${FRAPP_BASE_URL}/api/filters?search=${encodeURIComponent(productName)}`;

  try {
    console.log('Buscando producto:', productName);
    console.log('URL:', url);

    const response = await axios.get(url, {
      headers: {
        'x-api-key': FRAPP_API_KEY_FILTERS
      }
    });

    console.log('Status HTTP:', response.status);

    if (response.status !== 200) {
      console.log('Error HTTP response:', response.data);
      throw new Error(`HTTP ${response.status} - ${response.data}`);
    }

    console.log('Body received:', JSON.stringify(response.data));

    // Ensure products exists and has elements
    if (response.data.products && response.data.products.length > 0) {
      const handle = response.data.products[0].handle || null;
      console.log('Handle encontrado:', handle);
      return handle;
    }

    console.log('No se encontraron productos en la respuesta');
    return null;
  } catch (error) {
    console.log('Error getting product handle:', error.message);
    return null;
  }
}

/**
 * Freeze membership in FRAPP
 * @param {string} membershipId - Membership ID
 * @param {string} changedById - ID of user making the change
 * @param {string} reason - Reason for freezing
 * @param {Object} changes - Changes to apply
 * @returns {Promise<Object>} Updated membership data
 */
async function freezeMembershipFRAPP(membershipId, changedById, reason, changes) {
  // Freezing is essentially an update with specific status
  return updateMembershipFRAPP(membershipId, changedById, reason, changes);
}

/**
 * Append patrocinio record
 * @param {Object} data - Patrocinio data
 * @returns {Promise<Object>} Result
 */
async function appendPatrocinioRecord(data) {
  console.log('⚠️ appendPatrocinioRecord needs full implementation (Google Sheets integration)');
  console.log('📝 Data to save:', data);

  // Return success for now to not break the flow
  return {
    success: true,
    message: 'Registro de patrocinio guardado (stub)'
  };
}

/**
 * Update user in FRAPP
 * @param {number} userId - User ID
 * @param {Object} userData - User data to update
 * @returns {Promise<Object>} Result object with status
 */
async function updateUserFRAPP(userId, userData) {
  const url = `${FRAPP_BASE_URL}/api/users/${userId}`;

  console.log('=== ACTUALIZACIÓN DE USUARIO FRAPP ===');
  console.log('User ID:', userId);
  console.log('Datos a actualizar:', JSON.stringify(userData, null, 2));
  console.log('URL:', url);
  console.log('API Key (primeros 8 chars):', FRAPP_API_KEY_UPDATE_USER?.substring(0, 8) + '...');

  try {
    const response = await axios.put(url, userData, {
      headers: {
        'x-api-key': FRAPP_API_KEY_UPDATE_USER,
        'Content-Type': 'application/json'
      }
    });

    console.log('Status HTTP:', response.status);
    console.log('Respuesta:', JSON.stringify(response.data, null, 2));

    return {
      success: true,
      status: response.status,
      data: response.data
    };
  } catch (error) {
    console.error('Error al actualizar usuario:', error.message);

    if (error.response) {
      console.error('Status HTTP:', error.response.status);
      console.error('Respuesta:', error.response.data);

      return {
        success: false,
        status: error.response.status,
        error: error.response.data?.error || error.response.data?.message || 'Error desconocido',
        validationErrors: error.response.data?.validationErrors || null
      };
    }

    return {
      success: false,
      error: error.message || 'Error de conexión'
    };
  }
}

/**
 * Fetch entitlements (planes) from FRAPP by identity document
 */
const FRAPP_API_KEY_ENTITLEMENTS = process.env.FRAPP_API_KEY_ENTITLEMENTS || FRAPP_API_KEY;
const FRAPP_API_KEY_ENTITLEMENTS_UPDATE = process.env.FRAPP_API_KEY_ENTITLEMENTS_UPDATE || FRAPP_API_KEY;

async function fetchEntitlementsFRAPP(uid) {
  const url = `${FRAPP_BASE_URL}/api/user/entitlements?identityDocument=${encodeURIComponent(uid)}`;

  try {
    return await retryWithBackoff(async (attempt) => {
      console.log(`🔄 fetchEntitlementsFRAPP attempt ${attempt}/5`);

      const response = await axios.get(url, {
        headers: {
          'x-api-key': FRAPP_API_KEY_ENTITLEMENTS
        }
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status} - ${response.data}`);
      }

      return response.data;
    });
  } catch (error) {
    console.log('❌ fetchEntitlementsFRAPP failed after all retries:', error.message);
    return {
      success: false,
      data: { entitlements: [], users: {}, pagination: {}, aggregations: {} },
      error: error.message || 'unknown'
    };
  }
}

/**
 * Fetch active plans and their versions from FRAPP
 * GET /api/plans?search=...
 */
async function fetchPlansFRAPP(search) {
  let url = `${FRAPP_BASE_URL}/api/plans`;
  if (search) url += `?search=${encodeURIComponent(search)}`;

  try {
    const response = await axios.get(url, {
      headers: { 'x-api-key': FRAPP_API_KEY_PLANS }
    });
    return response.data;
  } catch (error) {
    console.log('❌ fetchPlansFRAPP error:', error.message);
    if (error.response && error.response.data) return error.response.data;
    return { success: false, error: error.message };
  }
}

/**
 * Update an entitlement via PATCH /api/update-entitlement/:entitlementId
 * body: { changedById, reason, status?, startDate?, expiryDate?, freezeDate?, daysRemainingAtFreeze?, ... }
 */
async function updateEntitlementFRAPP(entitlementId, body) {
  const url = `${FRAPP_BASE_URL}/api/update-entitlement/${entitlementId}`;

  console.log('🔄 Actualizando entitlement:', entitlementId);
  console.log('Payload:', JSON.stringify(body, null, 2));

  try {
    const response = await axios.patch(url, body, {
      headers: {
        'x-api-key': FRAPP_API_KEY_ENTITLEMENTS_UPDATE,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Entitlement actualizado exitosamente');
    return response.data;
  } catch (error) {
    console.log('❌ Error actualizando entitlement:', error.message);
    if (error.response && error.response.data) {
      return { error: true, ...error.response.data };
    }
    throw error;
  }
}

module.exports = {
  fetchEntitlementsFRAPP,
  fetchPlansFRAPP,
  fetchMembresiasFRAPP,
  registerMembFRAPP,
  updateMembershipFRAPP,
  updateEntitlementFRAPP,
  getActiveMembershipPlans,
  getProductHandleFromFRAPP,
  freezeMembershipFRAPP,
  appendPatrocinioRecord,
  updateUserFRAPP
};
