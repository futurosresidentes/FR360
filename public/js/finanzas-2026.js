/**
 * Finanzas 2026 Module
 * Comparación de facturación por mes entre años
 */

(function() {
  'use strict';

  const loadBtn = document.getElementById('loadFinanzasBtn');
  const container = document.getElementById('finanzasContainer');

  if (!loadBtn || !container) {
    console.log('[Finanzas] Módulo no inicializado - elementos no encontrados');
    return;
  }

  console.log('[Finanzas] Módulo inicializado');

  // Formatear número como moneda colombiana
  function formatCurrency(value) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  }

  // Obtener color según comparación con año anterior
  // Si es superior: verde, igual o hasta -5%: amarillo, inferior >5%: rojo
  function getComparisonColor(current, previous, isLastYear) {
    if (isLastYear) return '#000000'; // 2024 (último) siempre negro
    if (previous === 0) return current > 0 ? '#28a745' : '#000000';

    const variation = ((current - previous) / previous) * 100;

    if (variation > 0) return '#28a745'; // Verde: superior
    if (variation >= -5) return '#FFC107'; // Amarillo: igual o hasta -5%
    return '#dc3545'; // Rojo: inferior >5%
  }

  // Renderizar celda con formato condicional
  function renderCell(value, prevYearValue, isLastYear) {
    const color = getComparisonColor(value, prevYearValue, isLastYear);
    return `<td style="padding: 12px; text-align: right; border: 1px solid #ddd; color: ${color}; font-weight: ${isLastYear ? '400' : '600'};">${formatCurrency(value)}</td>`;
  }

  // Renderizar fila con formato condicional
  // Con años en orden [2026, 2025, 2024], comparamos cada año con el siguiente (año anterior)
  function renderRow(label, values, bgColor = '') {
    const bgStyle = bgColor ? `background: ${bgColor};` : '';
    let cells = '';
    values.forEach((v, i) => {
      // El valor del año anterior está en i+1 (ej: 2026 se compara con 2025)
      const prevYearValue = i < values.length - 1 ? values[i + 1] : 0;
      const isLastYear = i === values.length - 1; // 2024 es el último, sin comparación
      cells += renderCell(v, prevYearValue, isLastYear);
    });
    return `
      <tr style="${bgStyle}">
        <td style="padding: 12px; font-weight: 600; text-align: center; border: 1px solid #ddd;">${label}</td>
        ${cells}
      </tr>
    `;
  }

  // Renderizar tabla de comparación
  function renderComparison(data) {
    // Filtrar _meta y obtener solo los años
    const years = Object.keys(data).filter(k => k !== '_meta').sort().reverse();

    let html = `
      <div style="overflow-x: auto;">
        <table class="finanzas-table" style="width: 100%; border-collapse: collapse; margin-top: 20px;">
          <thead>
            <tr style="background-color: #075183;">
              <th style="padding: 12px; text-align: center; border: 1px solid #075183; color: #fff; font-weight: 700;">Mes</th>
              ${years.map(y => `<th style="padding: 12px; text-align: center; border: 1px solid #075183; color: #fff; font-weight: 700;">${y}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    // Fila de Enero
    const eneroValues = years.map(y => data[y]?.enero?.total || 0);
    html += renderRow('Enero', eneroValues, '#f8f9fa');

    // Fila de Febrero completo
    const febreroValues = years.map(y => data[y]?.febrero?.total || 0);
    html += renderRow('Febrero', febreroValues);

    // Fila de Febrero parcial (hasta hoy)
    const febreroParcialValues = years.map(y => data[y]?.febrero_parcial?.total || 0);
    html += renderRow('Febrero parcial <span style="color:#999; font-weight:400;">(Hasta hoy)</span>', febreroParcialValues, '#f8f9fa');

    // Fila de Febrero hoy (solo el día actual)
    const febreroHoyValues = years.map(y => data[y]?.febrero_hoy?.total || 0);
    html += renderRow('Febrero hoy <span style="color:#999; font-weight:400;">(Solo hoy)</span>', febreroHoyValues);

    html += `
          </tbody>
        </table>
      </div>
      <p style="margin-top: 12px; color: #666; font-size: 12px;">
        * Colores: <span style="color:#28a745;">■</span> Superior al año anterior,
        <span style="color:#FFC107;">■</span> Igual o hasta -5%,
        <span style="color:#dc3545;">■</span> Inferior >5%.
        Febrero parcial incluye hoy. Datos: valor_neto, marca Futuros Residentes.
      </p>

      <!-- Gráficas de líneas acumulativas -->
      <div style="margin-top: 30px;">
        <div style="margin-bottom: 30px;">
          <h4 style="text-align: center; margin-bottom: 10px;" id="chartFebreroTitle">Febrero - Acumulado diario</h4>
          <canvas id="chartFebrero" style="max-height: 300px;"></canvas>
        </div>
        <div>
          <h4 style="text-align: center; margin-bottom: 10px;">Enero - Acumulado diario</h4>
          <canvas id="chartEnero" style="max-height: 300px;"></canvas>
        </div>
      </div>
    `;

    container.innerHTML = html;

    // Renderizar gráficas (pasar solo los años, no _meta)
    const yearsOnly = years.filter(y => y !== '_meta');
    renderCharts(data, yearsOnly);
  }

  // Colores para cada año
  const yearColors = {
    '2024': { bg: 'rgba(108, 117, 125, 0.2)', border: '#6c757d' },
    '2025': { bg: 'rgba(0, 123, 255, 0.2)', border: '#007bff' },
    '2026': { bg: 'rgba(40, 167, 69, 0.2)', border: '#28a745' }
  };

  // Convertir datos diarios a acumulados
  function toCumulative(dailyData) {
    if (!dailyData || !dailyData.length) return [];
    let cumulative = 0;
    return dailyData.map(d => {
      cumulative += d.total;
      return { day: d.day, total: cumulative };
    });
  }

  // Renderizar gráficas de líneas
  function renderCharts(data, years) {
    const meta = data._meta || {};
    const currentDay = meta.currentDay || new Date().getDate();
    const currentMonth = meta.currentMonth || (new Date().getMonth() + 1);
    const febreroEnCurso = currentMonth === 2;

    // Gráfica de Enero (acumulado diario)
    const ctxEnero = document.getElementById('chartEnero');
    if (ctxEnero) {
      // Obtener el máximo de días (31 para enero)
      const maxDays = 31;
      const labels = Array.from({ length: maxDays }, (_, i) => i + 1);

      const datasets = years.map(year => {
        const dailyData = data[year]?.enero_daily || [];
        const cumulativeData = toCumulative(dailyData);

        // Crear array de valores para cada día
        const values = labels.map(day => {
          const found = cumulativeData.find(d => d.day === day);
          return found ? found.total : null;
        });

        return {
          label: year,
          data: values,
          borderColor: yearColors[year]?.border || '#666',
          backgroundColor: yearColors[year]?.bg || 'rgba(100,100,100,0.2)',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 5
        };
      });

      new Chart(ctxEnero, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { title: { display: true, text: 'Día del mes' } },
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Acumulado' },
              ticks: { callback: (value) => '$' + (value / 1000000).toFixed(0) + 'M' }
            }
          }
        }
      });
    }

    // Gráfica de Febrero (acumulado diario)
    const ctxFebrero = document.getElementById('chartFebrero');
    const titleFebrero = document.getElementById('chartFebreroTitle');

    if (ctxFebrero) {
      // Para febrero parcial, mostrar hasta hoy (incluyendo día actual)
      const maxDays = febreroEnCurso ? currentDay : 28;
      const labels = Array.from({ length: maxDays }, (_, i) => i + 1);

      if (titleFebrero) {
        titleFebrero.textContent = febreroEnCurso
          ? `Febrero - Acumulado diario (hasta día ${currentDay})`
          : 'Febrero - Acumulado diario';
      }

      const datasets = years.map(year => {
        const dailyData = data[year]?.febrero_daily || [];
        const cumulativeData = toCumulative(dailyData);

        const values = labels.map(day => {
          const found = cumulativeData.find(d => d.day === day);
          return found ? found.total : null;
        });

        return {
          label: year,
          data: values,
          borderColor: yearColors[year]?.border || '#666',
          backgroundColor: yearColors[year]?.bg || 'rgba(100,100,100,0.2)',
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 5
        };
      });

      new Chart(ctxFebrero, {
        type: 'line',
        data: { labels, datasets },
        options: {
          responsive: true,
          interaction: { intersect: false, mode: 'index' },
          plugins: {
            legend: { position: 'top' },
            tooltip: {
              callbacks: {
                label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
              }
            }
          },
          scales: {
            x: { title: { display: true, text: 'Día del mes' } },
            y: {
              beginAtZero: true,
              title: { display: true, text: 'Acumulado' },
              ticks: { callback: (value) => '$' + (value / 1000000).toFixed(0) + 'M' }
            }
          }
        }
      });
    }
  }

  // Cargar datos
  async function loadFinanzas() {
    loadBtn.disabled = true;
    loadBtn.textContent = '⏳ Cargando...';
    container.innerHTML = '<p style="color: #666;">Consultando datos de facturación...</p>';

    try {
      const response = await fetch('/api/getFacturacionComparison', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          args: [[2024, 2025, 2026]]
        })
      });

      const result = await response.json();

      if (!response.ok || result.error) {
        throw new Error(result.error || 'Error al cargar datos');
      }

      console.log('[Finanzas] Datos recibidos:', result.result);
      renderComparison(result.result);

    } catch (error) {
      console.error('[Finanzas] Error:', error);
      container.innerHTML = `<p style="color: #dc3545;">❌ Error: ${error.message}</p>`;
    } finally {
      loadBtn.disabled = false;
      loadBtn.textContent = '🔄 Cargar Datos';
    }
  }

  // Event listener
  loadBtn.addEventListener('click', loadFinanzas);

})();
