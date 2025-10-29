// Retomas UDEA Module
(function() {
  'use strict';

  let retomasData = [];

  // Initialize when DOM is ready
  document.addEventListener('DOMContentLoaded', function() {
    const refreshBtn = document.getElementById('refreshRetomasBtn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', loadRetomasData);
    }

    // Load data when Retomas Udea tab becomes active
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.target.id === 'retomas-udea' && mutation.target.classList.contains('active')) {
          // Auto-load on first visit if no data
          if (retomasData.length === 0) {
            loadRetomasData();
          }
        }
      });
    });

    const retomasPane = document.getElementById('retomas-udea');
    if (retomasPane) {
      observer.observe(retomasPane, { attributes: true, attributeFilter: ['class'] });
    }
  });

  // Load Retomas data
  async function loadRetomasData() {
    const refreshBtn = document.getElementById('refreshRetomasBtn');
    const statusContainer = document.getElementById('retomasStatusContainer');
    const statusText = document.getElementById('retomasStatus');

    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = '⏳ Cargando...';
    }

    if (statusContainer) {
      statusContainer.style.display = 'block';
      statusText.textContent = '🔍 Buscando links de pago de Udea 2026...';
    }

    try {
      const response = await fetch('/api/retomas-udea', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        retomasData = result.data || [];

        // Show summary
        if (statusContainer && result.summary) {
          const summary = result.summary;
          statusText.innerHTML = `
            ✅ <strong>Análisis completado:</strong><br>
            • Total links encontrados: ${summary.totalLinks}<br>
            • Filtrados por producto: ${summary.filteredLinks}<br>
            • Links sin pagar: ${summary.unpaidLinks}<br>
            • Falsos positivos (ya compraron con otro link): ${summary.documentosYaCompraron}<br>
            • Links reales sin comprar: ${summary.linksReales}<br>
            • <strong>Contactos únicos para retomar: ${summary.uniqueContacts}</strong>
          `;
        }

        // Render table
        renderTable();
      } else {
        throw new Error(result.error || 'Error desconocido');
      }

    } catch (error) {
      console.error('Error loading Retomas data:', error);
      showError('❌ Error al cargar los datos: ' + error.message);

      if (statusContainer) {
        statusText.textContent = '❌ Error al cargar datos. Por favor, intenta de nuevo.';
      }
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Cargar Retomas';
      }
    }
  }

  // Render table
  function renderTable() {
    const container = document.getElementById('retomasTableContainer');

    if (!retomasData || retomasData.length === 0) {
      container.innerHTML = '<div class="udea-empty">No hay links sin pagar para retomar</div>';
      return;
    }

    const table = document.createElement('table');
    table.id = 'retomasTable';
    table.innerHTML = `
      <thead>
        <tr>
          <th>Cédula</th>
          <th>Nombres</th>
          <th>Apellidos</th>
          <th>Correo</th>
          <th>Celular</th>
          <th>Producto</th>
          <th>Fecha Creación</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tbody = table.querySelector('tbody');

    // Sort by createdAt descending (most recent first)
    const sortedData = [...retomasData].sort((a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    sortedData.forEach(contact => {
      const row = document.createElement('tr');

      const cedula = contact.identityDocument || 'N/A';
      const nombres = contact.givenName || 'N/A';
      const apellidos = contact.familyName || 'N/A';
      const correo = contact.email || 'N/A';
      const celular = contact.phone || 'N/A';
      const producto = contact.product || 'N/A';
      const fecha = contact.createdAt ? formatDate(contact.createdAt) : 'N/A';

      row.innerHTML = `
        <td class="documento-col"><strong>${cedula}</strong></td>
        <td class="nombre-col">${nombres}</td>
        <td class="apellido-col">${apellidos}</td>
        <td class="correo-col">${correo}</td>
        <td class="telefono-col">${celular}</td>
        <td class="producto-col">${producto}</td>
        <td class="fecha-col">${fecha}</td>
      `;

      tbody.appendChild(row);
    });

    container.innerHTML = '';
    container.appendChild(table);
  }

  // Format date
  function formatDate(dateString) {
    if (!dateString) return 'N/A';

    try {
      const date = new Date(dateString);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    } catch (error) {
      return dateString;
    }
  }

  // Show error message
  function showError(message) {
    const container = document.getElementById('retomasTableContainer');
    container.innerHTML = `<div class="udea-error">${message}</div>`;
  }

})();
