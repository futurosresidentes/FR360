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

  const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                       'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Colores para cada año (con fallback dinámico)
  const yearColors = {
    '2024': { bg: 'rgba(108, 117, 125, 0.2)', border: '#6c757d' },
    '2025': { bg: 'rgba(0, 123, 255, 0.2)', border: '#007bff' },
    '2026': { bg: 'rgba(40, 167, 69, 0.2)', border: '#28a745' },
    '2027': { bg: 'rgba(255, 193, 7, 0.2)', border: '#ffc107' }
  };

  function getYearColor(year) {
    return yearColors[year] || { bg: 'rgba(100,100,100,0.2)', border: '#666' };
  }

  // Convertir datos diarios a acumulados
  function toCumulative(dailyData) {
    if (!dailyData || !dailyData.length) return [];
    let cumulative = 0;
    return dailyData.map(d => {
      cumulative += d.total;
      return { day: d.day, total: cumulative };
    });
  }

  // Renderizar tabla de comparación
  function renderComparison(data) {
    const meta = data._meta || {};
    const currentMonth = meta.currentMonth || (new Date().getMonth() + 1);
    const currentDay = meta.currentDay || new Date().getDate();
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

    // Mes actual primero (parcial + hoy + total), luego meses pasados
    // Mes en curso: parcial y hoy
    const curName = MONTH_NAMES[currentMonth - 1];
    const parcialValues = years.map(y => data[y]?.[`month_${currentMonth}_parcial`]?.total || 0);
    html += renderRow(`${curName} parcial <span style="color:#999; font-weight:400;">(Hasta hoy)</span>`, parcialValues, '#f8f9fa');

    const hoyValues = years.map(y => data[y]?.[`month_${currentMonth}_hoy`]?.total || 0);
    html += renderRow(`${curName} hoy <span style="color:#999; font-weight:400;">(Solo hoy)</span>`, hoyValues);

    // Total de cada mes desde el actual hasta enero
    for (let m = currentMonth; m >= 1; m--) {
      const name = MONTH_NAMES[m - 1];
      const values = years.map(y => data[y]?.[`month_${m}`]?.total || 0);
      html += renderRow(name, values, m % 2 === 0 ? '#f8f9fa' : '');
    }

    html += `
          </tbody>
        </table>
      </div>
      <p style="margin-top: 12px; color: #666; font-size: 12px;">
        * Colores: <span style="color:#28a745;">■</span> Superior al año anterior,
        <span style="color:#FFC107;">■</span> Igual o hasta -5%,
        <span style="color:#dc3545;">■</span> Inferior >5%.
        ${curName} parcial incluye hoy. Datos: valor_neto, marca Futuros Residentes.
      </p>
    `;

    // Gráficas: una por cada mes, del actual al primero
    html += '<div style="margin-top: 30px;">';
    for (let m = currentMonth; m >= 1; m--) {
      const name = MONTH_NAMES[m - 1];
      const isCurrentMonth = m === currentMonth;
      const titleSuffix = isCurrentMonth ? ` (hasta día ${currentDay})` : '';
      html += `
        <div style="margin-bottom: 30px;">
          <h4 style="text-align: center; margin-bottom: 10px;">${name} - Acumulado diario${titleSuffix}</h4>
          <canvas id="chart_month_${m}" style="max-height: 300px;"></canvas>
        </div>
      `;
    }
    html += '</div>';

    container.innerHTML = html;

    // Renderizar gráficas
    const yearsOnly = years.filter(y => y !== '_meta');
    renderCharts(data, yearsOnly, currentMonth, currentDay);
  }

  // Renderizar gráficas de líneas (dinámico por mes)
  function renderCharts(data, years, currentMonth, currentDay) {
    for (let m = currentMonth; m >= 1; m--) {
      const canvas = document.getElementById(`chart_month_${m}`);
      if (!canvas) continue;

      const isCurrentMonth = m === currentMonth;
      const daysInMonth = new Date(2026, m, 0).getDate(); // usar 2026 como referencia
      const maxDays = isCurrentMonth ? currentDay : daysInMonth;
      const labels = Array.from({ length: maxDays }, (_, i) => i + 1);

      const datasets = years.map(year => {
        const dailyData = data[year]?.[`month_${m}_daily`] || [];
        const cumulativeData = toCumulative(dailyData);

        const values = labels.map(day => {
          const found = cumulativeData.find(d => d.day === day);
          return found ? found.total : null;
        });

        const colors = getYearColor(year);
        return {
          label: year,
          data: values,
          borderColor: colors.border,
          backgroundColor: colors.bg,
          borderWidth: 2,
          fill: false,
          tension: 0.1,
          pointRadius: 1,
          pointHoverRadius: 5
        };
      });

      new Chart(canvas, {
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

  // ==================== CARTERA ====================

  const carteraBtn = document.getElementById('loadCarteraBtn');

  // Renderizar tarjeta de resumen
  function renderCarteraCard(data, color) {
    return `
      <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); border-top: 4px solid ${color};">
        <h3 style="margin: 0 0 15px 0; color: ${color}; font-size: 1.2em;">${data.nombre}</h3>
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
          <div style="background: #f8f9fa; padding: 12px; border-radius: 6px;">
            <div style="color: #666; font-size: 0.85em;">Cartera Total</div>
            <div style="font-weight: 700; font-size: 1.1em; color: #333;">${formatCurrency(data.carteraTotal)}</div>
            <div style="color: #999; font-size: 0.75em;">${data.registros.toLocaleString()} registros</div>
          </div>
          <div style="background: #d4edda; padding: 12px; border-radius: 6px;">
            <div style="color: #155724; font-size: 0.85em;">Pagada</div>
            <div style="font-weight: 700; font-size: 1.1em; color: #155724;">${formatCurrency(data.pagada)}</div>
            <div style="color: #155724; font-size: 0.85em; font-weight: 600;">${data.pagadaPct.toFixed(1)}%</div>
          </div>
          <div style="background: #fff3cd; padding: 12px; border-radius: 6px;">
            <div style="color: #856404; font-size: 0.85em;">Por Pagar</div>
            <div style="font-weight: 700; font-size: 1.1em; color: #856404;">${formatCurrency(data.porPagar)}</div>
            <div style="color: #856404; font-size: 0.85em; font-weight: 600;">${data.porPagarPct.toFixed(1)}%</div>
          </div>
          <div style="background: #f8d7da; padding: 12px; border-radius: 6px;">
            <div style="color: #721c24; font-size: 0.85em;">En Mora</div>
            <div style="font-weight: 700; font-size: 1.1em; color: #721c24;">${formatCurrency(data.enMora)}</div>
            <div style="color: #721c24; font-size: 0.85em; font-weight: 600;">${data.enMoraPct.toFixed(1)}%</div>
          </div>
        </div>
      </div>
    `;
  }

  // Renderizar vista de cartera
  function renderCartera(data) {
    let html = `
      <div style="margin-top: 20px;">
        <h3 style="color: #075183; margin-bottom: 20px;">💰 Resumen de Cartera</h3>

        <!-- Cartera Total -->
        <div style="margin-bottom: 30px;">
          ${renderCarteraCard(data.total, '#075183')}
        </div>

        <!-- Auco y Whatsapp -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px;">
          ${renderCarteraCard(data.auco, '#6c5ce7')}
          ${renderCarteraCard(data.whatsapp, '#00b894')}
        </div>

        <p style="margin-top: 15px; color: #666; font-size: 0.85em;">
          * Auco: acuerdos firmados en plataforma. Whatsapp: acuerdos por canal informal.
        </p>
      </div>
    `;

    container.innerHTML = html;
  }

  // Cargar datos de cartera
  async function loadCartera() {
    if (!carteraBtn) return;

    carteraBtn.disabled = true;
    carteraBtn.textContent = '⏳ Cargando...';
    container.innerHTML = '<p style="color: #666;">Consultando cartera...</p>';

    try {
      const response = await fetch('/api/getCarteraResumen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ args: [] })
      });

      const result = await response.json();

      if (!response.ok || result.error || !result.result?.success) {
        throw new Error(result.error || result.result?.error || 'Error al cargar cartera');
      }

      console.log('[Finanzas] Cartera recibida:', result.result);
      renderCartera(result.result);

    } catch (error) {
      console.error('[Finanzas] Error cargando cartera:', error);
      container.innerHTML = `<p style="color: #dc3545;">❌ Error: ${error.message}</p>`;
    } finally {
      carteraBtn.disabled = false;
      carteraBtn.textContent = '💰 Cartera';
    }
  }

  // Event listener cartera
  if (carteraBtn) {
    carteraBtn.addEventListener('click', loadCartera);
  }

})();
