/**
 * Cobrancio Web - Frontend Module
 * Maneja las notificaciones de cobranza (mora, fecha, previo)
 */
(function() {
  'use strict';

  // === DOM Elements ===
  const cobrancioFullBtn = document.getElementById('cobrancioFullBtn');
  const cobrancioResumenBtn = document.getElementById('cobrancioResumenBtn');
  const cobrancioMoraBtn = document.getElementById('cobrancioMoraBtn');
  const cobrancioFechaBtn = document.getElementById('cobrancioFechaBtn');
  const cobrancioPrevioBtn = document.getElementById('cobrancioPrevioBtn');
  const cobrancioStatus = document.getElementById('cobrancioStatus');
  const cobrancioStatusText = document.getElementById('cobrancioStatusText');
  const cobrancioResumenContainer = document.getElementById('cobrancioResumenContainer');
  const cobrancioMoraCount = document.getElementById('cobrancioMoraCount');
  const cobrancioFechaCount = document.getElementById('cobrancioFechaCount');
  const cobrancioFechaDetail = document.getElementById('cobrancioFechaDetail');
  const cobrancioPrevioCount = document.getElementById('cobrancioPrevioCount');
  const cobrancioPrevioDetail = document.getElementById('cobrancioPrevioDetail');
  const cobrancioResultsContainer = document.getElementById('cobrancioResultsContainer');

  // Si no existen los elementos, salir (no estamos en la pestaña correcta)
  if (!cobrancioFullBtn) return;

  // === API Helper ===
  async function apiCall(endpoint, ...args) {
    const response = await fetch(`/api/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ args })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    // El backend envuelve la respuesta en { success, result }
    if (data.success === false) {
      throw new Error(data.error || 'Error desconocido');
    }

    return data.result !== undefined ? data.result : data;
  }

  // === Utilidades ===
  function showStatus(message) {
    cobrancioStatus.style.display = 'block';
    cobrancioStatusText.textContent = message;
  }

  function hideStatus() {
    cobrancioStatus.style.display = 'none';
  }

  function setButtonsEnabled(enabled) {
    const buttons = [cobrancioFullBtn, cobrancioResumenBtn, cobrancioMoraBtn, cobrancioFechaBtn, cobrancioPrevioBtn];
    buttons.forEach(btn => {
      btn.disabled = !enabled;
      btn.style.opacity = enabled ? '1' : '0.6';
    });
  }

  // === Ver Resumen ===
  async function verResumen() {
    showStatus('Obteniendo resumen de candidatos...');
    setButtonsEnabled(false);

    try {
      const response = await apiCall('obtenerResumenCobrancio');

      if (response.error) {
        alert('Error: ' + response.error);
        return;
      }

      // Actualizar contadores
      cobrancioMoraCount.textContent = response.mora?.candidatos || 0;

      const fechaHoy = response.fecha?.hoy || 0;
      const fechaManana = response.fecha?.manana || 0;
      const fechaPasado = response.fecha?.pasadoManana || 0;
      const totalFecha = fechaHoy + fechaManana + fechaPasado;
      cobrancioFechaCount.textContent = totalFecha;

      let fechaDetailText = `hoy: ${fechaHoy}`;
      if (response.fecha?.cobroMananaHoy) {
        fechaDetailText += `, manana: ${fechaManana}`;
      }
      if (response.fecha?.cobroPasadoMananaHoy) {
        fechaDetailText += `, pasado: ${fechaPasado}`;
      }
      cobrancioFechaDetail.textContent = fechaDetailText;

      cobrancioPrevioCount.textContent = response.previo?.candidatos || 0;
      if (response.previo?.fechaObjetivo) {
        cobrancioPrevioDetail.textContent = `vence: ${response.previo.fechaObjetivo}`;
      }

      cobrancioResumenContainer.style.display = 'block';

      // Mostrar advertencias si hay
      if (response.mora?.error) {
        alert('MORA: ' + response.mora.error);
      }
      if (response.fecha?.error) {
        alert('FECHA: ' + response.fecha.error);
      }
      if (response.previo?.error) {
        alert('PREVIO: ' + response.previo.error);
      }

    } catch (err) {
      console.error('Error obteniendo resumen:', err);
      alert('Error al obtener resumen: ' + err.message);
    } finally {
      hideStatus();
      setButtonsEnabled(true);
    }
  }

  // === Modal de confirmación con botones ===
  function crearModal() {
    // Si ya existe, no crear otro
    if (document.getElementById('cobrancioModal')) return;

    const modalHtml = `
      <div id="cobrancioModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center;">
        <div style="background:white; border-radius:12px; max-width:500px; width:90%; max-height:90vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
          <div id="cobrancioModalHeader" style="background:linear-gradient(135deg,#6f42c1,#5a32a3); color:white; padding:16px 20px; border-radius:12px 12px 0 0;">
            <h3 style="margin:0; font-size:1.1em;" id="cobrancioModalTitle">Confirmación</h3>
          </div>
          <div id="cobrancioModalBody" style="padding:20px;">
            <!-- Contenido dinámico -->
          </div>
          <div id="cobrancioModalFooter" style="padding:16px 20px; border-top:1px solid #eee; display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
            <!-- Botones dinámicos -->
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
  }

  function mostrarModalConfirmacion(candidato, index, total, nombreTipo) {
    return new Promise((resolve) => {
      crearModal();
      const modal = document.getElementById('cobrancioModal');
      const title = document.getElementById('cobrancioModalTitle');
      const body = document.getElementById('cobrancioModalBody');
      const footer = document.getElementById('cobrancioModalFooter');

      title.textContent = `[${index + 1}/${total}] ${nombreTipo.toUpperCase()}`;

      body.innerHTML = `
        <div style="margin-bottom:16px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <span style="font-weight:600; color:#333;">Cédula:</span>
            <code style="background:#f0f0f0; padding:4px 10px; border-radius:4px; font-size:1.1em; font-weight:600;">${candidato.cedula}</code>
            <button id="copiarCedulaBtn" style="background:#6f42c1; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85em; display:flex; align-items:center; gap:4px;" title="Copiar cédula">
              📋 Copiar
            </button>
          </div>
          <p style="margin:8px 0;"><strong>Nombre:</strong> ${candidato.nombreCompleto}</p>
          <p style="margin:8px 0;"><strong>Teléfono:</strong> ${candidato.telefono || 'N/A'}</p>
          ${candidato.diasMora ? `<p style="margin:8px 0;"><strong>Días mora:</strong> <span style="color:#dc3545; font-weight:600;">${candidato.diasMora}</span></p>` : ''}
          <p style="margin:8px 0;"><strong>Fecha límite:</strong> ${candidato.fechaFormateada || candidato.fechaLimite}</p>
          <p style="margin:8px 0; word-break:break-all;"><strong>Link pago:</strong> <a href="${candidato.linkPago}" target="_blank" style="color:#6f42c1;">${candidato.linkPago}</a></p>
        </div>
        <div style="background:#f8f9fa; padding:12px; border-radius:8px; font-size:0.9em; color:#666;">
          <p style="margin:4px 0;"><strong style="color:#28a745;">SI</strong> = Enviar WhatsApp + registrar en Strapi</p>
          <p style="margin:4px 0;"><strong style="color:#ffc107;">NO</strong> = Solo registrar (ya fue cobrado)</p>
          <p style="margin:4px 0;"><strong style="color:#dc3545;">OMITIR</strong> = Saltar este candidato</p>
          <p style="margin:4px 0;"><strong style="color:#6c757d;">CANCELAR</strong> = Detener todo el proceso</p>
        </div>
      `;

      footer.innerHTML = `
        <button id="modalBtnSi" style="background:linear-gradient(135deg,#28a745,#218838); color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:600; font-size:1em;">
          ✅ SÍ, Cobrar
        </button>
        <button id="modalBtnNo" style="background:linear-gradient(135deg,#ffc107,#e0a800); color:#333; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:600; font-size:1em;">
          📝 NO, Solo registrar
        </button>
        <button id="modalBtnOmitir" style="background:linear-gradient(135deg,#6c757d,#5a6268); color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:600; font-size:1em;">
          ⏭️ Omitir
        </button>
        <button id="modalBtnCancelar" style="background:linear-gradient(135deg,#dc3545,#c82333); color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-weight:600; font-size:1em;">
          🛑 Cancelar Todo
        </button>
      `;

      modal.style.display = 'flex';

      // Event: Copiar cédula
      document.getElementById('copiarCedulaBtn').onclick = async () => {
        try {
          await navigator.clipboard.writeText(candidato.cedula);
          const btn = document.getElementById('copiarCedulaBtn');
          btn.innerHTML = '✅ Copiado!';
          btn.style.background = '#28a745';
          setTimeout(() => {
            btn.innerHTML = '📋 Copiar';
            btn.style.background = '#6f42c1';
          }, 1500);
        } catch (e) {
          alert('Error al copiar: ' + e.message);
        }
      };

      // Event: Botones de acción
      document.getElementById('modalBtnSi').onclick = () => {
        modal.style.display = 'none';
        resolve('SI');
      };
      document.getElementById('modalBtnNo').onclick = () => {
        modal.style.display = 'none';
        resolve('NO');
      };
      document.getElementById('modalBtnOmitir').onclick = () => {
        modal.style.display = 'none';
        resolve('OMITIR');
      };
      document.getElementById('modalBtnCancelar').onclick = () => {
        modal.style.display = 'none';
        resolve('CANCELAR');
      };
    });
  }

  // === Procesar candidatos con confirmaciones ===
  async function procesarCandidatos(candidatos, tipoAviso, nombreTipo) {
    if (!candidatos || candidatos.length === 0) {
      alert(`No hay candidatos para ${nombreTipo}.`);
      return { exitosos: [], omitidos: [], fallidos: [] };
    }

    const confirmar = confirm(
      `Se encontraron ${candidatos.length} candidatos para ${nombreTipo}.\n\n` +
      `Se procesará cada uno con confirmación individual.\n\n` +
      `¿Continuar?`
    );

    if (!confirmar) {
      return { exitosos: [], omitidos: [], fallidos: [] };
    }

    const resultados = { exitosos: [], omitidos: [], fallidos: [] };

    for (let i = 0; i < candidatos.length; i++) {
      const c = candidatos[i];

      const respuesta = await mostrarModalConfirmacion(c, i, candidatos.length, nombreTipo);

      if (respuesta === 'CANCELAR') {
        // Cancelar todo el proceso de este tipo
        console.log(`Proceso ${nombreTipo} cancelado por el usuario`);
        break;
      }

      if (respuesta === 'OMITIR') {
        resultados.omitidos.push(`${c.cedula} - ${c.nombreCompleto}`);
        continue;
      }

      const soloSincronizar = respuesta === 'NO';

      showStatus(`Procesando ${i + 1}/${candidatos.length}: ${c.cedula}...`);

      try {
        const result = await apiCall('procesarNotificacionCobrancio', c, tipoAviso, soloSincronizar);

        if (result.exito) {
          const suffix = soloSincronizar ? ' (sincronizado)' : '';
          resultados.exitosos.push(`${c.cedula} - ${c.nombreCompleto}${suffix}`);
        } else {
          resultados.fallidos.push(`${c.cedula} - ${result.error || 'Error desconocido'}`);
        }
      } catch (err) {
        resultados.fallidos.push(`${c.cedula} - ${err.message}`);
      }
    }

    return resultados;
  }

  // === Mostrar resultados ===
  function mostrarResultados(resultados, nombreTipo) {
    let html = `<div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-top: 16px;">`;
    html += `<h4 style="margin: 0 0 12px 0;">Resultados ${nombreTipo}</h4>`;
    html += `<p><strong>Exitosos:</strong> ${resultados.exitosos.length}</p>`;
    html += `<p><strong>Omitidos:</strong> ${resultados.omitidos.length}</p>`;
    html += `<p><strong>Fallidos:</strong> ${resultados.fallidos.length}</p>`;

    if (resultados.exitosos.length > 0) {
      html += `<details style="margin-top: 8px;"><summary style="cursor: pointer; color: #28a745;">Ver exitosos</summary>`;
      html += `<ul style="margin: 8px 0; padding-left: 20px;">`;
      resultados.exitosos.forEach(e => html += `<li>${e}</li>`);
      html += `</ul></details>`;
    }

    if (resultados.fallidos.length > 0) {
      html += `<details style="margin-top: 8px;"><summary style="cursor: pointer; color: #dc3545;">Ver fallidos</summary>`;
      html += `<ul style="margin: 8px 0; padding-left: 20px;">`;
      resultados.fallidos.forEach(f => html += `<li>${f}</li>`);
      html += `</ul></details>`;
    }

    html += `</div>`;
    cobrancioResultsContainer.innerHTML += html;
  }

  // === MORA ===
  async function ejecutarMora() {
    showStatus('Verificando ley dejen de fregar...');
    setButtonsEnabled(false);
    cobrancioResultsContainer.innerHTML = '';

    try {
      const ley = await apiCall('verificarLeyDejenDeFregar');
      if (ley.activa) {
        alert('No se puede ejecutar: ' + ley.razon);
        return;
      }

      showStatus('Obteniendo candidatos MORA (3-5 dias)...');
      const data = await apiCall('obtenerCandidatosMora');

      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }

      const resultados = await procesarCandidatos(data.candidatos, 'mora', 'MORA');
      mostrarResultados(resultados, 'MORA');

    } catch (err) {
      console.error('Error en MORA:', err);
      alert('Error: ' + err.message);
    } finally {
      hideStatus();
      setButtonsEnabled(true);
    }
  }

  // === FECHA ===
  async function ejecutarFecha() {
    showStatus('Verificando festivos...');
    setButtonsEnabled(false);
    cobrancioResultsContainer.innerHTML = '';

    try {
      showStatus('Obteniendo candidatos FECHA...');
      const data = await apiCall('obtenerCandidatosFecha');
      console.log('Candidatos FECHA:', data);

      if (data.error && (!data.candidatos || Object.keys(data.candidatos).length === 0)) {
        alert('Error: ' + data.error);
        return;
      }

      const candidatos = data.candidatos || { hoy: [], manana: [], pasadoManana: [] };
      const resultadosGlobales = { exitosos: [], omitidos: [], fallidos: [] };

      // Procesar pasado manana (si aplica)
      if (candidatos.pasadoManana && candidatos.pasadoManana.length > 0 && candidatos.cobroPasadoMananaHoy) {
        const res = await procesarCandidatos(candidatos.pasadoManana, 'fecha', 'FECHA - Pasado manana');
        resultadosGlobales.exitosos.push(...res.exitosos);
        resultadosGlobales.omitidos.push(...res.omitidos);
        resultadosGlobales.fallidos.push(...res.fallidos);
      }

      // Procesar manana (si aplica)
      if (candidatos.manana && candidatos.manana.length > 0 && candidatos.cobroMananaHoy) {
        const res = await procesarCandidatos(candidatos.manana, 'fecha', 'FECHA - Manana');
        resultadosGlobales.exitosos.push(...res.exitosos);
        resultadosGlobales.omitidos.push(...res.omitidos);
        resultadosGlobales.fallidos.push(...res.fallidos);
      }

      // Procesar hoy
      if (candidatos.hoy && candidatos.hoy.length > 0) {
        const res = await procesarCandidatos(candidatos.hoy, 'fecha', 'FECHA - Hoy');
        resultadosGlobales.exitosos.push(...res.exitosos);
        resultadosGlobales.omitidos.push(...res.omitidos);
        resultadosGlobales.fallidos.push(...res.fallidos);
      }

      mostrarResultados(resultadosGlobales, 'FECHA');

    } catch (err) {
      console.error('Error en FECHA:', err);
      alert('Error: ' + err.message);
    } finally {
      hideStatus();
      setButtonsEnabled(true);
    }
  }

  // === PREVIO ===
  async function ejecutarPrevio() {
    showStatus('Verificando ley dejen de fregar...');
    setButtonsEnabled(false);
    cobrancioResultsContainer.innerHTML = '';

    try {
      const ley = await apiCall('verificarLeyDejenDeFregar');
      if (ley.activa) {
        alert('No se puede ejecutar: ' + ley.razon);
        return;
      }

      showStatus('Obteniendo candidatos PREVIO (7 dias)...');
      const data = await apiCall('obtenerCandidatosPrevio');

      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }

      const resultados = await procesarCandidatos(data.candidatos, 'previo', 'PREVIO');
      mostrarResultados(resultados, 'PREVIO');

    } catch (err) {
      console.error('Error en PREVIO:', err);
      alert('Error: ' + err.message);
    } finally {
      hideStatus();
      setButtonsEnabled(true);
    }
  }

  // === FULL ===
  async function ejecutarFull() {
    const confirmar = confirm(
      'COBRANCIO WEB - FULL\n\n' +
      'Se ejecutaran las siguientes cobranzas en orden:\n\n' +
      '1. MORA (usuarios con 3-5 dias de mora)\n' +
      '2. FECHA (hoy, manana, pasado manana segun festivos)\n' +
      '3. PREVIO (7 dias antes del vencimiento)\n\n' +
      'Cada cobro individual requerira su confirmacion.\n\n' +
      'Desea continuar?'
    );

    if (!confirmar) return;

    setButtonsEnabled(false);
    cobrancioResultsContainer.innerHTML = '';

    const resultadosGlobales = {
      mora: null,
      fecha: null,
      previo: null
    };

    const startTime = Date.now();

    try {
      // 1. MORA
      showStatus('Ejecutando MORA...');
      try {
        const ley = await apiCall('verificarLeyDejenDeFregar');
        console.log('Ley dejen de fregar:', ley);
        if (ley.activa) {
          console.log('MORA no ejecutado: ' + ley.razon);
          resultadosGlobales.mora = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: ley.razon };
        } else {
          const dataMora = await apiCall('obtenerCandidatosMora');
          console.log('Candidatos MORA:', dataMora);
          if (dataMora.error) {
            resultadosGlobales.mora = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: dataMora.error };
          } else {
            resultadosGlobales.mora = await procesarCandidatos(dataMora.candidatos, 'mora', 'MORA');
          }
        }
      } catch (err) {
        console.error('Error en MORA:', err);
        resultadosGlobales.mora = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: err.message };
      }

      // 2. FECHA
      showStatus('Ejecutando FECHA...');
      try {
        const dataFecha = await apiCall('obtenerCandidatosFecha');
        console.log('Candidatos FECHA raw:', JSON.stringify(dataFecha));

        if (dataFecha.error && (!dataFecha.candidatos || Object.keys(dataFecha.candidatos).length === 0)) {
          resultadosGlobales.fecha = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: dataFecha.error };
        } else {
          const candidatos = dataFecha.candidatos || { hoy: [], manana: [], pasadoManana: [] };
          console.log('Candidatos FECHA parsed:', JSON.stringify(candidatos));
          console.log('Candidatos hoy:', candidatos.hoy?.length || 0);
          console.log('Candidatos manana:', candidatos.manana?.length || 0);
          console.log('Candidatos pasadoManana:', candidatos.pasadoManana?.length || 0);

          resultadosGlobales.fecha = { exitosos: [], omitidos: [], fallidos: [] };

          if (candidatos.pasadoManana?.length > 0 && candidatos.cobroPasadoMananaHoy) {
            console.log('Procesando pasado manana...');
            const res = await procesarCandidatos(candidatos.pasadoManana, 'fecha', 'FECHA - Pasado manana');
            resultadosGlobales.fecha.exitosos.push(...res.exitosos);
            resultadosGlobales.fecha.omitidos.push(...res.omitidos);
            resultadosGlobales.fecha.fallidos.push(...res.fallidos);
          }

          if (candidatos.manana?.length > 0 && candidatos.cobroMananaHoy) {
            console.log('Procesando manana...');
            const res = await procesarCandidatos(candidatos.manana, 'fecha', 'FECHA - Manana');
            resultadosGlobales.fecha.exitosos.push(...res.exitosos);
            resultadosGlobales.fecha.omitidos.push(...res.omitidos);
            resultadosGlobales.fecha.fallidos.push(...res.fallidos);
          }

          if (candidatos.hoy?.length > 0) {
            console.log('Procesando hoy con', candidatos.hoy.length, 'candidatos...');
            const res = await procesarCandidatos(candidatos.hoy, 'fecha', 'FECHA - Hoy');
            console.log('Resultado procesarCandidatos hoy:', res);
            resultadosGlobales.fecha.exitosos.push(...res.exitosos);
            resultadosGlobales.fecha.omitidos.push(...res.omitidos);
            resultadosGlobales.fecha.fallidos.push(...res.fallidos);
          } else {
            console.log('No hay candidatos para hoy o array vacio');
          }

          // Si hubo error pero hay candidatos vacíos, mostrar el error
          if (dataFecha.error) {
            resultadosGlobales.fecha.noEjecutado = dataFecha.error;
          }
        }
      } catch (err) {
        console.error('Error en FECHA:', err);
        resultadosGlobales.fecha = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: err.message };
      }

      // 3. PREVIO
      showStatus('Ejecutando PREVIO...');
      try {
        const ley = await apiCall('verificarLeyDejenDeFregar');
        if (ley.activa) {
          console.log('PREVIO no ejecutado: ' + ley.razon);
          resultadosGlobales.previo = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: ley.razon };
        } else {
          const dataPrevio = await apiCall('obtenerCandidatosPrevio');
          console.log('Candidatos PREVIO:', dataPrevio);
          if (dataPrevio.error) {
            resultadosGlobales.previo = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: dataPrevio.error };
          } else {
            resultadosGlobales.previo = await procesarCandidatos(dataPrevio.candidatos, 'previo', 'PREVIO');
          }
        }
      } catch (err) {
        console.error('Error en PREVIO:', err);
        resultadosGlobales.previo = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: err.message };
      }

      // Mostrar resumen final
      const tiempoTotal = Math.floor((Date.now() - startTime) / 1000);

      let resumenHtml = `<div style="background: #e8f4f8; padding: 20px; border-radius: 8px; margin-top: 16px; border-left: 4px solid #17a2b8;">`;
      resumenHtml += `<h3 style="margin: 0 0 16px 0;">RESUMEN COBRANCIO WEB FULL</h3>`;

      resumenHtml += `<p><strong>MORA (3-5 dias):</strong> `;
      if (resultadosGlobales.mora) {
        if (resultadosGlobales.mora.noEjecutado) {
          resumenHtml += `<span style="color: #856404;">No ejecutado: ${resultadosGlobales.mora.noEjecutado}</span>`;
        } else {
          resumenHtml += `${resultadosGlobales.mora.exitosos.length} exitosos, ${resultadosGlobales.mora.omitidos.length} omitidos`;
        }
      } else {
        resumenHtml += `<span style="color: #999;">No ejecutado</span>`;
      }
      resumenHtml += `</p>`;

      resumenHtml += `<p><strong>FECHA (hoy/manana):</strong> `;
      if (resultadosGlobales.fecha) {
        if (resultadosGlobales.fecha.noEjecutado) {
          resumenHtml += `<span style="color: #856404;">No ejecutado: ${resultadosGlobales.fecha.noEjecutado}</span>`;
        } else {
          resumenHtml += `${resultadosGlobales.fecha.exitosos.length} exitosos, ${resultadosGlobales.fecha.omitidos.length} omitidos`;
        }
      } else {
        resumenHtml += `<span style="color: #999;">No ejecutado</span>`;
      }
      resumenHtml += `</p>`;

      resumenHtml += `<p><strong>PREVIO (7 dias):</strong> `;
      if (resultadosGlobales.previo) {
        if (resultadosGlobales.previo.noEjecutado) {
          resumenHtml += `<span style="color: #856404;">No ejecutado: ${resultadosGlobales.previo.noEjecutado}</span>`;
        } else {
          resumenHtml += `${resultadosGlobales.previo.exitosos.length} exitosos, ${resultadosGlobales.previo.omitidos.length} omitidos`;
        }
      } else {
        resumenHtml += `<span style="color: #999;">No ejecutado</span>`;
      }
      resumenHtml += `</p>`;

      resumenHtml += `<p style="margin-top: 12px; color: #666;">Tiempo total: ${tiempoTotal} segundos</p>`;
      resumenHtml += `</div>`;

      cobrancioResultsContainer.innerHTML = resumenHtml;

    } finally {
      hideStatus();
      setButtonsEnabled(true);
    }
  }

  // === Event Listeners ===
  cobrancioFullBtn.addEventListener('click', ejecutarFull);
  cobrancioResumenBtn.addEventListener('click', verResumen);
  cobrancioMoraBtn.addEventListener('click', ejecutarMora);
  cobrancioFechaBtn.addEventListener('click', ejecutarFecha);
  cobrancioPrevioBtn.addEventListener('click', ejecutarPrevio);

})();
