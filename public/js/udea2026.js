// UDEA 2026 Module
(function() {
  'use strict';

  let facturacionesData = [];

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    const refreshBtn = document.getElementById('refreshUdeaBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadUdeaData);
    }

    // Load data when UDEA 2026 tab becomes active
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target.id === 'udea2026' && mutation.target.classList.contains('active')) {
          loadUdeaData();
        }
      });
    });

    const udeaPane = document.getElementById('udea2026');
    if (udeaPane) {
      observer.observe(udeaPane, { attributes: true, attributeFilter: ['class'] });
    }
  });

  // Load UDEA data
  async function loadUdeaData() {
    const refreshBtn = document.getElementById('refreshUdeaBtn');
    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '🔄 Cargando...';
    }

    try {
      // Fetch facturaciones using API client
      facturacionesData = await api.legacy('fetchUdea2026Facturaciones');

      // Process data with cartera info for financed agreements
      await processFacturacionesWithCartera();

      // Render table and stats
      renderTable();
      updateStats();

    } catch (error) {
      console.error('Error loading UDEA data:', error);
      showError('Error al cargar los datos de UDEA 2026');
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Actualizar';
      }
    }
  }

  // Process facturaciones and fetch cartera data for financed ones
  async function processFacturacionesWithCartera() {
    for (let facturacion of facturacionesData) {
      const acuerdo = facturacion.acuerdo || '';

      if (acuerdo.toLowerCase() === 'contado') {
        facturacion.valorVenta = facturacion.valor_neto;
      } else {
        // Fetch cartera data using API client
        try {
          const carteraData = await api.legacy('fetchCarteraByAcuerdo', acuerdo);

          if (carteraData && carteraData.valor_total_acuerdo) {
            facturacion.valorVenta = carteraData.valor_total_acuerdo;
          } else {
            facturacion.valorVenta = facturacion.valor_neto;
          }
        } catch (error) {
          console.error(`Error fetching cartera for acuerdo ${acuerdo}:`, error);
          facturacion.valorVenta = facturacion.valor_neto;
        }
      }
    }
  }

  // Render table
  function renderTable() {
    const container = document.getElementById('udeaTableContainer');

    if (!facturacionesData || facturacionesData.length === 0) {
      container.innerHTML = '<div class="udea-empty">No hay datos disponibles</div>';
      return;
    }

    const table = document.createElement('table');
    table.id = 'udeaTable';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Fecha</th>
          <th>Documento</th>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Teléfono</th>
          <th>Producto</th>
          <th>Valor Neto</th>
          <th>Acuerdo</th>
          <th>Venta</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    // Sort by date descending
    const sortedData = [...facturacionesData].sort((a, b) => {
      return new Date(b.fecha) - new Date(a.fecha);
    });

    sortedData.forEach(facturacion => {
      const row = document.createElement('tr');

      const fecha = facturacion.fecha || 'N/A';
      const documento = facturacion.numero_documento || 'N/A';
      const nombre = `${facturacion.nombres || ''} ${facturacion.apellidos || ''}`.trim() || 'N/A';
      const correo = facturacion.correo || 'N/A';
      const telefono = facturacion.telefono || 'N/A';
      const producto = facturacion.producto?.nombre || 'N/A';
      const valorNeto = formatCurrency(facturacion.valor_neto || 0);
      const acuerdo = facturacion.acuerdo || 'N/A';
      const valorVenta = formatCurrency(facturacion.valorVenta || 0);

      row.innerHTML = `
        <td class="fecha-col">${formatDate(fecha)}</td>
        <td class="documento-col">${documento}</td>
        <td class="nombre-col">${nombre}</td>
        <td class="correo-col">${correo}</td>
        <td class="telefono-col">${telefono}</td>
        <td class="producto-col">${producto}</td>
        <td class="valor-col">${valorNeto}</td>
        <td class="acuerdo-col">${acuerdo}</td>
        <td class="venta-col">${valorVenta}</td>
      `;

      tbody.appendChild(row);
    });

    container.innerHTML = '';
    container.appendChild(table);
  }

  // Update stats
  function updateStats() {
    if (!facturacionesData || facturacionesData.length === 0) {
      return;
    }

    let totalVentas = 0;
    let totalRecaudo = 0;
    let totalEstudiantes = facturacionesData.length;
    let contadoCount = 0;
    let financiadoCount = 0;

    facturacionesData.forEach(facturacion => {
      totalVentas += facturacion.valorVenta || 0;
      totalRecaudo += facturacion.valor_neto || 0;

      const acuerdo = (facturacion.acuerdo || '').toLowerCase();
      if (acuerdo === 'contado') {
        contadoCount++;
      } else {
        financiadoCount++;
      }
    });

    document.getElementById('totalVentas').textContent = formatCurrency(totalVentas);
    document.getElementById('totalRecaudo').textContent = formatCurrency(totalRecaudo);
    document.getElementById('totalEstudiantes').textContent = totalEstudiantes;
    document.getElementById('totalContado').textContent = contadoCount;
    document.getElementById('totalFinanciado').textContent = financiadoCount;
  }

  // Format currency
  function formatCurrency(value) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0
    }).format(value);
  }

  // Format date
  function formatDate(dateString) {
    if (!dateString) return 'N/A';

    try {
      // Split the date string to avoid timezone issues
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (error) {
      return dateString;
    }
  }

  // Show error message
  function showError(message) {
    const container = document.getElementById('udeaTableContainer');
    container.innerHTML = `<div class="udea-error">${message}</div>`;
  }

})();
