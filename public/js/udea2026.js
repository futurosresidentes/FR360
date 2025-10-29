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
    // 1. Separar acuerdos de contado vs financiado
    const contadoFacturaciones = [];
    const financiadoAcuerdos = [];

    facturacionesData.forEach(facturacion => {
      const acuerdo = facturacion.acuerdo || '';

      if (acuerdo.toLowerCase() === 'contado') {
        facturacion.valorVenta = facturacion.valor_neto;
        contadoFacturaciones.push(facturacion);
      } else if (acuerdo) {
        financiadoAcuerdos.push(acuerdo);
      }
    });

    // 2. Si no hay acuerdos financiados, terminar aquí
    if (financiadoAcuerdos.length === 0) {
      console.log('✅ Todas las facturaciones son de contado');
      return;
    }

    console.log(`📊 Obteniendo carteras para ${financiadoAcuerdos.length} acuerdos financiados...`);

    // 3. Obtener TODAS las carteras de Udea 2026 en una sola consulta
    let allCarteras = [];
    try {
      const response = await fetch('/api/carteras-udea2026', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          allCarteras = result.data || [];
          console.log(`✅ Total carteras Udea 2026: ${allCarteras.length}`);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      console.error('❌ Error fetching carteras:', error);
      // Fallback: usar valor_neto para todos
      facturacionesData.forEach(f => {
        if (!f.valorVenta) f.valorVenta = f.valor_neto;
      });
      return;
    }

    // 4. Crear un mapa de acuerdo -> cartera
    const carteraMap = new Map();
    allCarteras.forEach(cartera => {
      if (cartera.nro_acuerdo) {
        carteraMap.set(cartera.nro_acuerdo, cartera);
      }
    });

    // 5. Asignar valorVenta a cada facturación financiada
    facturacionesData.forEach(facturacion => {
      if (!facturacion.valorVenta) { // Solo procesar los que no son contado
        const acuerdo = facturacion.acuerdo || '';
        const cartera = carteraMap.get(acuerdo);

        if (cartera && cartera.valor_total_acuerdo) {
          facturacion.valorVenta = cartera.valor_total_acuerdo;
        } else {
          facturacion.valorVenta = facturacion.valor_neto;
        }
      }
    });

    console.log('✅ Carteras procesadas correctamente');
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
