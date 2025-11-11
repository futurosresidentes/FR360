// ===== EPAYCO MODULE =====
// Módulo para validar transacciones de ePayco contra Web Pig

// Estado global
let epaycoTransactions = [];
let webpigTransactions = [];

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const refreshBtn = document.getElementById('refreshEpaycoBtn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', loadEpaycoTransactions);
  }

  // Auto-load cuando se abre el tab
  const epaycoTab = document.querySelector('[data-tab="epayco"]');
  if (epaycoTab) {
    epaycoTab.addEventListener('click', () => {
      if (epaycoTransactions.length === 0) {
        loadEpaycoTransactions();
      }
    });
  }
});

// ===== FETCH DATA =====

async function loadEpaycoTransactions() {
  try {
    document.getElementById('refreshEpaycoBtn').disabled = true;
    document.getElementById('refreshEpaycoBtn').textContent = '⏳ Cargando...';

    // Cargar transacciones de ePayco
    // Agregar timestamp para evitar caché
    const epaycoResponse = await fetch(`/api/epayco/transactions?_=${Date.now()}`);
    const epaycoData = await epaycoResponse.json();

    console.log('📦 [ePayco] Response structure:', Object.keys(epaycoData));
    console.log('📦 [ePayco] Full response:', JSON.stringify(epaycoData).substring(0, 500));

    if (!epaycoData.success) {
      throw new Error(epaycoData.error || 'Error al cargar transacciones de ePayco');
    }

    // La respuesta puede tener diferentes estructuras, probar varias opciones
    epaycoTransactions = epaycoData.data?.data || epaycoData.data || epaycoData.transactions || [];

    console.log('📦 [ePayco] Transactions loaded:', epaycoTransactions.length);

    // Cargar transacciones de Web Pig para comparar
    const webpigResponse = await fetch('/api/webpig/webhooks');
    const webpigData = await webpigResponse.json();

    console.log('📦 [Web Pig] Response:', webpigData);

    if (webpigData.success && webpigData.webhooks) {
      webpigTransactions = webpigData.webhooks;
    }

    // Renderizar tabla
    renderEpaycoTable();

    // Debug: Contar cuántas transacciones están procesadas
    const aceptadas = epaycoTransactions.filter(tx => tx.status === 'Aceptada');
    const procesadas = aceptadas.filter(tx => checkIfProcessed(tx));
    console.log(`✅ [ePayco] De ${aceptadas.length} aceptadas, ${procesadas.length} fueron procesadas en Web Pig`);

    document.getElementById('refreshEpaycoBtn').disabled = false;
    document.getElementById('refreshEpaycoBtn').textContent = '🔄 Actualizar transacciones';

  } catch (error) {
    console.error('❌ [ePayco] Error:', error);
    alert(`Error al cargar transacciones: ${error.message}`);
    document.getElementById('refreshEpaycoBtn').disabled = false;
    document.getElementById('refreshEpaycoBtn').textContent = '🔄 Actualizar transacciones';
  }
}

// ===== RENDER TABLE =====

function renderEpaycoTable() {
  const container = document.getElementById('epaycoContainer');
  if (!container) return;

  if (epaycoTransactions.length === 0) {
    container.innerHTML = '<p style="text-align: center; padding: 40px; color: #666;">No hay transacciones para mostrar</p>';
    return;
  }

  // Filtrar solo transacciones aceptadas y limitar a las últimas 100
  const transactions = epaycoTransactions
    .filter(tx => tx.status === 'Aceptada')
    .slice(0, 100);

  let html = `
    <div style="padding: 20px;">
      <p style="margin-bottom: 15px; color: #666;">
        Mostrando ${transactions.length} transacciones <strong>Aceptadas</strong> de ePayco
      </p>
      <table class="webpig-table" style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
            <th style="padding: 12px; text-align: left;">Fecha</th>
            <th style="padding: 12px; text-align: left;">Referencia ePayco</th>
            <th style="padding: 12px; text-align: left;">Cliente</th>
            <th style="padding: 12px; text-align: left;">Estado ePayco</th>
            <th style="padding: 12px; text-align: left;">Valor</th>
            <th style="padding: 12px; text-align: center;">Procesado</th>
            <th style="padding: 12px; text-align: left;">Descripción</th>
          </tr>
        </thead>
        <tbody>
  `;

  transactions.forEach(tx => {
    const isProcessed = checkIfProcessed(tx);
    const statusIcon = isProcessed ? '✅' : '🚫';
    const statusColor = isProcessed ? '#28a745' : '#dc3545';
    const statusText = isProcessed ? 'Sí' : 'No';

    // Usar transactionDateTime o transactionDate
    const fecha = formatDate(tx.transactionDateTime || tx.transactionDate || tx.transactionInitialDate || tx.transactionEndDate);
    const referencia = tx.referencePayco || 'N/A';
    const cliente = tx.referenceClient || 'N/A';
    const estado = tx.status || 'N/A';
    const valor = formatCurrency(tx.amount);
    const descripcion = tx.description || 'N/A';

    html += `
      <tr style="border-bottom: 1px solid #dee2e6;">
        <td style="padding: 12px;">${fecha}</td>
        <td style="padding: 12px; font-family: monospace; font-size: 0.9em;">${referencia}</td>
        <td style="padding: 12px;">${cliente}</td>
        <td style="padding: 12px;">
          <span style="
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.85em;
            background: ${getStatusColor(estado)};
            color: white;
          ">${estado}</span>
        </td>
        <td style="padding: 12px; font-weight: 600;">${valor}</td>
        <td style="padding: 12px; text-align: center;">
          <span style="font-size: 1.5em; color: ${statusColor};" title="${statusText}">${statusIcon}</span>
        </td>
        <td style="padding: 12px; font-size: 0.9em; color: #666;">${descripcion}</td>
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

// ===== HELPER FUNCTIONS =====

function checkIfProcessed(epaycoTx) {
  const referencia = String(epaycoTx.referencePayco); // Convertir a string
  if (!referencia) return false;

  // Debug: Ver el primer webhook para conocer la estructura
  if (webpigTransactions.length > 0 && !window.debugWebPigLogged) {
    console.log('🔍 [Debug] Primer webhook keys:', Object.keys(webpigTransactions[0]));
    console.log('🔍 [Debug] Primer webhook ref_payco:', webpigTransactions[0].ref_payco);
    console.log('🔍 [Debug] Buscando referencia:', referencia);
    window.debugWebPigLogged = true;
  }

  // Buscar en Web Pig si existe un webhook con este referencePayco
  const found = webpigTransactions.some(webhook => {
    const webpigRef = String(webhook.ref_payco || webhook.reference_payco || webhook.referencePayco || '');
    return webpigRef === referencia;
  });

  return found;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'N/A';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');

  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

function formatCurrency(amount) {
  if (!amount && amount !== 0) return 'N/A';
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function getStatusColor(status) {
  const statusColors = {
    'Aceptada': '#28a745',
    'Rechazada': '#dc3545',
    'Pendiente': '#ffc107',
    'Fallida': '#dc3545'
  };
  return statusColors[status] || '#6c757d';
}
