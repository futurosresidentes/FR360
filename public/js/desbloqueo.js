/**
 * Desbloqueo de Morosos Module
 * Maneja el flujo de desbloqueo con confirmaciones paso a paso
 */

(function() {
  'use strict';

  // DOM Elements
  const buscarBtn = document.getElementById('buscarMorososBtn');
  const statusContainer = document.getElementById('desbloqueoStatus');
  const statusText = document.getElementById('desbloqueoStatusText');
  const resultsContainer = document.getElementById('desbloqueoResultsContainer');

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

  // Get max dias mora from cuotas
  function getMaxDiasMora(c) {
    if (!c.cuotas || c.cuotas.length === 0) return 0;
    return Math.max(...c.cuotas.map(cuota => cuota.diasMora || 0));
  }

  // Search for candidates
  async function buscarCandidatos() {
    buscarBtn.disabled = true;
    buscarBtn.innerHTML = '<span class="spinner"></span> Buscando...';
    resultsContainer.innerHTML = '';
    showStatus('Consultando WordPress, Frapp y Strapi... (esto puede tomar varios minutos)');

    try {
      const response = await fetch('/api/obtenerCandidatosDesbloqueo', {
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
            <strong>✅ Sin candidatos para desbloqueo</strong><br>
            Se revisaron ${stats.totalCedulas || 0} usuarios morosos (WP: ${stats.wpMorosos || 0}, Frapp: ${stats.frappMorosos || 0}).<br>
            Ninguno cumple los criterios (mora ≤5 días en todas las cuotas).
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
      buscarBtn.innerHTML = '🔍 Buscar Morosos Bloqueados';
    }
  }

  // Render candidates table
  function renderCandidatos(stats) {
    const html = `
      <div style="margin-bottom: 16px; padding: 12px; background: #e3f2fd; border-radius: 8px; border-left: 4px solid #2196f3; color: #0d47a1;">
        <strong>📊 Estadísticas:</strong>
        WP morosos: ${stats.wpMorosos || 0} | Frapp morosos: ${stats.frappMorosos || 0} | Total cédulas: ${stats.totalCedulas || 0}
      </div>
      <div style="margin-bottom: 16px; padding: 12px; background: #fff3cd; border-radius: 8px; border-left: 4px solid #ffc107; color: #856404;">
        <strong>⚠️ Encontrados ${candidatos.length} candidato(s) para desbloqueo</strong><br>
        Estos usuarios tienen todas sus cuotas con ≤5 días de mora. Confirma cada desbloqueo individualmente.
      </div>
      <table class="desbloqueo-table" style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
        <thead>
          <tr style="background: #f8f9fa;">
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">#</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Cédula</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Nombre</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Email</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Teléfono</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Cuotas</th>
            <th style="padding: 10px; text-align: left; border-bottom: 2px solid #dee2e6;">Razón</th>
            <th style="padding: 10px; text-align: center; border-bottom: 2px solid #dee2e6;">Acción</th>
          </tr>
        </thead>
        <tbody>
          ${candidatos.map((c, idx) => `
            <tr id="row-${idx}" style="border-bottom: 1px solid #dee2e6;">
              <td style="padding: 10px;">${idx + 1}</td>
              <td style="padding: 10px; font-family: monospace;">${c.cedula}</td>
              <td style="padding: 10px;">${getNombreCompleto(c)}</td>
              <td style="padding: 10px;">${c.email || '-'}</td>
              <td style="padding: 10px;">${c.telefono || '-'}</td>
              <td style="padding: 10px; text-align: center;">${c.cuotas?.length || 0}</td>
              <td style="padding: 10px; font-size: 0.85em; color: #666;">${c.razon || '-'}</td>
              <td style="padding: 10px; text-align: center;">
                <button
                  class="btn-desbloquear"
                  data-index="${idx}"
                  style="background: #28a745; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: 500;"
                >
                  🔓 Desbloquear
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    resultsContainer.innerHTML = html;

    // Add click handlers to buttons
    resultsContainer.querySelectorAll('.btn-desbloquear').forEach(btn => {
      btn.addEventListener('click', handleDesbloquear);
    });
  }

  // Handle unlock button click with confirmation
  async function handleDesbloquear(event) {
    const btn = event.target;
    const idx = parseInt(btn.dataset.index, 10);
    const candidato = candidatos[idx];
    const row = document.getElementById(`row-${idx}`);
    const nombreCompleto = getNombreCompleto(candidato);

    // Build cuotas info for confirmation
    let cuotasInfo = '';
    if (candidato.cuotas && candidato.cuotas.length > 0) {
      cuotasInfo = '\n\nCuotas:\n' + candidato.cuotas.map(c =>
        `  • Cuota #${c.cuota_nro}: ${c.estado_pago}${c.diasMora > 0 ? ` (${c.diasMora} días mora)` : ''}`
      ).join('\n');
    } else {
      cuotasInfo = '\n\n⚠️ Sin cuotas registradas en Strapi';
    }

    // First confirmation
    const confirm1 = confirm(
      `¿Estás seguro de desbloquear a este usuario?\n\n` +
      `📄 Cédula: ${candidato.cedula}\n` +
      `👤 Nombre: ${nombreCompleto}\n` +
      `📧 Email: ${candidato.email || 'N/A'}\n` +
      `📱 Teléfono: ${candidato.telefono || 'N/A'}\n` +
      `📝 Razón: ${candidato.razon}` +
      cuotasInfo +
      `\n\nEsta acción:\n` +
      `• Quitará rol "moroso" en WordPress\n` +
      `• Cambiará status a "active" en Frapp\n` +
      `• Registrará desbloqueo en Strapi\n` +
      `• Enviará notificación al chat de Cobranza`
    );

    if (!confirm1) return;

    // Second confirmation
    const confirm2 = confirm(
      `⚠️ SEGUNDA CONFIRMACIÓN ⚠️\n\n` +
      `¿Confirmas desbloquear a ${nombreCompleto} (${candidato.cedula})?\n\n` +
      `Esta acción NO se puede deshacer fácilmente.`
    );

    if (!confirm2) return;

    // Proceed with unlock
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="width:14px;height:14px;border-width:2px;"></span> Procesando...';
    btn.style.background = '#6c757d';

    try {
      const response = await fetch('/api/desbloquearUsuario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [candidato] })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Error al desbloquear');
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

      if (result.errores && result.errores.length > 0) {
        resultMsg += `\nErrores:\n${result.errores.join('\n')}`;
      }

      // Success - update UI
      const allOk = result.wpOk || result.frappOk; // At least one platform worked
      row.style.background = allOk ? '#d4edda' : '#fff3cd';
      btn.innerHTML = allOk ? '✅ Desbloqueado' : '⚠️ Parcial';
      btn.style.background = allOk ? '#28a745' : '#ffc107';
      btn.disabled = true;

      alert(resultMsg);

    } catch (error) {
      console.error('Error desbloqueando:', error);

      // Error - update UI
      row.style.background = '#f8d7da';
      btn.innerHTML = '❌ Error';
      btn.style.background = '#dc3545';

      setTimeout(() => {
        btn.innerHTML = '🔓 Reintentar';
        btn.style.background = '#28a745';
        btn.disabled = false;
      }, 3000);

      alert(`❌ Error al desbloquear:\n\n${error.message}`);
    }
  }

  // Event listeners
  buscarBtn.addEventListener('click', buscarCandidatos);

})();
