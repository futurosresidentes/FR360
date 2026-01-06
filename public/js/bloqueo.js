/**
 * Bloqueo de Morosos Module
 * Maneja el flujo de bloqueo con confirmaciones paso a paso
 */

(function() {
  'use strict';

  // DOM Elements
  const buscarBtn = document.getElementById('buscarParaBloqueoBtn');
  const statusContainer = document.getElementById('bloqueoStatus');
  const statusText = document.getElementById('bloqueoStatusText');
  const resultsContainer = document.getElementById('bloqueoResultsContainer');

  if (!buscarBtn) return; // Exit if not on the right page

  // Store candidates data
  let candidatos = [];

  // Show status message
  function showStatus(message) {
    statusContainer.style.display = 'block';
    statusText.textContent = message;
  }

  // Hide status
  function hideStatus() {
    statusContainer.style.display = 'none';
  }

  // Get full name from candidate
  function getNombreCompleto(c) {
    const nombres = c.nombres || '';
    const apellidos = c.apellidos || '';
    return (nombres + ' ' + apellidos).trim() || '-';
  }

  // Search for candidates to block
  async function buscarCandidatos() {
    buscarBtn.disabled = true;
    buscarBtn.innerHTML = '<span class="spinner"></span> Buscando...';
    resultsContainer.innerHTML = '';
    showStatus('Consultando WordPress, Frapp y Strapi... (esto puede tomar varios minutos)');

    try {
      const response = await fetch('/api/obtenerCandidatosBloqueo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Error al consultar datos');
      }

      candidatos = data.result.candidatos || [];
      const stats = data.result.stats || {};

      if (candidatos.length === 0) {
        hideStatus();
        resultsContainer.innerHTML = `
          <div style="padding: 20px; background: #d4edda; border-radius: 8px; border-left: 4px solid #28a745; color: #155724;">
            <strong>✅ Sin candidatos para bloqueo</strong><br>
            Se revisaron ${stats.cuotasEnMora || 0} cuotas en mora.<br>
            ${stats.cuotasMoraGrave || 0} con mora >= 6 días, pero todos los usuarios ya están bloqueados.
          </div>
        `;
        return;
      }

      hideStatus();
      renderCandidatos(stats);

    } catch (error) {
      console.error('Error buscando candidatos:', error);
      hideStatus();
      resultsContainer.innerHTML = `
        <div style="padding: 20px; background: #f8d7da; border-radius: 8px; border-left: 4px solid #dc3545; color: #721c24;">
          <strong>❌ Error</strong><br>
          ${error.message}
        </div>
      `;
    } finally {
      buscarBtn.disabled = false;
      buscarBtn.innerHTML = '🔍 Buscar Candidatos a Bloqueo';
    }
  }

  // Render candidates table
  function renderCandidatos(stats) {
    const html = `
      <div style="margin-bottom: 16px; padding: 12px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3; color: #0d47a1;">
        <strong>📊 Estadísticas:</strong>
        Total WP: ${stats.totalWP || 0} | WP con moroso: ${stats.wpConMoroso || 0} | WP activos: ${stats.wpActivos || 0} |
        Frapp activos: ${stats.frappActivos || 0} | Cuotas en mora: ${stats.cuotasEnMora || 0} | Mora grave (>=6d): ${stats.cuotasMoraGrave || 0}
      </div>
      <div style="margin-bottom: 16px; padding: 12px; background: #f8d7da; border-radius: 8px; border-left: 4px solid #dc3545; color: #721c24;">
        <strong>⚠️ Encontrados ${candidatos.length} candidato(s) para BLOQUEO</strong><br>
        Estos usuarios tienen cuotas con mora >= 6 días y NO están bloqueados. Confirma cada bloqueo individualmente.
      </div>
      <table class="bloqueo-table" style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">#</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Cédula</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Nombre</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Email</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Teléfono</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Cuotas</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Max Mora</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${candidatos.map((c, idx) => `
            <tr id="bloqueo-row-${idx}" style="border-bottom: 1px solid #dee2e6;">
              <td style="padding: 10px;">${idx + 1}</td>
              <td style="padding: 10px; font-family: monospace;">${c.cedula}</td>
              <td style="padding: 10px;">${getNombreCompleto(c)}</td>
              <td style="padding: 10px;">${c.email || '-'}</td>
              <td style="padding: 10px;">${c.telefono || '-'}</td>
              <td style="padding: 10px; text-align: center;">${c.cuotas?.length || 0}</td>
              <td style="padding: 10px; text-align: center;">
                <span style="background: ${c.maxDiasMora > 30 ? '#dc3545' : '#ffc107'}; color: ${c.maxDiasMora > 30 ? 'white' : '#333'}; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
                  ${c.maxDiasMora} días
                </span>
              </td>
              <td style="padding: 10px; text-align: center;">
                <button
                  class="btn-bloquear"
                  data-index="${idx}"
                  style="background: #dc3545; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 500;"
                >
                  🔒 Bloquear
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    resultsContainer.innerHTML = html;

    // Add click handlers to buttons
    resultsContainer.querySelectorAll('.btn-bloquear').forEach(btn => {
      btn.addEventListener('click', handleBloquear);
    });
  }

  // Handle block button click with confirmation
  async function handleBloquear(event) {
    const btn = event.target;
    const idx = parseInt(btn.dataset.index, 10);
    const candidato = candidatos[idx];
    const row = document.getElementById(`bloqueo-row-${idx}`);
    const nombreCompleto = getNombreCompleto(candidato);

    // Build cuotas info for confirmation
    let cuotasInfo = '\n\nCuotas en mora:\n';
    if (candidato.cuotas && candidato.cuotas.length > 0) {
      cuotasInfo += candidato.cuotas.map(c =>
        `  ❌ Cuota #${c.cuota_nro}: ${c.estado_pago} (${c.diasMora} días mora) - Vence: ${c.fecha_limite}`
      ).join('\n');
    }

    // Build actions info
    let accionesInfo = '\n\nAcciones a ejecutar:\n';
    if (candidato.activoEnWP) accionesInfo += '• WordPress: Asignar rol "moroso"\n';
    if (candidato.activoEnFrapp) accionesInfo += '• Frapp: Cambiar status a "moroso"\n';
    accionesInfo += '• Strapi: Registrar bloqueo\n';
    accionesInfo += '• Google Chat: Notificar bloqueo\n';
    if (candidato.crmId) accionesInfo += '• CRM: Actualizar a "Dado de baja por mora"\n';
    if (candidato.telefono) accionesInfo += '• Callbell: Enviar mensaje WhatsApp\n';

    // First confirmation
    const confirm1 = confirm(
      `⚠️ ¿Estás seguro de BLOQUEAR a este usuario?\n\n` +
      `📄 Cédula: ${candidato.cedula}\n` +
      `👤 Nombre: ${nombreCompleto}\n` +
      `📧 Email: ${candidato.email || 'N/A'}\n` +
      `📱 Teléfono: ${candidato.telefono || 'N/A'}\n` +
      `⏱️ Máximo días mora: ${candidato.maxDiasMora}` +
      cuotasInfo +
      accionesInfo
    );

    if (!confirm1) return;

    // Second confirmation
    const confirm2 = confirm(
      `🚨 SEGUNDA CONFIRMACIÓN - BLOQUEO 🚨\n\n` +
      `¿Confirmas BLOQUEAR a ${nombreCompleto} (${candidato.cedula})?\n\n` +
      `El usuario perderá acceso a la plataforma.\n` +
      `Se enviará notificación por WhatsApp.`
    );

    if (!confirm2) return;

    // Proceed with block
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Procesando...';
    btn.style.background = '#6c757d';

    try {
      const response = await fetch('/api/bloquearUsuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [candidato] })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Error al bloquear');
      }

      const result = data.result;

      // Build result message
      let resultMsg = `Resultados para ${nombreCompleto}:\n\n`;
      resultMsg += `WordPress: ${result.wpOk ? '✅' : '❌'}\n`;
      resultMsg += `Frapp: ${result.frappOk ? '✅' : '❌'}\n`;
      resultMsg += `Strapi: ${result.strapiOk ? '✅' : '❌'}\n`;
      resultMsg += `Google Chat: ${result.chatOk ? '✅' : '❌'}\n`;
      if (candidato.crmId) {
        resultMsg += `CRM: ${result.crmOk ? '✅' : '❌'}\n`;
      }
      if (candidato.telefono) {
        resultMsg += `Callbell: ${result.callbellOk ? '✅' : '❌'}\n`;
      }

      if (result.errores && result.errores.length > 0) {
        resultMsg += `\nErrores:\n${result.errores.join('\n')}`;
      }

      // Success - update UI
      const allOk = result.wpOk || result.frappOk;
      row.style.background = allOk ? '#f8d7da' : '#fff3cd';
      btn.innerHTML = allOk ? '🔒 Bloqueado' : '⚠️ Parcial';
      btn.style.background = allOk ? '#dc3545' : '#ffc107';
      btn.disabled = true;

      alert(resultMsg);

    } catch (error) {
      console.error('Error bloqueando:', error);

      // Error - update UI
      row.style.background = '#f8d7da';
      btn.innerHTML = '❌ Error';
      btn.style.background = '#dc3545';

      setTimeout(() => {
        btn.innerHTML = '🔒 Reintentar';
        btn.style.background = '#dc3545';
        btn.disabled = false;
      }, 3000);

      alert(`❌ Error al bloquear:\n\n${error.message}`);
    }
  }

  // Event listeners
  buscarBtn.addEventListener('click', buscarCandidatos);

})();
