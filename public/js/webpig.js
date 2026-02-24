// Web Pig - Webhook Transactions Manager

// Use local proxy endpoints instead of direct API calls for security
const WEBPIG_API_URL = '/api/webpig/webhooks';
const WEBPIG_FEATURE_FLAGS_URL = '/api/webpig/feature-flags';

// Permissions mapping (nombres reales de Supabase)
const FLAG_PERMISSIONS = {
  'FRAPP_MEMBERSHIP_ENABLED': ['daniel.cardona@sentiretaller.com'],
  'WORLDOFFICE_INVOICE_ENABLED': ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com'],
  'WORLDOFFICE_ACCOUNTING_ENABLED': ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com'],
  'WORLDOFFICE_DIAN_ENABLED': ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com'],
  'STRAPI_FACTURACION_ENABLED': ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com']
};

// Retry button permissions
const RETRY_PERMISSIONS = ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com'];

// Stage mapping to columns (actualizado para Supabase)
const STAGE_COLUMNS = {
  'fr360_query': 'FR360',
  'crm_management': 'CRM',
  'membership_creation': 'FRAPP',
  'worldoffice_customer': 'WO Cliente',
  'worldoffice_invoice_creation': 'WO Factura',
  'worldoffice_invoice_accounting': 'WO Contabilidad',
  'worldoffice_dian_emission': 'DIAN',
  'callbell_notification': 'Callbell',
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

// ✅ Extract data from structured fields (Supabase - estructura real)
function extractInvoiceId(webhook) {
  return webhook.invoice_id || 'N/A';
}

function extractCustomer(webhook) {
  // Estructura real: webhook.customer.name
  return webhook.customer?.name || 'N/A';
}

function extractEmail(webhook) {
  // Estructura real: webhook.customer.email
  return webhook.customer?.email || 'N/A';
}

function extractCedula(webhook) {
  // Buscar en logs.by_status.success
  const fr360Log = webhook.logs?.by_status?.success?.find(log => log.stage === 'fr360_query');
  if (fr360Log?.response_data?.identityDocument) {
    return fr360Log.response_data.identityDocument;
  }

  // Fallback a logs.all
  const logsArray = webhook.logs?.all || [];
  const fr360LogAll = logsArray.find(log => log.stage === 'fr360_query' && log.status === 'success');
  if (fr360LogAll?.response_data?.identityDocument) {
    return fr360LogAll.response_data.identityDocument;
  }

  return 'N/A';
}

function extractProduct(webhook) {
  // Fix encoding issues: "Ãlite" → "Élite"
  let product = webhook.product || 'N/A';

  // DEBUG: Ver qué está llegando exactamente
  if (product.includes('lite')) {
    console.log('🔍 [DEBUG] Producto original:', product);
    console.log('🔍 [DEBUG] Códigos de caracteres:', [...product].map(c => c.charCodeAt(0)));
  }

  // Solución para doble encoding UTF-8
  // Si viene "Ã‰lite" necesitamos convertir los bytes de vuelta
  try {
    // Convertir string a bytes UTF-8 y luego decodificar correctamente
    const utf8Encoder = new TextEncoder();
    const utf8Decoder = new TextDecoder('utf-8');

    // Convertir a bytes asumiendo que cada carácter es un byte Latin-1
    const bytes = new Uint8Array([...product].map(c => c.charCodeAt(0) & 0xFF));
    const decoded = utf8Decoder.decode(bytes);

    // Si la decodificación produjo algo diferente y válido, usarla
    if (decoded !== product && !decoded.includes('�')) {
      console.log('🔍 [DEBUG] Producto decodificado:', decoded);
      product = decoded;
    }
  } catch (e) {
    console.log('🔍 [DEBUG] Error al decodificar:', e);
  }

  // Fallback: reemplazos manuales por si la decodificación automática no funciona
  product = product.replace(/Ã©/g, 'é')
                   .replace(/Ã¡/g, 'á')
                   .replace(/Ã­/g, 'í')
                   .replace(/Ã³/g, 'ó')
                   .replace(/Ãº/g, 'ú')
                   .replace(/Ã±/g, 'ñ')
                   .replace(/Ã‰/g, 'É')
                   .replace(/Ãš/g, 'Ú')
                   .replace(/Ã"/g, 'Ó')
                   .replace(/Ã/g, 'Í')
                   .replace(/Ã/g, 'Á');

  return product;
}

function extractPhone(webhook) {
  // Buscar en logs.by_status.success primero
  const fr360Log = webhook.logs?.by_status?.success?.find(log => log.stage === 'fr360_query');
  let phone = fr360Log?.response_data?.phone;

  // Fallback a logs.all
  if (!phone) {
    const logsArray = webhook.logs?.all || [];
    const fr360LogAll = logsArray.find(log => log.stage === 'fr360_query' && log.status === 'success');
    phone = fr360LogAll?.response_data?.phone;
  }

  // Format phone number
  if (phone) {
    phone = String(phone).trim();
    // Add 57 if it's a 10-digit Colombian number without country code
    if (!phone.startsWith('57') && phone.length === 10) {
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

// Check if product is a "Pago anticipado"
function isPagoAnticipado(product) {
  return product && product.toLowerCase().includes('pago anticipado');
}

// Regularize advance payment - muestra preview y pide confirmación
async function regularizeAdvancePayment(webhookId, buttonElement) {
  // Solo Daniel puede usar esto
  if (window.userEmail !== 'daniel.cardona@sentiretaller.com') {
    alert('⚠️ No tienes permisos para regularizar pagos anticipados.');
    return;
  }

  // Obtener datos del webhook desde la fila de la tabla
  const row = buttonElement.closest('tr');
  const webhookDataStr = row?.dataset?.webhookData;
  if (!webhookDataStr) {
    alert('❌ Error: No se encontraron datos del webhook');
    return;
  }

  const webhookData = JSON.parse(webhookDataStr);
  const webhook = webhookData.webhook;

  // Extraer datos del stage FR360 (donde están los datos reales del cliente y producto)
  const fr360Logs = webhook.logs?.by_stage?.fr360_query || webhook.logs?.by_status?.success?.filter(l => l.stage === 'fr360_query') || [];
  const fr360Response = fr360Logs.find(log => log.response_data)?.response_data || {};

  console.log('🔍 [Debug] FR360 Response:', fr360Response);

  // Extraer datos necesarios del webhook - priorizar datos de FR360 stage
  const payloadData = {
    product: fr360Response.product || webhook.product || webhook.payload?.product || '',
    agreementId: fr360Response.agreementId || fr360Response.nroAcuerdo || webhook.payload?.agreementId || webhook.agreement_id || '',
    amount: fr360Response.amount || webhook.payload?.amount || webhook.amount || 0,
    givenName: fr360Response.givenName || webhook.payload?.givenName || webhook.customer?.given_name || '',
    familyName: fr360Response.familyName || webhook.payload?.familyName || webhook.customer?.family_name || '',
    identityDocument: fr360Response.identityDocument || webhook.payload?.identityDocument || webhook.customer?.identity_document || '',
    phone: fr360Response.phone || webhook.payload?.phone || webhook.customer?.phone || '',
    fecha: webhook.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
  };

  console.log('Webhook data para regularización:', payloadData);

  try {
    // Paso 1: Obtener preview (dryRun = true)
    const previewResponse = await fetch(`/api/webpig/webhooks/${webhookId}/regularize-advance-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true, webhookPayload: payloadData })
    });

    const previewResult = await previewResponse.json();

    if (!previewResult.success) {
      // Verificar si hay acuerdos alternativos sugeridos
      if (previewResult.hasAlternatives && previewResult.acuerdosSugeridos?.length > 0) {
        let alternativesMessage = `⚠️ ${previewResult.error}\n\n`;
        alternativesMessage += `📋 Cliente: ${previewResult.cedula}\n`;
        alternativesMessage += `📄 Acuerdo actual: ${previewResult.acuerdoActual}\n\n`;
        alternativesMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
        alternativesMessage += `ACUERDOS CON CUOTAS PENDIENTES:\n`;
        alternativesMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

        previewResult.acuerdosSugeridos.forEach((acuerdo, idx) => {
          alternativesMessage += `${idx + 1}. Acuerdo: ${acuerdo.nro_acuerdo}\n`;
          alternativesMessage += `   Producto: ${acuerdo.producto}\n`;
          alternativesMessage += `   Cuotas pendientes: ${acuerdo.cuotas_pendientes}\n`;
          alternativesMessage += `   Valor pendiente: $${acuerdo.valor_total_pendiente.toLocaleString('es-CO')}\n\n`;
        });

        alternativesMessage += `¿Desea actualizar el acuerdo del webhook?\n`;
        alternativesMessage += `(Ingrese el número del acuerdo al que desea cambiar)`;

        const selectedAcuerdo = prompt(alternativesMessage);

        if (selectedAcuerdo) {
          // Buscar si el usuario ingresó un número de opción o directamente el acuerdo
          let nuevoAcuerdo = selectedAcuerdo.trim();
          const opcionNum = parseInt(nuevoAcuerdo);

          if (!isNaN(opcionNum) && opcionNum > 0 && opcionNum <= previewResult.acuerdosSugeridos.length) {
            nuevoAcuerdo = previewResult.acuerdosSugeridos[opcionNum - 1].nro_acuerdo;
          }

          // Confirmar el cambio
          const confirmar = confirm(
            `¿Confirma cambiar el acuerdo del webhook ${webhookId}?\n\n` +
            `De: ${previewResult.acuerdoActual}\n` +
            `A: ${nuevoAcuerdo}`
          );

          if (confirmar) {
            try {
              // Llamar al endpoint para actualizar el acuerdo
              const updateResponse = await fetch(`/api/webpig/webhooks/${webhookId}/update-agreement`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newAgreementId: nuevoAcuerdo })
              });

              const updateResult = await updateResponse.json();

              if (updateResult.success) {
                alert(`✅ ${updateResult.message}\n\nAhora puede intentar la regularización nuevamente.`);
                loadWebhooks(); // Recargar tabla
              } else {
                // Fallback: mostrar SQL para ejecutar manualmente
                const sql = `UPDATE webhook_logs SET response_data = jsonb_set(jsonb_set(response_data, '{agreementId}', '"${nuevoAcuerdo}"'), '{nroAcuerdo}', '"${nuevoAcuerdo}"') WHERE webhook_id = ${webhookId} AND stage = 'fr360_query' AND status = 'success';`;

                if (navigator.clipboard) {
                  navigator.clipboard.writeText(sql).then(() => {
                    alert(`⚠️ Error automático: ${updateResult.error}\n\n✅ SQL copiado al portapapeles!\nEjecútelo en Supabase manualmente.`);
                  }).catch(() => {
                    alert(`⚠️ Error: ${updateResult.error}\n\n📋 SQL para ejecutar en Supabase:\n\n${sql}`);
                  });
                } else {
                  alert(`⚠️ Error: ${updateResult.error}\n\n📋 SQL para ejecutar en Supabase:\n\n${sql}`);
                }
              }
            } catch (updateError) {
              const sql = `UPDATE webhook_logs SET response_data = jsonb_set(jsonb_set(response_data, '{agreementId}', '"${nuevoAcuerdo}"'), '{nroAcuerdo}', '"${nuevoAcuerdo}"') WHERE webhook_id = ${webhookId} AND stage = 'fr360_query' AND status = 'success';`;
              alert(`⚠️ Error de conexión.\n\n📋 SQL para ejecutar en Supabase:\n\n${sql}`);
            }
          }
        }
        return;
      }

      alert(`❌ Error: ${previewResult.error || 'Error desconocido'}`);
      return;
    }

    // Paso 2: Mostrar preview y pedir confirmación
    const resumen = previewResult.resumen;
    let confirmMessage = `💱 REGULARIZACIÓN DE PAGO ANTICIPADO\n`;
    confirmMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    confirmMessage += `📋 Webhook ID: ${resumen.webhookId}\n`;
    confirmMessage += `📦 Producto: ${resumen.producto}\n`;
    confirmMessage += `📄 Acuerdo: ${resumen.agreementId}\n`;
    confirmMessage += `💰 Monto pagado: $${resumen.montoPagado.toLocaleString('es-CO')}\n`;
    confirmMessage += `📅 Fecha pago: ${resumen.fechaPago}\n`;
    confirmMessage += `📊 Cuotas pendientes: ${resumen.cuotasPendientes}\n\n`;
    confirmMessage += `DISTRIBUCIÓN:\n`;
    confirmMessage += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    for (const cambio of resumen.cambios) {
      const valorOriginal = cambio.valor_cuota_original.toLocaleString('es-CO');
      const valorNuevo = cambio.valor_cuota_nuevo.toLocaleString('es-CO');
      const cambioIndicator = cambio.requiereCambioValor ? ` ⚠️ (era $${valorOriginal})` : '';
      confirmMessage += `  Cuota ${cambio.cuota_nro}: $${valorNuevo}${cambioIndicator}\n`;
    }

    if (resumen.restanteSinAsignar > 0) {
      confirmMessage += `\n⚠️ ALERTA: Restante sin asignar: $${resumen.restanteSinAsignar.toLocaleString('es-CO')}\n`;
    }

    confirmMessage += `\n¿Ejecutar la regularización?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    // Paso 3: Ejecutar la regularización real (dryRun = false)
    const executeResponse = await fetch(`/api/webpig/webhooks/${webhookId}/regularize-advance-payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: false, webhookPayload: payloadData })
    });

    const executeResult = await executeResponse.json();

    if (executeResult.success) {
      let successMessage = `✅ Regularización completada!\n\n${executeResult.message}`;

      if (executeResult.pazYSalvo) {
        if (executeResult.pazYSalvo.success) {
          successMessage += `\n\n📄 Paz y salvo generado y enviado por WhatsApp`;
          successMessage += `\n🔗 ${executeResult.pazYSalvo.pdfUrl}`;
        } else {
          successMessage += `\n\n⚠️ Error generando paz y salvo: ${executeResult.pazYSalvo.error || 'Error desconocido'}`;
        }
      }

      alert(successMessage);
      loadWebhooks(); // Recargar tabla
    } else {
      alert(`❌ Error al ejecutar: ${executeResult.error || 'Error desconocido'}`);
    }

  } catch (error) {
    alert(`❌ Error: ${error.message}`);
  }
}

// ✅ Get stage status usando logs.by_status (estructura real de Supabase)
function getStageStatus(webhook, columnName, isAccepted) {
  // If transaction was rejected, don't show stages
  if (!isAccepted) {
    return { status: 'not-applicable', icon: '-', logs: [] };
  }

  const relevantStages = Object.entries(STAGE_COLUMNS)
    .filter(([_, col]) => col === columnName)
    .map(([stage, _]) => stage);

  // PRIORIDAD 1: Buscar en logs.by_status.success (más directo)
  const successLogs = webhook.logs?.by_status?.success || [];
  const relevantSuccessLogs = successLogs.filter(log => relevantStages.includes(log.stage));
  const hasSuccess = relevantSuccessLogs.length > 0;

  // PRIORIDAD 2: Buscar en logs.by_status.error
  const errorLogs = webhook.logs?.by_status?.error || [];
  const relevantErrorLogs = errorLogs.filter(log => relevantStages.includes(log.stage));
  const hasError = relevantErrorLogs.length > 0;

  // Debug para webhook 990
  if (webhook.id === 990 && columnName === 'FRAPP') {
    console.log(`[DEBUG 990 FRAPP] relevantStages:`, relevantStages);
    console.log(`[DEBUG 990 FRAPP] hasSuccess:`, hasSuccess, 'count:', relevantSuccessLogs.length);
    console.log(`[DEBUG 990 FRAPP] hasError:`, hasError, 'count:', relevantErrorLogs.length);
    console.log(`[DEBUG 990 FRAPP] Success logs:`, relevantSuccessLogs);
    console.log(`[DEBUG 990 FRAPP] Error logs:`, relevantErrorLogs);
  }

  // Si hay ambos (success y error), comparar fechas y mostrar el más reciente
  if (hasSuccess && hasError) {
    // Obtener el log más reciente de cada tipo
    const latestSuccess = relevantSuccessLogs.sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    const latestError = relevantErrorLogs.sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    )[0];

    // Debug: Ver las fechas para comparación
    if (columnName === 'DIAN') {
      console.log(`[DEBUG ${webhook.id} DIAN] Latest Success:`, latestSuccess?.created_at);
      console.log(`[DEBUG ${webhook.id} DIAN] Latest Error:`, latestError?.created_at);
      console.log(`[DEBUG ${webhook.id} DIAN] Success > Error?`, new Date(latestSuccess.created_at) > new Date(latestError.created_at));
    }

    // Si el success es más reciente que el error, mostrar success
    if (new Date(latestSuccess.created_at) > new Date(latestError.created_at)) {
      return { status: 'success', icon: '✅', logs: relevantSuccessLogs };
    } else {
      return { status: 'error', icon: '⛔', logs: relevantErrorLogs };
    }
  }

  // Si solo hay success, mostrar success
  if (hasSuccess) {
    return { status: 'success', icon: '✅', logs: relevantSuccessLogs };
  }

  // Si solo hay error, mostrar error
  if (hasError) {
    return { status: 'error', icon: '⛔', logs: relevantErrorLogs };
  }

  // PRIORIDAD 3: Buscar en logs.all para processing/skipped
  const logsAll = webhook.logs?.all || [];
  const logs = logsAll.filter(log => relevantStages.includes(log.stage));

  if (logs.length === 0) {
    // CASO ESPECIAL: FRAPP - verificar si no requiere membresías
    if (columnName === 'FRAPP') {
      const fr360Log = successLogs.find(log => log.stage === 'fr360_query');

      // Si el producto no requiere membresías (campo específico en response_data)
      if (fr360Log?.response_data?.product) {
        const product = fr360Log.response_data.product.toLowerCase();

        // Productos que NO requieren membresías (pagos únicos, servicios, etc.)
        const noMembershipProducts = ['worldoffice', 'reporte', 'paquete', 'curso', 'taller'];
        const requiresNoMembership = noMembershipProducts.some(p => product.includes(p));

        // NUEVO: Detectar si es cuota > 1 (solo Cuota 1 crea membresía)
        // Patrones: "- Cuota 2", "- Cuota 3", etc. o "(Mora)"
        const isCuotaMayorQue1 = /- cuota [2-9]/i.test(product) || /- cuota 1[0-9]/i.test(product);

        if (requiresNoMembership || isCuotaMayorQue1) {
          return { status: 'not-required', icon: 'N/A', logs: [] };
        }
      }
    }

    // CASO ESPECIAL: Cartera - verificar si es pago de contado (no requiere cartera)
    if (columnName === 'Cartera') {
      const fr360Log = successLogs.find(log => log.stage === 'fr360_query');

      // Si nroAcuerdo es null, es pago de contado y no requiere actualizar cartera
      if (fr360Log?.response_data?.nroAcuerdo === null || fr360Log?.response_data?.agreementId === null) {
        return { status: 'not-required', icon: 'N/A', logs: [] };
      }
    }

    return { status: 'not-run', icon: '⛔', logs: [] };
  }

  const hasSkipped = logs.some(log => log.status === 'skipped');
  const hasProcessing = logs.some(log => log.status === 'processing');

  if (hasSkipped) {
    // Verificar si fue skipped por feature flag deshabilitado (N/A verde) o por lógica de negocio
    const skippedLog = logs.find(log => log.status === 'skipped');
    const skipReason = skippedLog?.message || skippedLog?.error || '';

    // Si fue skipped por feature flag o porque no requiere el stage, mostrar N/A verde
    if (skipReason.toLowerCase().includes('feature flag') ||
        skipReason.toLowerCase().includes('disabled') ||
        skipReason.toLowerCase().includes('no requiere') ||
        skipReason.toLowerCase().includes('not required')) {
      return { status: 'not-required', icon: 'N/A', logs };
    }

    return { status: 'skipped', icon: '⚠️', logs };
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

  // Guardar datos del webhook en el modal para usar después
  modal.dataset.columnName = columnName;
  modal.dataset.webhookId = webhookData.webhook?.id;

  let bodyContent = '';

  if (!logs || logs.length === 0) {
    bodyContent = '<div class="no-logs">No hay logs disponibles para este stage</div>';
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

    bodyContent = checkpointInfo + logs.map(log => {
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

  // Agregar botón para marcar como completado manualmente (DIAN y FRAPP con errores, skipped o not-run)
  const stageStatus = webhookData[columnName];
  const allowedColumns = ['DIAN', 'FRAPP'];
  const allowedStatuses = ['error', 'skipped', 'not-run'];

  console.log(`[WebPig Debug] Column: ${columnName}, Status:`, stageStatus);
  console.log(`[WebPig Debug] Condition check: allowed=${allowedColumns.includes(columnName)}, hasStatus=${!!stageStatus}, statusMatch=${stageStatus ? allowedStatuses.includes(stageStatus.status) : 'N/A'}, iconMatch=${stageStatus?.icon === '⛔'}`);

  if (allowedColumns.includes(columnName) && stageStatus && (allowedStatuses.includes(stageStatus.status) || stageStatus.icon === '⛔')) {
    const helpText = columnName === 'DIAN'
      ? 'Usa este botón si ya emitiste a DIAN manualmente'
      : 'Usa este botón si ya completaste este proceso manualmente';

    bodyContent += `
      <div class="manual-completion-section">
        <button onclick="markStageAsManuallyCompleted('${columnName}', ${webhookData.webhook.id})" class="btn-manual-completion">
          ✅ Marcar como completado manualmente
        </button>
        <p class="manual-completion-note">${helpText}</p>
      </div>
    `;
  }

  // Set the final body content
  body.innerHTML = bodyContent;

  modal.classList.remove('hidden');
}

// Close stage details modal
function closeStageDetails() {
  const modal = document.getElementById('stageDetailsModal');
  modal.classList.add('hidden');
}

// Mark stage as manually completed
async function markStageAsManuallyCompleted(columnName, webhookId) {
  if (!confirm(`¿Está seguro de marcar ${columnName} como completado manualmente para webhook #${webhookId}?`)) {
    return;
  }

  try {
    // Obtener el stage name correspondiente a la columna
    const stageName = Object.entries(STAGE_COLUMNS).find(([_, col]) => col === columnName)?.[0];

    if (!stageName) {
      alert('Error: No se pudo determinar el stage');
      return;
    }

    const response = await fetch(`/api/webpig/webhooks/${webhookId}/mark-manual-completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        stage: stageName,
        column: columnName
      })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Error al marcar como completado');
    }

    alert(`✅ ${columnName} marcado como completado manualmente`);

    // Cerrar modal y recargar datos
    closeStageDetails();
    await loadWebhooks();

  } catch (error) {
    console.error('Error marking stage as manually completed:', error);
    alert(`Error: ${error.message}`);
  }
}

// Render webhooks table
function renderWebhooks(webhooks) {
  const container = document.getElementById('webpigContainer');

  if (!webhooks || webhooks.length === 0) {
    container.innerHTML = '<div class="webhook-empty">No hay transacciones disponibles</div>';
    return;
  }

  // DEBUG: Ver estructura real de datos
  if (webhooks.length > 0) {
    console.log('🐷 [WebPig] Primer webhook estructura:', JSON.stringify(webhooks[0], null, 2));
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
        <th>FR360</th>
        <th>CRM</th>
        <th>FRAPP</th>
        <th>WO Cliente</th>
        <th>WO Factura</th>
        <th>WO Conta</th>
        <th>DIAN</th>
        <th>Callbell</th>
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
    const email = extractEmail(webhook);
    const cedula = extractCedula(webhook);
    const product = extractProduct(webhook);
    const phone = extractPhone(webhook);
    const isAccepted = isTransactionAccepted(webhook);

    // Estado icon
    const estadoIcon = isAccepted ? '✅' : '🚫';

    // Calcular status de todos los stages (nuevas columnas)
    const fr360Status = getStageStatus(webhook, 'FR360', isAccepted);
    const crmStatus = getStageStatus(webhook, 'CRM', isAccepted);
    const frappStatus = getStageStatus(webhook, 'FRAPP', isAccepted);
    const woClienteStatus = getStageStatus(webhook, 'WO Cliente', isAccepted);
    let woFacturaStatus, woContabilidadStatus, dianStatus;
    // Detectar Gateway Stripe en cualquier log de worldoffice_customer
    const allWoLogs = [...(webhook.logs?.all || []), ...(webhook.logs?.by_status?.success || []), ...(webhook.logs?.by_status?.error || [])];
    const isGatewayStripe = allWoLogs.some(log =>
      log.stage === 'worldoffice_customer' &&
      ((log.details || '') + (log.message || '') + (log.error_message || '')).toLowerCase().includes('gateway stripe')
    );
    // Si WO Cliente no aplica (Gateway Stripe) o es not-required, los stages dependientes tampoco
    if (isGatewayStripe || woClienteStatus.status === 'not-required') {
      const naStatus = { status: 'not-required', icon: 'N/A', logs: [] };
      woFacturaStatus = naStatus;
      woContabilidadStatus = naStatus;
      dianStatus = naStatus;
    } else {
      woFacturaStatus = getStageStatus(webhook, 'WO Factura', isAccepted);
      woContabilidadStatus = getStageStatus(webhook, 'WO Contabilidad', isAccepted);
      dianStatus = getStageStatus(webhook, 'DIAN', isAccepted);
    }
    const callbellStatus = getStageStatus(webhook, 'Callbell', isAccepted);
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
        <div class="customer-email" title="${email}">${email}</div>
        <div class="customer-phone" title="${phone}">${phone}</div>
      </td>
      <td class="product-col" title="${product}">${product}</td>
      <td class="estado-col">${estadoIcon}</td>
      <td class="stage-col ${getFailedClass('FR360')}" data-column="FR360">
        <span class="stage-icon ${fr360Status.status}" data-column="FR360" data-webhook-id="${webhook.id}">
          ${fr360Status.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('CRM')}" data-column="CRM">
        <span class="stage-icon ${crmStatus.status}" data-column="CRM" data-webhook-id="${webhook.id}">
          ${crmStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('FRAPP')}" data-column="FRAPP">
        <span class="stage-icon ${frappStatus.status}" data-column="FRAPP" data-webhook-id="${webhook.id}">
          ${frappStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('WO Cliente')}" data-column="WO Cliente">
        <span class="stage-icon ${woClienteStatus.status}" data-column="WO Cliente" data-webhook-id="${webhook.id}">
          ${woClienteStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('WO Factura')}" data-column="WO Factura">
        <span class="stage-icon ${woFacturaStatus.status}" data-column="WO Factura" data-webhook-id="${webhook.id}">
          ${woFacturaStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('WO Contabilidad')}" data-column="WO Contabilidad">
        <span class="stage-icon ${woContabilidadStatus.status}" data-column="WO Contabilidad" data-webhook-id="${webhook.id}">
          ${woContabilidadStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('DIAN')}" data-column="DIAN">
        <span class="stage-icon ${dianStatus.status}" data-column="DIAN" data-webhook-id="${webhook.id}">
          ${dianStatus.icon}
        </span>
      </td>
      <td class="stage-col ${getFailedClass('Callbell')}" data-column="Callbell">
        <span class="stage-icon ${callbellStatus.status}" data-column="Callbell" data-webhook-id="${webhook.id}">
          ${callbellStatus.icon}
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
        ${isPagoAnticipado(product) && frappStatus.icon !== '✅' && window.userEmail === 'daniel.cardona@sentiretaller.com'
          ? `<button onclick="regularizeAdvancePayment(${webhook.id}, this)" class="btn-regularize" title="Regularizar pago anticipado">💱</button>`
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
      FR360: fr360Status,
      CRM: crmStatus,
      FRAPP: frappStatus,
      'WO Cliente': woClienteStatus,
      'WO Factura': woFacturaStatus,
      'WO Contabilidad': woContabilidadStatus,
      DIAN: dianStatus,
      Callbell: callbellStatus,
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

// ===== VENTAS EN CUENTA CORRIENTE =====
let ventasCCActive = false;
let ventasCCData = []; // Store ventas for processing

async function loadVentasCC() {
  const container = document.getElementById('webpigContainer');
  const controls = document.querySelector('.webpig-controls');
  const title = document.getElementById('webpigTitle');
  const refreshBtn = document.getElementById('refreshWebhooksBtn');
  const ventasBtn = document.getElementById('ventasCCBtn');
  const volverBtn = document.getElementById('volverWebPigBtn');

  try {
    ventasBtn.disabled = true;
    ventasBtn.textContent = '⏳ Cargando...';

    // Hide controls and refresh button, show volver
    if (controls) controls.style.display = 'none';
    refreshBtn.style.display = 'none';
    volverBtn.style.display = '';
    title.innerHTML = '<span style="color:#e65100;">💴 Ventas en Cuenta Corriente</span>';

    const response = await fetch('/api/webpig/ventas-cc');
    const data = await response.json();

    if (data.success) {
      ventasCCData = data.ventas;
      renderVentasCCTable(container, data.ventas);
      attachVentasCCHandlers(container);
      ventasCCActive = true;
    } else {
      container.innerHTML = `<p style="color:red;">Error: ${data.error}</p>`;
    }
  } catch (error) {
    container.innerHTML = `<p style="color:red;">Error: ${error.message}</p>`;
  } finally {
    ventasBtn.disabled = false;
    ventasBtn.textContent = '💴 Ventas en cuenta corriente';
  }
}

function volverAWebPig() {
  const controls = document.querySelector('.webpig-controls');
  const title = document.getElementById('webpigTitle');
  const refreshBtn = document.getElementById('refreshWebhooksBtn');
  const volverBtn = document.getElementById('volverWebPigBtn');
  const container = document.getElementById('webpigContainer');

  // Restore UI
  if (controls) controls.style.display = '';
  refreshBtn.style.display = '';
  volverBtn.style.display = 'none';
  title.innerHTML = 'Web Pig 🐷 - Transacciones Recientes <span id="webpigEffectiveness" style="font-size: 0.85em; color: #999; font-weight: normal;"></span>';
  container.innerHTML = '';
  ventasCCActive = false;

  // Reload webhooks
  loadWebhooks();
}

function renderVentasCCTable(container, ventas) {
  if (!ventas || ventas.length === 0) {
    container.innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No hay ventas en cuenta corriente registradas.</p>';
    return;
  }

  const formatDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const formatMoney = (v) => v != null ? Number(v).toLocaleString('es-CO') : '';

  let html = `<table class="ventas-cc-table" style="width:100%;border-collapse:collapse;font-size:12px;">
    <thead>
      <tr style="background:#e65100;color:#fff;">
        <th style="padding:6px 8px;">Fecha</th>
        <th style="padding:6px 8px;">Documento</th>
        <th style="padding:6px 8px;">Nombre</th>
        <th style="padding:6px 8px;">Correo</th>
        <th style="padding:6px 8px;">Celular</th>
        <th style="padding:6px 8px;">Nro Acuerdo</th>
        <th style="padding:6px 8px;">Producto</th>
        <th style="padding:6px 8px;">Valor</th>
        <th style="padding:6px 8px;">Comercial</th>
        <th style="padding:6px 8px;">Comprobante</th>
        <th style="padding:6px 8px;">Estado</th>
        <th style="padding:6px 8px;">Acciones</th>
      </tr>
    </thead>
    <tbody>`;

  ventas.forEach(v => {
    const nombre = `${v.nombres || ''} ${v.apellidos || ''}`.trim();
    const producto = v.producto?.nombre || '';
    const comercial = v.comercial?.nombre || '';
    const estadoIcon = v.estado === 'procesado' ? '☑️' : '';
    const accionBtn = v.estado === 'procesado'
      ? '<span title="Procesado">☑️</span>'
      : `<button class="btn-procesar-vcc" data-document-id="${v.documentId}" title="Procesar venta" style="cursor:pointer;background:none;border:none;font-size:1.3em;">📜</button>`;
    const comprobanteLink = v.comprobante_url
      ? `<a href="${v.comprobante_url}" target="_blank" style="color:#e65100;">Ver</a>`
      : '';

    html += `<tr style="border-bottom:1px solid #eee;">
      <td style="padding:5px 8px;white-space:nowrap;">${formatDate(v.createdAt)}</td>
      <td style="padding:5px 8px;">${v.numero_documento || ''}</td>
      <td style="padding:5px 8px;">${nombre}</td>
      <td style="padding:5px 8px;">${v.correo || ''}</td>
      <td style="padding:5px 8px;">${v.celular || ''}</td>
      <td style="padding:5px 8px;">${v.nro_acuerdo || ''}</td>
      <td style="padding:5px 8px;">${producto}</td>
      <td style="padding:5px 8px;text-align:right;">$${formatMoney(v.valor)}</td>
      <td style="padding:5px 8px;">${comercial}</td>
      <td style="padding:5px 8px;text-align:center;">${comprobanteLink}</td>
      <td style="padding:5px 8px;text-align:center;">${estadoIcon || v.estado}</td>
      <td style="padding:5px 8px;text-align:center;">${accionBtn}</td>
    </tr>`;
  });

  html += '</tbody></table>';
  container.innerHTML = html;
}

function attachVentasCCHandlers(container) {
  container.querySelectorAll('.btn-procesar-vcc').forEach(btn => {
    btn.addEventListener('click', () => procesarVentaCC(btn));
  });
}

async function procesarVentaCC(btn) {
  const documentId = btn.dataset.documentId;
  const venta = ventasCCData.find(v => v.documentId === documentId);
  if (!venta) return alert('No se encontró la venta');

  if (!confirm(`¿Procesar venta de ${venta.nombres} ${venta.apellidos}?\n\nSe creará/actualizará en CRM y World Office.`)) return;

  btn.disabled = true;
  btn.textContent = '⏳';

  try {
    const response = await fetch(`/api/webpig/ventas-cc/${documentId}/procesar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        numero_documento: venta.numero_documento,
        nombres: venta.nombres,
        apellidos: venta.apellidos,
        correo: venta.correo,
        celular: venta.celular,
        ciudad: venta.ciudad || '',
        direccion: venta.direccion || '',
        comercial_nombre: venta.comercial?.nombre || '',
        comercialId: venta.comercial?.id || null,
        producto_nombre: venta.producto?.nombre || '',
        productoId: venta.producto?.id || null,
        valor: venta.valor || 0,
        nro_acuerdo: venta.nro_acuerdo || ''
      })
    });

    const data = await response.json();

    if (data.success) {
      // Update UI
      const tr = btn.closest('tr');
      const estadoCell = tr.querySelector('td:nth-last-child(2)');
      if (estadoCell) estadoCell.textContent = '☑️';
      btn.replaceWith(Object.assign(document.createElement('span'), { textContent: '☑️', title: 'Procesado' }));

      // Update local data
      venta.estado = 'procesado';

      // Show results
      let msg = '✅ Venta procesada exitosamente';
      if (data.resultados.crm?.error) msg += `\n⚠️ CRM: ${data.resultados.crm.error}`;
      if (data.resultados.worldOffice?.error) msg += `\n⚠️ WO Cliente: ${data.resultados.worldOffice.error}`;
      if (data.resultados.invoice?.error) msg += `\n⚠️ WO Factura: ${data.resultados.invoice.error}`;
      if (data.resultados.invoice?.numeroFactura) msg += `\n📄 Factura WO: ${data.resultados.invoice.numeroFactura}`;
      if (data.resultados.accounting?.error) msg += `\n⚠️ Contabilización: ${data.resultados.accounting.error}`;
      if (data.resultados.facturacion?.error) msg += `\n⚠️ Facturación Strapi: ${data.resultados.facturacion.error}`;
      if (data.resultados.facturacion?.success) msg += `\n📊 Facturación registrada`;
      alert(msg);
    } else {
      alert(`❌ Error: ${data.error}`);
      btn.disabled = false;
      btn.textContent = '📜';
    }
  } catch (error) {
    alert(`❌ Error: ${error.message}`);
    btn.disabled = false;
    btn.textContent = '📜';
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

  // Ventas en cuenta corriente button (solo usuarios autorizados)
  const ventasCCBtn = document.getElementById('ventasCCBtn');
  const ventasCCAllowed = ['daniel.cardona@sentiretaller.com', 'yicela.agudelo@sentiretaller.com', 'ana.quintero@sentiretaller.com'];
  if (ventasCCBtn) {
    if (ventasCCAllowed.includes(window.userEmail)) {
      ventasCCBtn.addEventListener('click', loadVentasCC);
    } else {
      ventasCCBtn.style.display = 'none';
    }
  }

  // Volver a Web Pig button
  const volverBtn = document.getElementById('volverWebPigBtn');
  if (volverBtn) {
    volverBtn.addEventListener('click', volverAWebPig);
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
