/**
 * Módulo: Actualización Masiva de Carteras
 * Procesa TODAS las cuotas pendientes y vencidas:
 * 1. Cuotas con estado_pago = null
 * 2. Cuotas con estado_pago = 'al_dia' pero con fecha_limite < hoy
 */

(function() {
  'use strict';

  // Referencias DOM
  const startBtn = document.getElementById('startCarterasMasivoBtn');
  const stopBtn = document.getElementById('stopCarterasMasivoBtn');
  const incluirMoraCheckbox = document.getElementById('incluirMoraCheckbox');
  const progressContainer = document.getElementById('carterasProgress');
  const progressText = document.getElementById('carterasProgressText');
  const resultsContainer = document.getElementById('carterasResultsContainer');

  // Estado del procesamiento
  let isProcessing = false;
  let shouldStop = false;
  let currentBatch = 0;
  let totalProcessed = 0;
  let totalErrors = 0;

  // Verificar que el módulo solo se cargue para el usuario autorizado
  if (!startBtn) {
    console.log('📊 Módulo de Carteras Masivo no disponible para este usuario');
    return;
  }

  console.log('📊 Módulo de Actualización Masiva de Carteras cargado');

  /**
   * Formatea una fecha YYYY-MM-DD a DD/MM/YYYY
   */
  function formatDate(dateStr) {
    if (!dateStr || dateStr === '1970-01-01') return '';
    const [year, month, day] = dateStr.split('-');
    return `${Number(day)}/${Number(month)}/${year}`;
  }

  /**
   * Formatea un valor como moneda colombiana
   */
  function formatCurrency(value) {
    if (value == null || value === '') return '';
    return Number(value).toLocaleString('es-CO');
  }

  /**
   * Humaniza el estado de pago
   */
  function humanizeEstado(estado) {
    if (!estado) return '';
    const map = {
      'al_dia': 'Al día',
      'en_mora': 'En mora',
      'pagado': 'Pagado'
    };
    return map[estado] || estado;
  }

  /**
   * Crea una tarjeta de acuerdo con sus cuotas
   */
  function createAcuerdoCard(acuerdo, cuotas) {
    const card = document.createElement('div');
    card.className = 'carteras-acuerdo-card';
    card.style.cssText = `
      margin-bottom: 16px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: #fff;
      overflow: hidden;
    `;

    // Header del acuerdo
    const header = document.createElement('div');
    header.style.cssText = `
      background: linear-gradient(135deg, #075183, #0a6ba8);
      color: white;
      padding: 12px 16px;
      font-weight: 600;
    `;
    header.innerHTML = `
      Acuerdo #${acuerdo.nro_acuerdo} - ${acuerdo.numero_documento} - ${acuerdo.producto || 'Sin producto'}
      <span style="float: right; font-size: 0.9em; opacity: 0.9;">
        ${cuotas.length} cuota${cuotas.length !== 1 ? 's' : ''}
      </span>
    `;
    card.appendChild(header);

    // Tabla de cuotas
    const table = document.createElement('table');
    table.style.cssText = `
      width: 100%;
      border-collapse: collapse;
      font-size: 0.85em;
    `;

    let tableHTML = `
      <thead style="background: #f8f9fa;">
        <tr>
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Cuota</th>
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Valor</th>
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Fecha Límite</th>
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Estado</th>
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Fecha Pago</th>
          <th style="padding: 8px; text-align: left; border-bottom: 2px solid #ddd;">Valor Pagado</th>
        </tr>
      </thead>
      <tbody>
    `;

    cuotas.forEach(cuota => {
      const estadoColor =
        cuota.estado_pago === 'pagado' ? '#28a745' :
        cuota.estado_pago === 'en_mora' ? '#dc3545' :
        cuota.estado_pago === 'al_dia' ? '#17a2b8' : '#6c757d';

      tableHTML += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 8px;">${cuota.cuota_nro || '-'}</td>
          <td style="padding: 8px;">$${formatCurrency(cuota.valor_cuota)}</td>
          <td style="padding: 8px;">${formatDate(cuota.fecha_limite)}</td>
          <td style="padding: 8px; font-weight: 600; color: ${estadoColor};">
            ${humanizeEstado(cuota.estado_pago)}
          </td>
          <td style="padding: 8px;">${formatDate(cuota.fecha_de_pago)}</td>
          <td style="padding: 8px;">
            ${cuota.valor_pagado ? '$' + formatCurrency(cuota.valor_pagado) : '-'}
          </td>
        </tr>
      `;
    });

    tableHTML += '</tbody></table>';
    table.innerHTML = tableHTML;
    card.appendChild(table);

    return card;
  }

  /**
   * Procesa todas las carteras pendientes
   */
  async function processBatch(incluirMora) {
    try {
      const queryParam = incluirMora ? '?incluir_mora=true' : '';
      const response = await fetch(`/api/carteras-masivo${queryParam}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }

      const data = await response.json();
      return data;

    } catch (error) {
      console.error('❌ Error al procesar batch:', error);
      throw error;
    }
  }

  /**
   * Inicia el procesamiento masivo
   */
  async function startProcessing() {
    // Leer estado del checkbox
    const incluirMora = incluirMoraCheckbox.checked;

    // Inicializar estado
    isProcessing = true;
    shouldStop = false;
    currentBatch = 0;
    totalProcessed = 0;
    totalErrors = 0;

    // UI: Deshabilitar checkbox y botón iniciar, mostrar botón detener
    incluirMoraCheckbox.disabled = true;
    startBtn.disabled = true;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    progressContainer.style.display = 'block';
    resultsContainer.innerHTML = '';

    // Mostrar mensaje inicial
    const startMessage = document.createElement('div');
    startMessage.style.cssText = `
      padding: 16px;
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      margin-bottom: 16px;
      border-radius: 4px;
    `;
    startMessage.innerHTML = `
      <strong>🚀 Iniciando procesamiento global de carteras...</strong><br>
      <span style="font-size: 0.9em; color: #555;">
        Consultando cuotas pendientes y vencidas${incluirMora ? ' (incluyendo mora)' : ''}...
      </span>
    `;
    resultsContainer.appendChild(startMessage);

    try {
      console.log(`📊 Iniciando procesamiento global de carteras ${incluirMora ? '(incluyendo mora)' : ''}...`);

      const result = await processBatch(incluirMora);

      if (!result.success) {
        throw new Error(result.error || 'Error desconocido');
      }

      // Actualizar estadísticas globales
      totalProcessed = result.procesados || 0;
      totalErrors = result.errores || 0;

      // Mostrar resultados por acuerdo
      if (result.acuerdos && result.acuerdos.length > 0) {
        result.acuerdos.forEach(acuerdo => {
          const card = createAcuerdoCard(acuerdo, acuerdo.cuotas);
          resultsContainer.appendChild(card);
        });
      }

      // Mensaje de resumen
      const summaryMessage = document.createElement('div');
      summaryMessage.style.cssText = `
        padding: 16px;
        background: ${totalErrors > 0 ? '#fff3cd' : '#d4edda'};
        border-left: 4px solid ${totalErrors > 0 ? '#ffc107' : '#28a745'};
        margin-top: 16px;
        border-radius: 4px;
        font-weight: 600;
      `;
      summaryMessage.innerHTML = `
        ✅ Procesamiento completado<br>
        <span style="font-size: 0.9em; font-weight: normal;">
          • Acuerdos procesados: ${result.acuerdos_procesados}<br>
          • Cuotas actualizadas: ${result.cuotas_actualizadas}<br>
          ${totalErrors > 0 ? `• Errores: ${totalErrors}` : ''}
        </span>
      `;
      resultsContainer.insertBefore(summaryMessage, resultsContainer.firstChild.nextSibling);

    } catch (error) {
      console.error('❌ Error durante el procesamiento:', error);

      const errorMessage = document.createElement('div');
      errorMessage.style.cssText = `
        padding: 16px;
        background: #f8d7da;
        border-left: 4px solid #dc3545;
        margin-top: 16px;
        border-radius: 4px;
      `;
      errorMessage.innerHTML = `
        <strong>❌ Error durante el procesamiento</strong><br>
        <span style="font-size: 0.9em;">${error.message}</span>
      `;
      resultsContainer.appendChild(errorMessage);
    } finally {
      // Restaurar UI
      isProcessing = false;
      incluirMoraCheckbox.disabled = false;
      startBtn.disabled = false;
      startBtn.style.display = 'inline-block';
      stopBtn.style.display = 'none';
      progressContainer.style.display = 'none';
    }
  }

  /**
   * Detiene el procesamiento
   */
  function stopProcessing() {
    shouldStop = true;
    stopBtn.disabled = true;
    stopBtn.textContent = '⏳ Deteniendo...';

    console.log('⏹️ Solicitud de detención recibida');
  }

  // Event listeners
  startBtn.addEventListener('click', startProcessing);
  stopBtn.addEventListener('click', stopProcessing);

  console.log('✅ Event listeners de Carteras Masivo configurados');

})();
