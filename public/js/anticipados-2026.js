/**
 * Anticipados 2026 Module
 * Lista estudiantes con 2+ cuotas pendientes (al_dia o en_mora)
 */

(function() {
  'use strict';

  // DOM Elements
  const loadBtn = document.getElementById('loadAnticipadosBtn');
  const downloadBtn = document.getElementById('downloadAnticipadosBtn');
  const statsContainer = document.getElementById('anticipadosStatsContainer');
  const statusContainer = document.getElementById('anticipadosStatusContainer');
  const statusText = document.getElementById('anticipadosStatus');
  const tableContainer = document.getElementById('anticipadosTableContainer');
  const totalEstudiantesEl = document.getElementById('anticipadosTotalEstudiantes');
  const totalAdeudadoEl = document.getElementById('anticipadosTotalAdeudado');
  const totalAlDiaEl = document.getElementById('anticipadosTotalAlDia');

  if (!loadBtn) return; // Exit if not on the right page

  // Store current data for CSV export
  let currentEstudiantes = [];

  // Format currency
  function formatCOP(value) {
    return '$' + Number(value || 0).toLocaleString('es-CO');
  }

  // Format currency for CSV (plain number)
  function formatCOPcsv(value) {
    return Number(value || 0);
  }

  // Show status message
  function showStatus(message, isError = false) {
    statusContainer.style.display = 'block';
    statusText.textContent = message;
    statusText.style.color = isError ? '#dc3545' : '#333';
  }

  // Hide status
  function hideStatus() {
    statusContainer.style.display = 'none';
  }

  // Load anticipados data
  async function loadAnticipadosPendientes() {
    loadBtn.disabled = true;
    loadBtn.innerHTML = '<span class="spinner"></span> Cargando...';
    tableContainer.innerHTML = '';
    statsContainer.style.display = 'none';
    showStatus('Consultando carteras pendientes...');

    try {
      const response = await fetch('/api/fetchAnticipadosPendientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] })
      });

      const data = await response.json();

      if (!data.success || !data.result.success) {
        throw new Error(data.result?.error || 'Error al consultar datos');
      }

      const { estudiantes, totales } = data.result;

      // Update stats
      totalEstudiantesEl.textContent = totales.totalEstudiantes.toLocaleString('es-CO');
      totalAdeudadoEl.textContent = formatCOP(totales.totalAdeudado);
      totalAlDiaEl.textContent = formatCOP(totales.totalAlDia);
      statsContainer.style.display = 'flex';

      if (estudiantes.length === 0) {
        showStatus('No se encontraron estudiantes con 2 o más cuotas pendientes.');
        currentEstudiantes = [];
        downloadBtn.style.display = 'none';
        return;
      }

      hideStatus();
      currentEstudiantes = estudiantes;
      downloadBtn.style.display = 'inline-block';
      renderTable(estudiantes);

    } catch (error) {
      console.error('Error loading anticipados:', error);
      showStatus('Error: ' + error.message, true);
    } finally {
      loadBtn.disabled = false;
      loadBtn.innerHTML = '🔄 Cargar Anticipados';
    }
  }

  // Render table with students data
  function renderTable(estudiantes) {
    const table = document.createElement('table');
    table.className = 'anticipados-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>#</th>
          <th>Documento</th>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Celular</th>
          <th>Cuotas Pend.</th>
          <th>Total Adeudado</th>
        </tr>
      </thead>
      <tbody>
        ${estudiantes.map((est, idx) => `
          <tr>
            <td>${idx + 1}</td>
            <td>${est.documento}</td>
            <td>${est.nombre || '-'}</td>
            <td>${est.correo || '-'}</td>
            <td>${est.celular || '-'}</td>
            <td style="text-align: center;">${est.cuotas.length}</td>
            <td style="text-align: right; font-weight: 600;">${formatCOP(est.totalAdeudado)}</td>
          </tr>
        `).join('')}
      </tbody>
    `;

    tableContainer.appendChild(table);
  }

  // Download CSV function
  function downloadCSV() {
    if (currentEstudiantes.length === 0) {
      alert('No hay datos para descargar. Primero carga los anticipados.');
      return;
    }

    // CSV Header
    const headers = ['Documento', 'Nombre', 'Correo', 'Celular', 'Cuotas Pendientes', 'Total Adeudado', 'Total Al Día'];

    // CSV Rows
    const rows = currentEstudiantes.map(est => [
      est.documento,
      est.nombre || '',
      est.correo || '',
      est.celular || '',
      est.cuotas.length,
      formatCOPcsv(est.totalAdeudado),
      formatCOPcsv(est.totalAlDia)
    ]);

    // Build CSV content
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => {
        // Escape quotes and wrap in quotes if contains comma
        const str = String(cell);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `anticipados_2026_${today}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Event listeners
  loadBtn.addEventListener('click', loadAnticipadosPendientes);
  if (downloadBtn) {
    downloadBtn.addEventListener('click', downloadCSV);
  }

})();
