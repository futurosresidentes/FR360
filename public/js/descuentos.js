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
      <div style="margin-bottom: 16px; display: flex; gap: 10px; align-items: center; flex-wrap: wrap;">
        <h3 style="margin: 0;">Descuentos Vigentes</h3>
        ${window.userEmail === 'daniel.cardona@sentiretaller.com' ? '<button id="btnGenerarDescuento" class="btn-primary" style="background: #e17055;">Generar descuentos (100 clientes)</button>' : ''}
        <span id="descuentosStatus" style="color: #666;"></span>
      </div>
      <div id="descuentosResumen"></div>
      <div id="descuentosTableContainer">
        <p style="color: #666;">Cargando descuentos...</p>
      </div>
    `;

    const btnGenerar = document.getElementById('btnGenerarDescuento');
    if (btnGenerar) btnGenerar.addEventListener('click', generarDescuento);

    await cargarDescuentos();
  }

  async function cargarDescuentos() {
    const tableContainer = document.getElementById('descuentosTableContainer');
    const resumenContainer = document.getElementById('descuentosResumen');

    try {
      const resp = await fetch('/api/descuentos/vigentes');
      const data = await resp.json();

      if (!data.success || !data.data || data.data.length === 0) {
        resumenContainer.innerHTML = '';
        tableContainer.innerHTML = '<p style="color: #999;">No hay descuentos vigentes.</p>';
        return;
      }

      const pagadosSet = new Set(data.pagados || []);

      // Agrupar por campaña
      const campanas = {};
      for (const d of data.data) {
        const camp = d.campana || 'Sin campaña';
        if (!campanas[camp]) campanas[camp] = [];
        campanas[camp].push(d);
      }

      const campanasKeys = Object.keys(campanas).sort();

      // Calcular resumen por campaña
      const resumenes = {};
      for (const camp of campanasKeys) {
        const items = campanas[camp];
        let totalCartera = 0;
        let totalPagado = 0;
        let totalPagadoCount = 0;
        for (const d of items) {
          totalCartera += Number(d.valor_normal || 0);
          const estaPagado = d.id_factura && pagadosSet.has(d.id_factura.trim());
          if (estaPagado) {
            totalPagado += Number(d.valor_con_descuento || 0);
            totalPagadoCount++;
          }
        }
        resumenes[camp] = { totalCartera, totalPagado, totalPagadoCount, total: items.length };
      }

      // Render resumen con dropdown
      const optionsHtml = campanasKeys.map(c => `<option value="${c}">${c}</option>`).join('');

      resumenContainer.innerHTML = `
        <div style="background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <label style="font-weight: 600; font-size: 14px;">Campaña:</label>
            <select id="campanaSelect" style="padding: 6px 12px; border: 1px solid #ced4da; border-radius: 4px; font-size: 14px;">
              ${optionsHtml}
            </select>
          </div>
          <div id="campanaResumenInfo"></div>
        </div>
      `;

      const selectEl = document.getElementById('campanaSelect');

      function renderResumen(camp) {
        const r = resumenes[camp];
        const pct = r.totalCartera > 0 ? ((r.totalPagado / r.totalCartera) * 100).toFixed(1) : '0.0';
        const pctColor = parseFloat(pct) >= 50 ? '#27ae60' : parseFloat(pct) >= 25 ? '#e67e22' : '#e74c3c';

        document.getElementById('campanaResumenInfo').innerHTML = `
          <div style="display: flex; gap: 24px; flex-wrap: wrap; align-items: center;">
            <div>
              <span style="color: #666; font-size: 12px;">Total Cartera</span><br>
              <span style="font-size: 20px; font-weight: 700; color: #2d3436;">${formatMoney(r.totalCartera)}</span>
            </div>
            <div>
              <span style="color: #666; font-size: 12px;">Total Pagado</span><br>
              <span style="font-size: 20px; font-weight: 700; color: #27ae60;">${formatMoney(r.totalPagado)}</span>
              <span style="font-size: 12px; color: #999;"> (${r.totalPagadoCount} de ${r.total})</span>
            </div>
            <div>
              <span style="color: #666; font-size: 12px;">Recaudo</span><br>
              <span style="font-size: 20px; font-weight: 700; color: ${pctColor};">${pct}%</span>
            </div>
          </div>
        `;

        renderTabla(camp, campanas[camp], pagadosSet);
      }

      function renderTabla(camp, items, pagadosSet) {
        const rows = items.map(d => {
          const linkHtml = d.link ? `<a href="${d.link}" target="_blank" style="color:#0984e3;">Pagar</a>` : '-';
          const estaPagado = d.id_factura && pagadosSet.has(d.id_factura.trim());
          const estadoHtml = estaPagado ? '✅' : '⌛';

          return `
          <tr>
            <td>${d.numero_documento || ''}</td>
            <td>${d.celular || ''}</td>
            <td>${d.correo || ''}</td>
            <td style="text-align:right">${formatMoney(d.valor_normal)}</td>
            <td style="text-align:right; color: #27ae60; font-weight: bold;">${formatMoney(d.valor_con_descuento)}</td>
            <td style="text-align:center">${d.dias_acceso_extras || 0}</td>
            <td style="text-align:center">${linkHtml}</td>
            <td style="text-align:center; font-size: 16px;">${estadoHtml}</td>
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
                <th style="padding:8px; text-align:right;">Valor Normal</th>
                <th style="padding:8px; text-align:right;">Con Descuento</th>
                <th style="padding:8px; text-align:center;">Dias Extra</th>
                <th style="padding:8px; text-align:center;">Link</th>
                <th style="padding:8px; text-align:center;">Estado</th>
                <th style="padding:8px; text-align:left;">Observaciones</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      }

      selectEl.addEventListener('change', () => renderResumen(selectEl.value));
      renderResumen(campanasKeys[0]);

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
        body: JSON.stringify({ soloUno: false, limite: 100 })
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
