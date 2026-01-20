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
      const response = await window.fr360Api.call('obtenerResumenCobrancio');

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

  // === Procesar candidatos con confirmaciones ===
  async function procesarCandidatos(candidatos, tipoAviso, nombreTipo) {
    if (!candidatos || candidatos.length === 0) {
      alert(`No hay candidatos para ${nombreTipo}.`);
      return { exitosos: [], omitidos: [], fallidos: [] };
    }

    const confirmar = confirm(
      `Se encontraron ${candidatos.length} candidatos para ${nombreTipo}.\n\n` +
      `Se procesara cada uno con confirmacion individual.\n\n` +
      `Continuar?`
    );

    if (!confirmar) {
      return { exitosos: [], omitidos: [], fallidos: [] };
    }

    const resultados = { exitosos: [], omitidos: [], fallidos: [] };

    for (let i = 0; i < candidatos.length; i++) {
      const c = candidatos[i];

      const mensaje = `[${i + 1}/${candidatos.length}] ${nombreTipo.toUpperCase()}\n\n` +
                      `Cedula: ${c.cedula}\n` +
                      `Nombre: ${c.nombreCompleto}\n` +
                      `Telefono: ${c.telefono || 'N/A'}\n` +
                      (c.diasMora ? `Dias mora: ${c.diasMora}\n` : '') +
                      `Fecha limite: ${c.fechaFormateada || c.fechaLimite}\n` +
                      `Link pago: ${c.linkPago}\n\n` +
                      `SI = Enviar notificacion WhatsApp + registrar\n` +
                      `NO = Solo registrar en Strapi (ya fue cobrado)\n` +
                      `CANCELAR = Omitir este candidato`;

      // Simular msgBox con 3 opciones usando prompts
      const respuesta = prompt(mensaje + '\n\nEscribe: SI, NO o CANCELAR');

      if (!respuesta || respuesta.toUpperCase() === 'CANCELAR') {
        resultados.omitidos.push(`${c.cedula} - ${c.nombreCompleto}`);
        continue;
      }

      const soloSincronizar = respuesta.toUpperCase() === 'NO';

      showStatus(`Procesando ${i + 1}/${candidatos.length}: ${c.cedula}...`);

      try {
        const result = await window.fr360Api.call('procesarNotificacionCobrancio', c, tipoAviso, soloSincronizar);

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
      const ley = await window.fr360Api.call('verificarLeyDejenDeFregar');
      if (ley.activa) {
        alert('No se puede ejecutar: ' + ley.razon);
        return;
      }

      showStatus('Obteniendo candidatos MORA (3-5 dias)...');
      const data = await window.fr360Api.call('obtenerCandidatosMora');

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
      const data = await window.fr360Api.call('obtenerCandidatosFecha');

      if (data.error) {
        alert('Error: ' + data.error);
        return;
      }

      const candidatos = data.candidatos;
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
      const ley = await window.fr360Api.call('verificarLeyDejenDeFregar');
      if (ley.activa) {
        alert('No se puede ejecutar: ' + ley.razon);
        return;
      }

      showStatus('Obteniendo candidatos PREVIO (7 dias)...');
      const data = await window.fr360Api.call('obtenerCandidatosPrevio');

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
        const ley = await window.fr360Api.call('verificarLeyDejenDeFregar');
        console.log('Ley dejen de fregar:', ley);
        if (ley.activa) {
          console.log('MORA no ejecutado: ' + ley.razon);
          resultadosGlobales.mora = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: ley.razon };
        } else {
          const dataMora = await window.fr360Api.call('obtenerCandidatosMora');
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
        const dataFecha = await window.fr360Api.call('obtenerCandidatosFecha');
        console.log('Candidatos FECHA:', dataFecha);
        if (dataFecha.error) {
          resultadosGlobales.fecha = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: dataFecha.error };
        } else {
          const candidatos = dataFecha.candidatos;
          resultadosGlobales.fecha = { exitosos: [], omitidos: [], fallidos: [] };

          if (candidatos.pasadoManana?.length > 0 && candidatos.cobroPasadoMananaHoy) {
            const res = await procesarCandidatos(candidatos.pasadoManana, 'fecha', 'FECHA - Pasado manana');
            resultadosGlobales.fecha.exitosos.push(...res.exitosos);
            resultadosGlobales.fecha.omitidos.push(...res.omitidos);
            resultadosGlobales.fecha.fallidos.push(...res.fallidos);
          }

          if (candidatos.manana?.length > 0 && candidatos.cobroMananaHoy) {
            const res = await procesarCandidatos(candidatos.manana, 'fecha', 'FECHA - Manana');
            resultadosGlobales.fecha.exitosos.push(...res.exitosos);
            resultadosGlobales.fecha.omitidos.push(...res.omitidos);
            resultadosGlobales.fecha.fallidos.push(...res.fallidos);
          }

          if (candidatos.hoy?.length > 0) {
            const res = await procesarCandidatos(candidatos.hoy, 'fecha', 'FECHA - Hoy');
            resultadosGlobales.fecha.exitosos.push(...res.exitosos);
            resultadosGlobales.fecha.omitidos.push(...res.omitidos);
            resultadosGlobales.fecha.fallidos.push(...res.fallidos);
          }
        }
      } catch (err) {
        console.error('Error en FECHA:', err);
        resultadosGlobales.fecha = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: err.message };
      }

      // 3. PREVIO
      showStatus('Ejecutando PREVIO...');
      try {
        const ley = await window.fr360Api.call('verificarLeyDejenDeFregar');
        if (ley.activa) {
          console.log('PREVIO no ejecutado: ' + ley.razon);
          resultadosGlobales.previo = { exitosos: [], omitidos: [], fallidos: [], noEjecutado: ley.razon };
        } else {
          const dataPrevio = await window.fr360Api.call('obtenerCandidatosPrevio');
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
