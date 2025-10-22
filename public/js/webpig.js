// Web Pig - Webhook Transactions Manager

// Use local proxy endpoints instead of direct API calls for security
const WEBPIG_API_URL = '/api/webpig/webhooks';
const WEBPIG_FEATURE_FLAGS_URL = '/api/webpig/feature-flags';

// Permissions mapping
const FLAG_PERMISSIONS = {
  'MEMBERSHIPS_ENABLED': ['daniel.cardona@sentiretaller.com'],
  'WORLDOFFICE_INVOICE_ENABLED': ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com'],
  'WORLDOFFICE_DIAN_ENABLED': ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com']
};

// Stage mapping to columns
const STAGE_COLUMNS = {
  'membership_creation': 'FRAPP',
  'crm_management': 'CRM',
  'crm_upsert': 'CRM',
  'worldoffice_customer': 'WO',
  'worldoffice_invoice_creation': 'Factura',
  'worldoffice_invoice_accounting': 'Factura',
  'worldoffice_dian_emission': 'DIAN',
  'strapi_sync': 'Strapi'
};

// Fetch webhooks from API
async function fetchWebhooks() {
  try {
    const response = await fetch(WEBPIG_API_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching webhooks:', error);
    throw error;
  }
}

// Fetch feature flags from API
async function fetchFeatureFlags() {
  try {
    const response = await fetch(WEBPIG_FEATURE_FLAGS_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    throw error;
  }
}

// Update feature flag
async function updateFeatureFlag(flagKey, value) {
  try {
    const response = await fetch(`${WEBPIG_FEATURE_FLAGS_URL}/${flagKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error updating feature flag:', error);
    throw error;
  }
}

// Check if user has permission for flag
function hasPermission(flagKey, userEmail) {
  const allowedUsers = FLAG_PERMISSIONS[flagKey];
  if (!allowedUsers) return false;
  return allowedUsers.includes(userEmail.toLowerCase());
}

// Extract invoice ID from logs
function extractInvoiceId(webhook) {
  const extractionLog = webhook.logs.all.find(log =>
    log.stage === 'invoice_extraction' && log.status === 'success'
  );

  if (extractionLog && extractionLog.details) {
    const match = extractionLog.details.match(/Invoice ID extraído:\s*(\S+)/);
    if (match) return match[1];
  }

  return webhook.invoice_id || 'N/A';
}

// Extract customer from fr360_query logs
function extractCustomer(webhook) {
  const fr360Log = webhook.logs.all.find(log =>
    log.stage === 'fr360_query' && log.status === 'success'
  );

  if (fr360Log && fr360Log.details) {
    const match = fr360Log.details.match(/Cliente:\s*([^,]+)/);
    if (match) return match[1].trim();
  }

  return webhook.customer?.name || 'N/A';
}

// Extract cedula from fr360_query logs
function extractCedula(webhook) {
  const fr360Log = webhook.logs.all.find(log =>
    log.stage === 'fr360_query' && log.status === 'success'
  );

  if (fr360Log && fr360Log.details) {
    const match = fr360Log.details.match(/Cédula:\s*(\d+)/);
    if (match) return match[1];
  }

  return 'N/A';
}

// Extract product from fr360_query logs
function extractProduct(webhook) {
  const fr360Log = webhook.logs.all.find(log =>
    log.stage === 'fr360_query' && log.status === 'success'
  );

  if (fr360Log && fr360Log.details) {
    const match = fr360Log.details.match(/Producto:\s*([^,]+)/);
    if (match) return match[1].trim();
  }

  return webhook.product || 'N/A';
}

// Extract phone from fr360_query logs
function extractPhone(webhook) {
  // Try to get phone from fr360_query response_data
  const fr360Log = webhook.logs.all.find(log =>
    log.stage === 'fr360_query' && log.status === 'success'
  );

  if (fr360Log && fr360Log.response_data && fr360Log.response_data.phone) {
    let phone = fr360Log.response_data.phone;
    // Add 57 if it's a 10-digit Colombian number without country code
    if (phone && !phone.startsWith('57') && phone.length === 10) {
      phone = '57' + phone;
    }
    return phone;
  }

  // Fallback to raw_data
  if (webhook.raw_data?.x_customer_movil) {
    let phone = webhook.raw_data.x_customer_movil;
    // Add 57 if it's a 10-digit Colombian number without country code
    if (phone && !phone.startsWith('57') && phone.length === 10) {
      phone = '57' + phone;
    }
    return phone;
  }

  return 'N/A';
}

// Check if transaction was accepted
function isTransactionAccepted(webhook) {
  return webhook.response === 'Aceptada';
}

// Get stage status for a specific column
function getStageStatus(webhook, columnName, isAccepted) {
  // If transaction was rejected, don't show stages
  if (!isAccepted) {
    return { status: 'not-applicable', icon: '-', logs: [] };
  }

  const relevantStages = Object.entries(STAGE_COLUMNS)
    .filter(([_, col]) => col === columnName)
    .map(([stage, _]) => stage);

  const logs = webhook.logs.all.filter(log =>
    relevantStages.includes(log.stage)
  );

  if (logs.length === 0) {
    return { status: 'not-run', icon: '⛔', logs: [] };
  }

  // Check if stage was skipped due to feature flag
  const hasSkipped = logs.some(log =>
    log.response_data?.skipped === true &&
    log.response_data?.reason &&
    (log.response_data.reason.includes('_ENABLED=false') || log.response_data.reason.includes('feature flag'))
  );

  const hasError = logs.some(log => log.status === 'error');
  const hasSuccess = logs.some(log => log.status === 'success');
  const hasProcessing = logs.some(log => log.status === 'processing');
  const hasInfo = logs.some(log => log.status === 'info' && !log.response_data?.skipped);

  if (hasSkipped) {
    return { status: 'skipped', icon: '⚠️', logs };
  } else if (hasError) {
    return { status: 'error', icon: '⛔', logs };
  } else if (hasSuccess) {
    return { status: 'success', icon: '✅', logs };
  } else if (hasInfo) {
    return { status: 'success', icon: '✅', logs };
  } else if (hasProcessing) {
    return { status: 'pending', icon: '⏳', logs };
  }

  return { status: 'not-run', icon: '⛔', logs };
}

// Format date
function formatDate(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

// Show stage details modal
function showStageDetails(columnName, logs, webhookData) {
  const modal = document.getElementById('stageDetailsModal');
  const title = document.getElementById('stageDetailsTitle');
  const body = document.getElementById('stageDetailsBody');

  title.textContent = `Detalles: ${columnName}`;

  if (!logs || logs.length === 0) {
    body.innerHTML = '<div class="no-logs">No hay logs disponibles para este stage</div>';
  } else {
    body.innerHTML = logs.map(log => {
      const statusClass = log.status === 'success' || log.status === 'info' ? 'success' :
                         log.status === 'error' ? 'error' : 'info';

      let content = `
        <div class="stage-detail-item ${statusClass}">
          <div class="stage-detail-header">
            <span class="stage-detail-stage">${log.stage}</span>
            <span class="stage-detail-timestamp">${formatDate(log.created_at)}</span>
          </div>
          <div class="stage-detail-details">${log.details || 'Sin detalles'}</div>
      `;

      if (log.error_message) {
        content += `
          <div class="stage-detail-data">
            <h4>Error</h4>
            <pre>${log.error_message}</pre>
          </div>
        `;
      }

      if (log.request_payload) {
        content += `
          <div class="stage-detail-data">
            <h4>Request Payload</h4>
            <pre>${JSON.stringify(log.request_payload, null, 2)}</pre>
          </div>
        `;
      }

      if (log.response_data) {
        content += `
          <div class="stage-detail-data">
            <h4>Response Data</h4>
            <pre>${JSON.stringify(log.response_data, null, 2)}</pre>
          </div>
        `;
      }

      content += '</div>';
      return content;
    }).join('');
  }

  modal.classList.remove('hidden');
}

// Close stage details modal
function closeStageDetails() {
  const modal = document.getElementById('stageDetailsModal');
  modal.classList.add('hidden');
}

// Render webhooks table
function renderWebhooks(webhooks) {
  const container = document.getElementById('webpigContainer');

  if (!webhooks || webhooks.length === 0) {
    container.innerHTML = '<div class="webhook-empty">No hay transacciones disponibles</div>';
    return;
  }

  const table = document.createElement('table');
  table.id = 'webhooksTable';

  // Table header
  table.innerHTML = `
    <thead>
      <tr>
        <th>ID</th>
        <th>Cliente</th>
        <th>Producto</th>
        <th>Estado</th>
        <th>FRAPP</th>
        <th>CRM</th>
        <th>WO</th>
        <th>Factura</th>
        <th>DIAN</th>
        <th>Strapi</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  // Table rows
  webhooks.forEach(webhook => {
    const row = document.createElement('tr');

    const invoiceId = extractInvoiceId(webhook);
    const customer = extractCustomer(webhook);
    const cedula = extractCedula(webhook);
    const product = extractProduct(webhook);
    const phone = extractPhone(webhook);
    const isAccepted = isTransactionAccepted(webhook);

    // Estado icon
    const estadoIcon = isAccepted ? '✅' : '🚫';

    const frappStatus = getStageStatus(webhook, 'FRAPP', isAccepted);
    const crmStatus = getStageStatus(webhook, 'CRM', isAccepted);
    const woStatus = getStageStatus(webhook, 'WO', isAccepted);
    const facturaStatus = getStageStatus(webhook, 'Factura', isAccepted);
    const dianStatus = getStageStatus(webhook, 'DIAN', isAccepted);
    const strapiStatus = isAccepted ? { status: 'not-run', icon: '⛔', logs: [] } : { status: 'not-applicable', icon: '-', logs: [] };

    row.innerHTML = `
      <td class="id-col">${webhook.id}</td>
      <td class="customer-col">
        <div class="customer-name" title="${customer}">${customer}</div>
        <div class="customer-cedula">CC ${cedula}</div>
        <div class="customer-email" title="${webhook.customer?.email || 'N/A'}">${webhook.customer?.email || 'N/A'}</div>
        <div class="customer-phone" title="${phone}">${phone}</div>
      </td>
      <td class="product-col" title="${product}">${product}</td>
      <td class="estado-col">${estadoIcon}</td>
      <td class="stage-col">
        <span class="stage-icon ${frappStatus.status}" data-column="FRAPP" data-webhook-id="${webhook.id}">
          ${frappStatus.icon}
        </span>
      </td>
      <td class="stage-col">
        <span class="stage-icon ${crmStatus.status}" data-column="CRM" data-webhook-id="${webhook.id}">
          ${crmStatus.icon}
        </span>
      </td>
      <td class="stage-col">
        <span class="stage-icon ${woStatus.status}" data-column="WO" data-webhook-id="${webhook.id}">
          ${woStatus.icon}
        </span>
      </td>
      <td class="stage-col">
        <span class="stage-icon ${facturaStatus.status}" data-column="Factura" data-webhook-id="${webhook.id}">
          ${facturaStatus.icon}
        </span>
      </td>
      <td class="stage-col">
        <span class="stage-icon ${dianStatus.status}" data-column="DIAN" data-webhook-id="${webhook.id}">
          ${dianStatus.icon}
        </span>
      </td>
      <td class="stage-col">
        <span class="stage-icon ${strapiStatus.status}" data-column="Strapi" data-webhook-id="${webhook.id}">
          ${strapiStatus.icon}
        </span>
      </td>
    `;

    tbody.appendChild(row);

    // Store webhook data for later retrieval
    row.dataset.webhookData = JSON.stringify({
      FRAPP: frappStatus,
      CRM: crmStatus,
      WO: woStatus,
      Factura: facturaStatus,
      DIAN: dianStatus,
      Strapi: strapiStatus
    });
  });

  container.innerHTML = '';
  container.appendChild(table);

  // Add click handlers to stage icons
  table.querySelectorAll('.stage-icon').forEach(icon => {
    icon.addEventListener('click', function() {
      const column = this.dataset.column;
      const row = this.closest('tr');
      const webhookData = JSON.parse(row.dataset.webhookData);
      const stageData = webhookData[column];

      if (stageData && stageData.logs) {
        showStageDetails(column, stageData.logs, webhookData);
      }
    });
  });
}

// Show loading state
function showLoading() {
  const container = document.getElementById('webpigContainer');
  container.innerHTML = '<div class="webhook-loading">🔄 Cargando transacciones...</div>';
}

// Show error
function showError(message) {
  const container = document.getElementById('webpigContainer');
  container.innerHTML = `<div class="webhook-error">❌ Error: ${message}</div>`;
}

// Load feature flags
async function loadFeatureFlags() {
  try {
    const data = await fetchFeatureFlags();

    if (data.success && data.flags) {
      renderFeatureFlags(data.flags);
    }
  } catch (error) {
    console.error('Error loading feature flags:', error);
    showFlagsError('Error al cargar configuración de feature flags');
  }
}

// Render feature flags switches
function renderFeatureFlags(flags) {
  const userEmail = typeof USER_EMAIL !== 'undefined' ? USER_EMAIL : '';

  Object.entries(flags).forEach(([flagKey, flagData]) => {
    const checkbox = document.getElementById(`flag-${flagKey}`);
    if (checkbox) {
      checkbox.checked = flagData.value;

      // Enable/disable based on permissions
      if (hasPermission(flagKey, userEmail)) {
        checkbox.disabled = false;
      } else {
        checkbox.disabled = true;
      }
    }
  });
}

// Show flags error message
function showFlagsError(message) {
  const errorMsg = document.getElementById('flagsErrorMsg');
  if (errorMsg) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    setTimeout(() => {
      errorMsg.style.display = 'none';
    }, 5000);
  }
}

// Handle flag toggle
async function handleFlagToggle(event) {
  const checkbox = event.target;
  const flagKey = checkbox.dataset.flag;
  const newValue = checkbox.checked;
  const previousValue = !newValue;

  try {
    // Disable checkbox while updating
    checkbox.disabled = true;

    const result = await updateFeatureFlag(flagKey, newValue);

    if (result.success) {
      // Keep the new state
      console.log(`Feature flag ${flagKey} actualizado a ${newValue}`);
    } else {
      // Revert to previous state
      checkbox.checked = previousValue;
      showFlagsError(`Error al actualizar ${flagKey}`);
    }
  } catch (error) {
    // Revert to previous state
    checkbox.checked = previousValue;
    showFlagsError(`Error al actualizar ${flagKey}: ${error.message}`);
  } finally {
    // Re-enable checkbox based on permissions
    const userEmail = typeof USER_EMAIL !== 'undefined' ? USER_EMAIL : '';
    checkbox.disabled = !hasPermission(flagKey, userEmail);
  }
}

// Load webhooks
async function loadWebhooks() {
  const btn = document.getElementById('refreshWebhooksBtn');

  try {
    btn.disabled = true;
    btn.textContent = '🔄 Cargando...';

    showLoading();

    const data = await fetchWebhooks();

    if (data.success && data.webhooks) {
      renderWebhooks(data.webhooks);
      btn.textContent = '🔄 Actualizar transacciones';
    } else {
      showError('Respuesta inválida del servidor');
      btn.textContent = '🔄 Actualizar transacciones';
    }
  } catch (error) {
    showError(error.message);
    btn.textContent = '🔄 Actualizar transacciones';
  } finally {
    btn.disabled = false;
  }
}

// Initialize Web Pig
function initWebPig() {
  const btn = document.getElementById('refreshWebhooksBtn');
  const closeBtn = document.getElementById('stageDetailsCloseBtn');

  if (btn) {
    btn.addEventListener('click', loadWebhooks);

    // Auto-load when tab is activated
    const webpigTab = document.querySelector('[data-tab="webpig"]');
    if (webpigTab) {
      webpigTab.addEventListener('click', () => {
        // Load feature flags on first activation
        loadFeatureFlags();

        // Only load webhooks if container is empty
        const container = document.getElementById('webpigContainer');
        if (container && container.innerHTML.trim() === '') {
          loadWebhooks();
        }
      });
    }
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', closeStageDetails);
  }

  // Close modal on backdrop click
  const modal = document.getElementById('stageDetailsModal');
  if (modal) {
    const backdrop = modal.querySelector('.modal-backdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeStageDetails);
    }
  }

  // Add event listeners to feature flag checkboxes
  const flagCheckboxes = document.querySelectorAll('[data-flag]');
  flagCheckboxes.forEach(checkbox => {
    checkbox.addEventListener('change', handleFlagToggle);
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWebPig);
} else {
  initWebPig();
}
