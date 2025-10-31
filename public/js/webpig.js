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

// Retry button permissions
const RETRY_PERMISSIONS = ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com'];

// Stage mapping to columns
const STAGE_COLUMNS = {
  'invoice_extraction': 'Datos',
  'fr360_query': 'FR360',
  'callbell_notification': 'WhatsApp',
  'membership_creation': 'FRAPP',
  'crm_management': 'CRM',
  'crm_upsert': 'CRM',
  'worldoffice_customer': 'WO',
  'worldoffice_invoice_creation': 'Factura',
  'worldoffice_invoice_accounting': 'Factura',
  'worldoffice_dian_emission': 'DIAN',
  'strapi_cartera_update': 'Cartera',
  'strapi_facturacion_creation': 'Ventas'
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

// Get retry status for webhook
function getRetryStatus(webhook) {
  if (!webhook.retry_count || webhook.retry_count === 0) {
    return { icon: '-', tooltip: 'Sin reintentos', cssClass: '' };
  }

  if (webhook.status === 'completed') {
    return {
      icon: `🔄${webhook.retry_count}✅`,
      tooltip: `Completado después de ${webhook.retry_count} reintento(s)`,
      cssClass: 'retry-success'
    };
  }

  if (webhook.status === 'retrying') {
    return {
      icon: `⏳${webhook.retry_count}`,
      tooltip: `Reintentando... (intento ${webhook.retry_count})`,
      cssClass: 'retry-warning'
    };
  }

  if (webhook.status === 'requires_manual_intervention') {
    return {
      icon: `🚨${webhook.retry_count}`,
      tooltip: `Requiere intervención manual después de ${webhook.retry_count} intentos`,
      cssClass: 'retry-error'
    };
  }

  return {
    icon: `⚠️${webhook.retry_count}`,
    tooltip: `${webhook.retry_count} reintento(s)`,
    cssClass: 'retry-warning'
  };
}

// Retry webhook manually
async function retryWebhook(webhookId) {
  // Check permissions
  if (!RETRY_PERMISSIONS.includes(window.userEmail)) {
    alert('⚠️ No tienes permisos para reintentar webhooks.');
    return;
  }

  if (!confirm(`¿Reintentar procesamiento del webhook ${webhookId}?\n\nSe continuará desde el último checkpoint guardado.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/webpig/webhooks/${webhookId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        force_restart: false,
        max_retries: 3
      })
    });

    const result = await response.json();

    if (result.success) {
      alert(`✅ Webhook ${webhookId} en cola para reprocesamiento.\n\nStages completados: ${result.retry_config?.completed_stages?.join(', ') || 'ninguno'}`);
      loadWebhooks(); // Recargar tabla
    } else {
      alert(`❌ Error: ${result.error || 'Error desconocido'}`);
    }
  } catch (error) {
    alert(`❌ Error al reintentar: ${error.message}`);
  }
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

  // CASO 2: Producto no requiere membresías - mostrar N/A verde (ANTES de verificar logs.length)
  if (columnName === 'FRAPP') {
    // Buscar si existe un log de membership_check que dice que no requiere membresías
    const membershipCheckLog = webhook.logs?.all?.find(log => log.stage === 'membership_check');

    if (membershipCheckLog) {
      const details = (membershipCheckLog.details || '').toLowerCase();
      const hasNoRequiere = details.includes('no requiere membresías') || details.includes('no requiere membresias');

      if (hasNoRequiere) {
        return { status: 'not-required', icon: 'N/A', logs: [] };
      }
    }

    // Si llegamos aquí, buscamos en los logs filtrados de FRAPP
    // Si hay membership_creation con success, mostrará ✅ (flujo normal)
    // Si no hay logs, mostrará ⛔ (flujo normal)
  }

  // CASO 3: Cartera - verificar nroAcuerdo null (ANTES de verificar logs.length)
  if (columnName === 'Cartera') {
    // Verificar si existe stage strapi_cartera_update con success
    const hasCarteraSuccess = webhook.logs?.all?.some(log =>
      log.stage === 'strapi_cartera_update' && log.status === 'success'
    );

    if (hasCarteraSuccess) {
      // Continuar con flujo normal para mostrar ✅
    } else {
      // NO existe strapi_cartera_update, verificar nroAcuerdo null
      // Buscar nroAcuerdo en los logs de by_status.success (que tienen response_data completo)
      const fr360QueryLog = webhook.logs?.by_status?.success?.find(log =>
        log.stage === 'fr360_query'
      );

      const hasNullAcuerdo = fr360QueryLog?.response_data?.nroAcuerdo === null ||
                             fr360QueryLog?.response_data?.agreementId === null;

      if (hasNullAcuerdo) {
        return { status: 'not-required', icon: 'N/A', logs: [] };
      }

      // Si no tiene cartera success Y no tiene nroAcuerdo null → ⛔
    }
  }

  // CASO 4: DIAN - verificar si está desactivado por configuración (ANTES de verificar logs.length)
  if (columnName === 'DIAN') {
    // Buscar si hay un log de worldoffice_dian_emission
    const dianLog = webhook.logs?.all?.find(log => log.stage === 'worldoffice_dian_emission');

    if (dianLog) {
      // Si el log tiene "Emisión DIAN desactivada por configuración" → ⚠️
      if (dianLog.details?.includes('Emisión DIAN desactivada por configuración') ||
          dianLog.details?.includes('WORLDOFFICE_DIAN_ENABLED=false')) {
        return { status: 'skipped', icon: '⚠️', logs: [dianLog] };
      }

      // Si el log tiene status success → ✅ (flujo normal)
      if (dianLog.status === 'success') {
        // Continuar con flujo normal para mostrar ✅
      }
    }

    // Si no hay log de DIAN o no es ninguno de los casos anteriores → ⛔ (flujo normal)
  }

  // Check if stage has checkpoint saved (manual patch or completed)
  // IMPORTANTE: Verificar ANTES de logs.length === 0
  const hasCheckpoint = webhook.completed_stages &&
    relevantStages.some(stage => webhook.completed_stages.includes(stage));

  // Si hay checkpoint pero no hay logs naturales, es un parche manual
  if (hasCheckpoint && logs.length === 0) {
    return { status: 'success', icon: '✅💾', logs: [] };
  }

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
  } else if (hasCheckpoint) {
    // PRIORIDAD: Si hay checkpoint (parche manual), mostrar éxito aunque haya errores previos
    return { status: 'success', icon: '✅💾', logs };
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

// Format date (full format for modal)
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

// Format date compact (for table)
function formatDateCompact(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
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
    // Get checkpoint info for this column
    const webhook = webhookData.webhook;
    const relevantStages = Object.entries(STAGE_COLUMNS)
      .filter(([_, col]) => col === columnName)
      .map(([stage, _]) => stage);

    let checkpointInfo = '';
    if (webhook && webhook.processing_context && webhook.processing_context.checkpoints) {
      const relevantCheckpoints = relevantStages.filter(stage =>
        webhook.processing_context.checkpoints[stage]
      );

      if (relevantCheckpoints.length > 0) {
        checkpointInfo = '<div class="checkpoint-info">';
        checkpointInfo += '<h4>💾 Checkpoints Guardados</h4>';
        relevantCheckpoints.forEach(stage => {
          const checkpoint = webhook.processing_context.checkpoints[stage];
          checkpointInfo += `
            <div class="checkpoint-item">
              <div class="checkpoint-stage-name">${stage}</div>
              ${checkpoint.completed_at ? `<div class="checkpoint-time">Completado: ${formatDate(checkpoint.completed_at)}</div>` : ''}
              ${checkpoint.data ? `
                <details>
                  <summary>Ver datos guardados</summary>
                  <pre>${JSON.stringify(checkpoint.data, null, 2)}</pre>
                </details>
              ` : ''}
            </div>
          `;
        });
        checkpointInfo += '</div>';
      }
    }

    body.innerHTML = checkpointInfo + logs.map(log => {
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

  // Filter only accepted webhooks
  const acceptedWebhooks = webhooks.filter(webhook => isTransactionAccepted(webhook));

  if (acceptedWebhooks.length === 0) {
    container.innerHTML = '<div class="webhook-empty">No hay transacciones aceptadas disponibles</div>';
    // Clear effectiveness display
    const effectivenessSpan = document.getElementById('webpigEffectiveness');
    if (effectivenessSpan) effectivenessSpan.textContent = '';
    return;
  }

  // Calculate and display effectiveness percentage
  const perfectTransactions = acceptedWebhooks.filter(webhook =>
    webhook.status === 'completed' &&
    (webhook.retry_count === 0 || !webhook.retry_count) &&
    !webhook.failed_stage
  ).length;

  const effectivenessPercent = ((perfectTransactions / acceptedWebhooks.length) * 100).toFixed(1);
  const effectivenessSpan = document.getElementById('webpigEffectiveness');

  if (effectivenessSpan) {
    // Color based on effectiveness: green >95%, yellow 90-95%, red <90%
    let color = '#dc3545'; // red (default for <90%)
    if (effectivenessPercent >= 95) color = '#28a745'; // green
    else if (effectivenessPercent >= 90) color = '#ffc107'; // yellow

    effectivenessSpan.textContent = `(${effectivenessPercent}% ✓)`;
    effectivenessSpan.style.color = color;
    effectivenessSpan.title = `${perfectTransactions} de ${acceptedWebhooks.length} transacciones sin errores ni reintentos`;
  }

  // Create single table
  const table = document.createElement('table');
  table.id = 'webhooksTable';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Fecha</th>
        <th>ID</th>
        <th>Cliente</th>
        <th>Producto</th>
        <th>Estado</th>
        <th>Datos</th>
        <th>FR360</th>
        <th>WhatsApp</th>
        <th>FRAPP</th>
        <th>CRM</th>
        <th>WO</th>
        <th>Factura</th>
        <th>DIAN</th>
        <th>Cartera</th>
        <th>Ventas</th>
        <th>Retry</th>
        <th>Acciones</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;

  const tbody = table.querySelector('tbody');

  // Table rows
  acceptedWebhooks.forEach(webhook => {
    const row = document.createElement('tr');

    const invoiceId = extractInvoiceId(webhook);
    const customer = extractCustomer(webhook);
    const cedula = extractCedula(webhook);
    const product = extractProduct(webhook);
    const phone = extractPhone(webhook);
    const isAccepted = isTransactionAccepted(webhook);

    // Estado icon
    const estadoIcon = isAccepted ? '✅' : '🚫';

    // Calcular status de todos los stages
    const datosStatus = getStageStatus(webhook, 'Datos', isAccepted);
    const fr360Status = getStageStatus(webhook, 'FR360', isAccepted);
    const whatsappStatus = getStageStatus(webhook, 'WhatsApp', isAccepted);
    const frappStatus = getStageStatus(webhook, 'FRAPP', isAccepted);
    const crmStatus = getStageStatus(webhook, 'CRM', isAccepted);
    const woStatus = getStageStatus(webhook, 'WO', isAccepted);
    const facturaStatus = getStageStatus(webhook, 'Factura', isAccepted);
    const dianStatus = getStageStatus(webhook, 'DIAN', isAccepted);
    const carteraStatus = getStageStatus(webhook, 'Cartera', isAccepted);
    const ventasStatus = getStageStatus(webhook, 'Ventas', isAccepted);

    // Calcular retry status
    const retryStatus = getRetryStatus(webhook);

    // Helper function to check if stage is the failed one
    const getFailedClass = (columnName) => {
      if (!webhook.failed_stage) return '';
      const relevantStages = Object.entries(STAGE_COLUMNS)
        .filter(([_, col]) => col === columnName)
        .map(([stage, _]) => stage);
      return relevantStages.includes(webhook.failed_stage) ? 'failed-stage' : '';
    };

    row.innerHTML = `
      <td class="date-col">${formatDateCompact(webhook.created_at)}</td>
      <td class="id-col">${webhook.id}</td>
      <td class="customer-col">
        <div class="customer-name" title="${customer}">${customer}</div>
        <div class="customer-cedula">CC ${cedula}</div>
        <div class="customer-email" title="${webhook.customer?.email || 'N/A'}">${webhook.customer?.email || 'N/A'}</div>
        <div class="customer-phone" title="${phone}">${phone}</div>
      </td>
      <td class="product-col" title="${product}">${product}</td>
      <td class="estado-col">${estadoIcon}</td>
      <td class="stage-col ${getFailedClass('Datos')}" data-column="Datos">
        <span class="stage-icon ${datosStatus.status}" data-column="Datos" data-webhook-id="${webhook.id}">
          ${datosStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('FR360')}" data-column="FR360">
        <span class="stage-icon ${fr360Status.status}" data-column="FR360" data-webhook-id="${webhook.id}">
          ${fr360Status.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('WhatsApp')}" data-column="WhatsApp">
        <span class="stage-icon ${whatsappStatus.status}" data-column="WhatsApp" data-webhook-id="${webhook.id}">
          ${whatsappStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('FRAPP')}" data-column="FRAPP">
        <span class="stage-icon ${frappStatus.status}" data-column="FRAPP" data-webhook-id="${webhook.id}">
          ${frappStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('CRM')}" data-column="CRM">
        <span class="stage-icon ${crmStatus.status}" data-column="CRM" data-webhook-id="${webhook.id}">
          ${crmStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('WO')}" data-column="WO">
        <span class="stage-icon ${woStatus.status}" data-column="WO" data-webhook-id="${webhook.id}">
          ${woStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('Factura')}" data-column="Factura">
        <span class="stage-icon ${facturaStatus.status}" data-column="Factura" data-webhook-id="${webhook.id}">
          ${facturaStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('DIAN')}" data-column="DIAN">
        <span class="stage-icon ${dianStatus.status}" data-column="DIAN" data-webhook-id="${webhook.id}">
          ${dianStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('Cartera')}" data-column="Cartera">
        <span class="stage-icon ${carteraStatus.status}" data-column="Cartera" data-webhook-id="${webhook.id}">
          ${carteraStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('Ventas')}" data-column="Ventas">
        <span class="stage-icon ${ventasStatus.status}" data-column="Ventas" data-webhook-id="${webhook.id}">
          ${ventasStatus.icon}
        </span>
      </td>
      <td class="retry-col">
        <span class="retry-status-badge ${retryStatus.cssClass}" title="${retryStatus.tooltip}">
          ${retryStatus.icon}
        </span>
      </td>
      <td class="actions-col">
        ${(webhook.status === 'error' || webhook.status === 'requires_manual_intervention') && RETRY_PERMISSIONS.includes(window.userEmail)
          ? `<button onclick="retryWebhook(${webhook.id})" class="btn-retry">🔄 Reintentar</button>`
          : ''
        }
      </td>
    `;

    // Store webhook status and failed_stage for later use
    row.dataset.status = webhook.status || 'completed';
    row.dataset.failedStage = webhook.failed_stage || '';

    tbody.appendChild(row);

    // Store webhook data for later retrieval
    row.dataset.webhookData = JSON.stringify({
      Datos: datosStatus,
      FR360: fr360Status,
      WhatsApp: whatsappStatus,
      FRAPP: frappStatus,
      CRM: crmStatus,
      WO: woStatus,
      Factura: facturaStatus,
      DIAN: dianStatus,
      Cartera: carteraStatus,
      Ventas: ventasStatus,
      webhook: webhook  // Store full webhook for modal
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
