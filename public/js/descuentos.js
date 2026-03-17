/**
 * Descuentos Module
 * Muestra descuentos vigentes y permite generar nuevos
 */
(function() {
  const btn = document.getElementById('loadDescuentosBtn');
  if (!btn) return;

  const container = document.getElementById('finanzasContainer');

  btn.addEventListener('click', () => {
    mostrarPanelDescuentos();
  });

  function formatMoney(n) {
    return '$' + Number(n || 0).toLocaleString('es-CO');
  }

  async function mostrarPanelDescuentos() {
    container.innerHTML = `
      <div style="margin-bottom: 16px; display: flex; gap: 10px; align-items: center;">
        <h3 style="margin: 0;">Descuentos Vigentes</h3>
        <button id="btnGenerarDescuento" class="btn-primary" style="background: #e17055;">Generar descuentos (10 clientes)</button>
        <span id="descuentosStatus" style="color: #666;"></span>
      </div>
      <div id="descuentosTableContainer">
        <p style="color: #666;">Cargando descuentos...</p>
      </div>
    `;

    document.getElementById('btnGenerarDescuento').addEventListener('click', generarDescuento);

    await cargarDescuentos();
  }

  async function cargarDescuentos() {
    const tableContainer = document.getElementById('descuentosTableContainer');

    try {
      const resp = await fetch('/api/descuentos/vigentes');
      const data = await resp.json();

      if (!data.success || !data.data || data.data.length === 0) {
        tableContainer.innerHTML = '<p style="color: #999;">No hay descuentos vigentes.</p>';
        return;
      }

      const rows = data.data.map(d => {
        const linkHtml = d.link ? `<a href="${d.link}" target="_blank" style="color:#0984e3;">Pagar</a>` : '-';
        return `
        <tr>
          <td>${d.numero_documento || ''}</td>
          <td>${d.celular || ''}</td>
          <td>${d.correo || ''}</td>
          <td>${d.campana || ''}</td>
          <td style="text-align:right">${formatMoney(d.valor_normal)}</td>
          <td style="text-align:right; color: #27ae60; font-weight: bold;">${formatMoney(d.valor_con_descuento)}</td>
          <td style="text-align:center">${d.dias_acceso_extras || 0}</td>
          <td style="text-align:center">${linkHtml}</td>
          <td style="font-size:12px;">${d.observaciones || ''}</td>
        </tr>`;
      }).join('');

      tableContainer.innerHTML = `
        <table class="data-table" style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th style="padding:8px; text-align:left;">Documento</th>
              <th style="padding:8px; text-align:left;">Celular</th>
              <th style="padding:8px; text-align:left;">Correo</th>
              <th style="padding:8px; text-align:left;">Campaña</th>
              <th style="padding:8px; text-align:right;">Valor Normal</th>
              <th style="padding:8px; text-align:right;">Con Descuento</th>
              <th style="padding:8px; text-align:center;">Dias Extra</th>
              <th style="padding:8px; text-align:center;">Link</th>
              <th style="padding:8px; text-align:left;">Observaciones</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
    } catch (error) {
      tableContainer.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
  }

  async function generarDescuento() {
    const statusEl = document.getElementById('descuentosStatus');
    const btn = document.getElementById('btnGenerarDescuento');

    btn.disabled = true;
    statusEl.textContent = 'Procesando... (puede tomar unos segundos)';
    statusEl.style.color = '#e67e22';

    try {
      const resp = await fetch('/api/descuentos/generar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ soloUno: false, limite: 10 })
      });
      const data = await resp.json();

      if (data.success) {
        const d = data.descartados || {};
        statusEl.textContent = `Listo: ${data.creados} creado(s). Ya en campaña: ${d.yaEnCampana || 0}, Solo-marzo: ${d.soloMarzo || 0}`;
        statusEl.style.color = '#27ae60';
        await cargarDescuentos();
      } else {
        statusEl.textContent = `Error: ${data.error}`;
        statusEl.style.color = 'red';
      }
    } catch (error) {
      statusEl.textContent = `Error: ${error.message}`;
      statusEl.style.color = 'red';
    }

    btn.disabled = false;
  }
})();
