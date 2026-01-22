/**
 * Reportar Venta en Cuenta Corriente
 * Permite reportar ventas manuales que llegaron a cuenta corriente
 */
(function() {
  'use strict';

  // Supabase bucket para comprobantes
  const SUPABASE_BUCKET = 'comprobantes-cc';

  // Google Chat webhook
  const CHAT_WEBHOOK = 'https://chat.googleapis.com/v1/spaces/AAQASNoOCz8/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=6YyUEJj1SgRy0MgPYsu3LAyOdev5RP0QVxv8kISPbXc';

  let modalCreated = false;
  let productosCache = null;
  let cuotasPendientesCache = [];
  let comprobanteFile = null;
  let datosEstudianteActual = null; // Para guardar cédula y otros datos

  /**
   * Crea el modal de reportar venta
   */
  function crearModal() {
    if (document.getElementById('reportarVentaCCModal')) return;

    const modalHtml = `
      <div id="reportarVentaCCModal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.6); z-index:10000; justify-content:center; align-items:center; overflow-y:auto; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
        <div style="background:white; border-radius:12px; max-width:600px; width:95%; margin:20px auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
          <div style="background:linear-gradient(135deg,#ff9800,#f57c00); color:white; padding:16px 20px; border-radius:12px 12px 0 0; display:flex; justify-content:space-between; align-items:center;">
            <h3 style="margin:0; font-size:1.2em; font-family:inherit;">💴 Reportar Venta en Cuenta Corriente</h3>
            <button id="cerrarModalVentaCC" style="background:transparent; border:none; color:white; font-size:1.5em; cursor:pointer; font-family:inherit;">&times;</button>
          </div>
          <div style="padding:20px;">
            <!-- Datos del estudiante (prediligenciados) -->
            <div style="background:#f8f9fa; padding:16px; border-radius:8px; margin-bottom:16px;">
              <h4 style="margin:0 0 12px 0; color:#333; font-family:inherit; font-weight:600;">Datos del Estudiante</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                <div>
                  <label style="font-size:0.85em; color:#666; font-family:inherit; display:block; margin-bottom:4px;">Nombres</label>
                  <input type="text" id="ventaCCNombres" readonly style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; background:#e9ecef; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:0.85em; color:#666; font-family:inherit; display:block; margin-bottom:4px;">Apellidos</label>
                  <input type="text" id="ventaCCApellidos" readonly style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; background:#e9ecef; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:0.85em; color:#666; font-family:inherit; display:block; margin-bottom:4px;">Celular</label>
                  <input type="text" id="ventaCCCelular" readonly style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; background:#e9ecef; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:0.85em; color:#666; font-family:inherit; display:block; margin-bottom:4px;">Correo</label>
                  <input type="text" id="ventaCCCorreo" readonly style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; background:#e9ecef; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
                </div>
              </div>
            </div>

            <!-- Datos de la venta -->
            <div style="margin-bottom:16px;">
              <h4 style="margin:0 0 12px 0; color:#333; font-family:inherit; font-weight:600;">Datos de la Venta</h4>

              <!-- Nro de acuerdo -->
              <div style="margin-bottom:12px;">
                <label style="font-size:0.85em; color:#666; display:block; margin-bottom:4px; font-family:inherit;">Nro de Acuerdo</label>
                <div style="display:flex; gap:8px;">
                  <input type="text" id="ventaCCNroAcuerdo" placeholder="Ej: 123456 o 'contado'" style="flex:1; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:0.95em; font-family:inherit; box-sizing:border-box;">
                  <button id="buscarAcuerdoVentaCC" style="background:#6f42c1; color:white; border:none; padding:10px 16px; border-radius:4px; cursor:pointer; font-family:inherit; font-size:0.95em;">🔍 Buscar</button>
                </div>
                <small style="color:#888; font-size:0.8em; font-family:inherit;">Ingrese el número de acuerdo o escriba "contado" para venta de contado</small>
              </div>

              <!-- Producto -->
              <div style="margin-bottom:12px;">
                <label style="font-size:0.85em; color:#666; display:block; margin-bottom:4px; font-family:inherit;">Producto</label>
                <select id="ventaCCProducto" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:0.95em; font-family:inherit; box-sizing:border-box;" disabled>
                  <option value="">-- Primero busque un acuerdo o ingrese "contado" --</option>
                </select>
              </div>

              <!-- Valor -->
              <div style="margin-bottom:12px;">
                <label style="font-size:0.85em; color:#666; display:block; margin-bottom:4px; font-family:inherit;">Valor ($)</label>
                <input type="text" id="ventaCCValor" placeholder="Ej: 150000" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:0.95em; font-family:inherit; box-sizing:border-box;">
              </div>

              <!-- Dirección y Ciudad (solo para contado o cuota 1) -->
              <div id="camposDireccion" style="display:none; margin-bottom:12px; background:#fff8e1; padding:12px; border-radius:8px; border:1px solid #ffe082;">
                <p style="margin:0 0 12px 0; font-size:0.85em; color:#f57c00; font-family:inherit;">📍 Datos de envío (requeridos para ventas nuevas)</p>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                  <div>
                    <label style="font-size:0.85em; color:#666; display:block; margin-bottom:4px; font-family:inherit;">Dirección</label>
                    <input type="text" id="ventaCCDireccion" placeholder="Ej: Calle 123 #45-67" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:0.95em; font-family:inherit; box-sizing:border-box;">
                  </div>
                  <div>
                    <label style="font-size:0.85em; color:#666; display:block; margin-bottom:4px; font-family:inherit;">Ciudad</label>
                    <input type="text" id="ventaCCCiudad" placeholder="Ej: Bogotá" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:0.95em; font-family:inherit; box-sizing:border-box;">
                  </div>
                </div>
              </div>

              <!-- Comprobante -->
              <div style="margin-bottom:12px;">
                <label style="font-size:0.85em; color:#666; display:block; margin-bottom:4px; font-family:inherit;">Comprobante de Pago</label>
                <div id="comprobanteDropZone" style="border:2px dashed #ddd; border-radius:8px; padding:20px; text-align:center; cursor:pointer; transition:all 0.2s;">
                  <div id="comprobantePreview" style="display:none; margin-bottom:10px;">
                    <img id="comprobanteImg" style="max-width:200px; max-height:150px; border-radius:4px;">
                    <p id="comprobanteName" style="margin:8px 0 0 0; font-size:0.85em; color:#666; font-family:inherit;"></p>
                  </div>
                  <div id="comprobanteInstructions">
                    <p style="margin:0 0 8px 0; color:#666; font-family:inherit;">📎 Arrastra una imagen/PDF aquí</p>
                    <p style="margin:0; font-size:0.85em; color:#999; font-family:inherit;">o haz clic para seleccionar / Ctrl+V para pegar</p>
                  </div>
                  <input type="file" id="comprobanteInput" accept="image/*,.pdf" style="display:none;">
                </div>
                <button id="quitarComprobante" style="display:none; margin-top:8px; background:#dc3545; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:0.85em; font-family:inherit;">🗑️ Quitar comprobante</button>
              </div>
            </div>

            <!-- Botones de acción -->
            <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:20px; padding-top:16px; border-top:1px solid #eee;">
              <button id="cancelarVentaCC" style="background:#6c757d; color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-size:0.95em; font-family:inherit;">
                Cancelar
              </button>
              <button id="reportarVentaCCBtn" style="background:linear-gradient(135deg,#28a745,#218838); color:white; border:none; padding:12px 24px; border-radius:6px; cursor:pointer; font-size:0.95em; font-weight:600; font-family:inherit;" disabled>
                📤 Reportar Venta
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    setupEventListeners();
    modalCreated = true;
  }

  /**
   * Configura los event listeners del modal
   */
  function setupEventListeners() {
    const modal = document.getElementById('reportarVentaCCModal');
    const cerrarBtn = document.getElementById('cerrarModalVentaCC');
    const cancelarBtn = document.getElementById('cancelarVentaCC');
    const buscarBtn = document.getElementById('buscarAcuerdoVentaCC');
    const nroAcuerdoInput = document.getElementById('ventaCCNroAcuerdo');
    const valorInput = document.getElementById('ventaCCValor');
    const reportarBtn = document.getElementById('reportarVentaCCBtn');
    const dropZone = document.getElementById('comprobanteDropZone');
    const fileInput = document.getElementById('comprobanteInput');
    const quitarBtn = document.getElementById('quitarComprobante');

    // Cerrar modal
    cerrarBtn.addEventListener('click', cerrarModal);
    cancelarBtn.addEventListener('click', cerrarModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) cerrarModal();
    });

    // Buscar acuerdo
    buscarBtn.addEventListener('click', buscarAcuerdo);
    nroAcuerdoInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        detectarContadoOBuscar();
      }
    });

    // Detectar "contado" mientras escribe o al salir del campo
    nroAcuerdoInput.addEventListener('input', () => {
      detectarContadoAutomatico();
    });
    nroAcuerdoInput.addEventListener('blur', () => {
      detectarContadoOBuscar();
    });

    // Limpiar valor (solo números)
    valorInput.addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/[^\d]/g, '');
      validarFormulario();
    });

    // Cuando cambia el producto seleccionado, verificar si mostrar campos de dirección
    const productoSelect = document.getElementById('ventaCCProducto');
    productoSelect.addEventListener('change', () => {
      verificarCamposDireccion();
      validarFormulario();
    });

    // Comprobante - click para seleccionar
    dropZone.addEventListener('click', () => fileInput.click());

    // Comprobante - drag and drop
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#6f42c1';
      dropZone.style.background = '#f8f0ff';
    });
    dropZone.addEventListener('dragleave', () => {
      dropZone.style.borderColor = '#ddd';
      dropZone.style.background = 'transparent';
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.style.borderColor = '#ddd';
      dropZone.style.background = 'transparent';
      if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
      }
    });

    // Comprobante - selección de archivo
    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
      }
    });

    // Comprobante - pegar del portapapeles
    document.addEventListener('paste', (e) => {
      if (modal.style.display !== 'flex') return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) handleFile(file);
          break;
        }
      }
    });

    // Quitar comprobante
    quitarBtn.addEventListener('click', () => {
      comprobanteFile = null;
      document.getElementById('comprobantePreview').style.display = 'none';
      document.getElementById('comprobanteInstructions').style.display = 'block';
      quitarBtn.style.display = 'none';
      fileInput.value = '';
      validarFormulario();
    });

    // Reportar venta
    reportarBtn.addEventListener('click', reportarVenta);
  }

  /**
   * Maneja el archivo de comprobante
   */
  function handleFile(file) {
    if (!file) return;

    // Validar tipo
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert('Solo se permiten imágenes o PDFs');
      return;
    }

    // Validar tamaño (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo es demasiado grande. Máximo 10MB');
      return;
    }

    comprobanteFile = file;

    const preview = document.getElementById('comprobantePreview');
    const img = document.getElementById('comprobanteImg');
    const name = document.getElementById('comprobanteName');
    const instructions = document.getElementById('comprobanteInstructions');
    const quitarBtn = document.getElementById('quitarComprobante');

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target.result;
        img.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else {
      img.src = '';
      img.style.display = 'none';
    }

    name.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    preview.style.display = 'block';
    instructions.style.display = 'none';
    quitarBtn.style.display = 'inline-block';

    validarFormulario();
  }

  /**
   * Detecta si el usuario escribió "contado" y activa automáticamente los productos
   */
  function detectarContadoAutomatico() {
    const input = document.getElementById('ventaCCNroAcuerdo');
    const valor = input.value.trim().toLowerCase();

    // Si escribió exactamente "contado", activar automáticamente
    if (valor === 'contado') {
      detectarContadoOBuscar();
    }
  }

  /**
   * Si es "contado" carga productos, si no busca el acuerdo
   */
  async function detectarContadoOBuscar() {
    const input = document.getElementById('ventaCCNroAcuerdo');
    const select = document.getElementById('ventaCCProducto');
    const valor = input.value.trim();

    if (!valor) return;

    // Si es "contado" (case insensitive), cargar productos directamente
    if (valor.toLowerCase() === 'contado') {
      // Evitar recargar si ya está cargado
      if (select.disabled === false && select.options.length > 1) {
        const firstOption = select.options[1];
        if (firstOption && firstOption.value) {
          try {
            const data = JSON.parse(firstOption.value);
            if (data.tipo === 'contado') return; // Ya está cargado
          } catch (e) {}
        }
      }
      await cargarProductosContado(select);
    } else {
      // Es un número de acuerdo, llamar a buscarAcuerdo
      await buscarAcuerdo();
    }
  }

  /**
   * Busca el acuerdo y carga las cuotas pendientes
   */
  async function buscarAcuerdo() {
    const input = document.getElementById('ventaCCNroAcuerdo');
    const select = document.getElementById('ventaCCProducto');
    const buscarBtn = document.getElementById('buscarAcuerdoVentaCC');

    let valor = input.value.trim();

    // Normalizar: quitar puntos, espacios, caracteres especiales si son números
    if (/^\d/.test(valor)) {
      valor = valor.replace(/[^\d]/g, '');
      input.value = valor;
    }

    if (!valor) {
      alert('Por favor ingrese un número de acuerdo o "contado"');
      return;
    }

    buscarBtn.disabled = true;
    buscarBtn.innerHTML = '<span class="spinner"></span>';
    select.disabled = true;
    select.innerHTML = '<option value="">Buscando...</option>';

    try {
      // Si es "contado" (case insensitive)
      if (valor.toLowerCase() === 'contado') {
        await cargarProductosContado(select);
      } else {
        await cargarCuotasPendientes(valor, select);
      }
    } catch (error) {
      console.error('Error buscando acuerdo:', error);
      select.innerHTML = '<option value="">Error al buscar</option>';
      alert('Error al buscar el acuerdo: ' + error.message);
    } finally {
      buscarBtn.disabled = false;
      buscarBtn.innerHTML = '🔍 Buscar';
      validarFormulario();
    }
  }

  /**
   * Muestra los campos de dirección y ciudad
   */
  function mostrarCamposDireccion() {
    const container = document.getElementById('camposDireccion');
    if (container) {
      container.style.display = 'block';
    }
  }

  /**
   * Oculta los campos de dirección y ciudad
   */
  function ocultarCamposDireccion() {
    const container = document.getElementById('camposDireccion');
    if (container) {
      container.style.display = 'none';
      // Limpiar valores
      document.getElementById('ventaCCDireccion').value = '';
      document.getElementById('ventaCCCiudad').value = '';
    }
  }

  /**
   * Verifica si se deben mostrar los campos de dirección (contado o cuota 1)
   */
  function verificarCamposDireccion() {
    const productoSelect = document.getElementById('ventaCCProducto');
    if (!productoSelect.value) {
      ocultarCamposDireccion();
      return;
    }

    try {
      const data = JSON.parse(productoSelect.value);
      // Mostrar si es contado o cuota 1
      if (data.tipo === 'contado' || data.nroCuota === 1) {
        mostrarCamposDireccion();
      } else {
        ocultarCamposDireccion();
      }
    } catch (e) {
      ocultarCamposDireccion();
    }
  }

  /**
   * Carga productos disponibles para venta de contado
   */
  async function cargarProductosContado(select) {
    if (!productosCache) {
      productosCache = await window.api.getProductosCatalog();
    }

    select.innerHTML = '<option value="">-- Seleccione un producto --</option>';

    if (productosCache && productosCache.length > 0) {
      productosCache.forEach(prod => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ tipo: 'contado', producto: prod.nombre, productoId: prod.id });
        option.textContent = prod.nombre;
        select.appendChild(option);
      });
      select.disabled = false;
    } else {
      select.innerHTML = '<option value="">No hay productos disponibles</option>';
    }

    cuotasPendientesCache = [];
    // Mostrar campos de dirección para contado
    mostrarCamposDireccion();
  }

  /**
   * Carga las cuotas pendientes de un acuerdo
   */
  async function cargarCuotasPendientes(nroAcuerdo, select) {
    const resultado = await window.api.consultarAcuerdo(nroAcuerdo);

    if (!resultado.success) {
      if (resultado.error === 'NOT_FOUND') {
        select.innerHTML = '<option value="">Acuerdo no encontrado</option>';
        alert('No se encontró el acuerdo: ' + nroAcuerdo);
      } else {
        select.innerHTML = '<option value="">Error al consultar</option>';
        alert('Error: ' + (resultado.message || resultado.error));
      }
      cuotasPendientesCache = [];
      ocultarCamposDireccion();
      return;
    }

    const cuotas = resultado.cuotas || [];

    // Filtrar cuotas no pagadas
    const pendientes = cuotas.filter(c => c.estado_pago !== 'pagado');
    cuotasPendientesCache = pendientes;

    // Guardar IDs para uso posterior
    const productoId = resultado.productoId || null;
    const comercialId = resultado.comercialId || null;

    if (pendientes.length === 0) {
      select.innerHTML = '<option value="">No hay cuotas pendientes</option>';
      ocultarCamposDireccion();
      return;
    }

    select.innerHTML = '<option value="">-- Seleccione cuota a pagar --</option>';

    pendientes.forEach(cuota => {
      const option = document.createElement('option');
      const productoNombre = cuota.producto || resultado.producto || 'Producto';
      option.value = JSON.stringify({
        tipo: 'cuota',
        producto: productoNombre,
        productoId: productoId,
        comercialId: comercialId,
        nroCuota: cuota.nro_cuota,
        cuotaId: cuota.id,
        nroAcuerdo: nroAcuerdo
      });
      option.textContent = `${productoNombre} - Cuota ${cuota.nro_cuota}`;
      select.appendChild(option);
    });

    select.disabled = false;
  }

  /**
   * Valida si el formulario está completo para habilitar el botón
   */
  function validarFormulario() {
    const producto = document.getElementById('ventaCCProducto').value;
    const valor = document.getElementById('ventaCCValor').value.trim();
    const reportarBtn = document.getElementById('reportarVentaCCBtn');

    const valido = producto && valor && comprobanteFile;
    reportarBtn.disabled = !valido;
  }

  /**
   * Sube el comprobante a Supabase Storage
   */
  async function subirComprobanteSupabase(file, nombreArchivo) {
    // Convertir archivo a base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result.split(',')[1];

          // Llamar al backend para subir a Supabase
          const response = await fetch('/api/subirArchivoSupabase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              args: [{
                bucketName: SUPABASE_BUCKET,
                fileName: nombreArchivo,
                mimeType: file.type,
                base64Content: base64
              }]
            })
          });

          const result = await response.json();
          console.log('📤 Respuesta completa del servidor:', JSON.stringify(result, null, 2));
          if (result.success && result.result) {
            // Verificar si el resultado interno también fue exitoso
            if (result.result.success === false) {
              reject(new Error(result.result.error || 'Error en la subida a Supabase'));
            } else {
              resolve(result.result);
            }
          } else {
            reject(new Error(result.error || result.result?.error || 'Error al subir archivo'));
          }
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Envía notificación a Google Chat
   */
  async function notificarGoogleChat(datos) {
    const mensaje = {
      text: `🆕 *Nueva Venta en Cuenta Corriente*\n\n` +
            `👤 *Estudiante:* ${datos.nombres} ${datos.apellidos}\n` +
            `📱 *Celular:* ${datos.celular}\n` +
            `📧 *Correo:* ${datos.correo}\n` +
            `📦 *Producto:* ${datos.producto}\n` +
            `💰 *Valor:* $${Number(datos.valor).toLocaleString('es-CO')}\n` +
            `📄 *Acuerdo:* ${datos.nroAcuerdo || 'Contado'}\n` +
            `🔗 *Comprobante:* ${datos.comprobanteUrl || 'Pendiente'}\n` +
            `📅 *Fecha:* ${new Date().toLocaleString('es-CO')}`
    };

    try {
      await fetch(CHAT_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mensaje)
      });
    } catch (error) {
      console.error('Error notificando a Google Chat:', error);
      // No bloquear el proceso si falla la notificación
    }
  }

  /**
   * Procesa el reporte de venta
   */
  async function reportarVenta() {
    const reportarBtn = document.getElementById('reportarVentaCCBtn');
    const originalText = reportarBtn.innerHTML;

    reportarBtn.disabled = true;
    reportarBtn.innerHTML = '<span class="spinner"></span> Reportando...';

    try {
      // Obtener datos del formulario
      const nombres = document.getElementById('ventaCCNombres').value;
      const apellidos = document.getElementById('ventaCCApellidos').value;
      const celular = document.getElementById('ventaCCCelular').value;
      const correo = document.getElementById('ventaCCCorreo').value;
      const productoData = JSON.parse(document.getElementById('ventaCCProducto').value);
      const valor = document.getElementById('ventaCCValor').value;
      const nroAcuerdo = document.getElementById('ventaCCNroAcuerdo').value;

      // Generar nombre único para el archivo
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const extension = comprobanteFile.name.split('.').pop() || 'png';
      const nombreArchivo = `comprobante_${nroAcuerdo || 'contado'}_${timestamp}.${extension}`;

      // 1. Subir comprobante a Supabase Storage
      let comprobanteUrl = null;
      try {
        console.log('📤 Subiendo comprobante a Supabase...');
        const supabaseResult = await subirComprobanteSupabase(comprobanteFile, nombreArchivo);
        console.log('📤 Resultado de subida:', supabaseResult);
        comprobanteUrl = supabaseResult.url;
        console.log('📤 URL del comprobante:', comprobanteUrl);
      } catch (error) {
        console.error('❌ Error subiendo a Supabase:', error);
        alert('❌ Error al subir el comprobante: ' + error.message + '\n\nPor favor intente de nuevo.');
        return; // No continuar si falla la subida
      }

      if (!comprobanteUrl) {
        alert('❌ No se pudo obtener la URL del comprobante. Por favor intente de nuevo.');
        return;
      }

      // Obtener cédula del estudiante (necesitamos buscarla)
      const cedula = datosEstudianteActual?.cedula || '';

      // Obtener dirección y ciudad si están visibles
      const direccion = document.getElementById('ventaCCDireccion')?.value || '';
      const ciudad = document.getElementById('ventaCCCiudad')?.value || '';

      // 2. Guardar en Strapi (ventas-corrientes)
      console.log('💾 Guardando venta en Strapi...');
      try {
        const strapiResult = await fetch('/api/guardarVentaCorriente', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            args: [{
              numero_documento: cedula,
              nombres: nombres,
              apellidos: apellidos,
              correo: correo,
              celular: celular,
              comercialId: productoData.comercialId || null,
              productoId: productoData.productoId || null,
              nro_acuerdo: productoData.tipo === 'contado' ? 'contado' : nroAcuerdo,
              valor: valor,
              comprobante_url: comprobanteUrl,
              direccion: direccion,
              ciudad: ciudad
            }]
          })
        });
        const strapiData = await strapiResult.json();
        console.log('💾 Resultado Strapi:', strapiData);
        if (!strapiData.success) {
          console.warn('⚠️ Error guardando en Strapi:', strapiData.error);
        }
      } catch (strapiError) {
        console.error('❌ Error guardando en Strapi:', strapiError);
        // No bloquear el proceso si falla Strapi
      }

      // 3. Notificar a Google Chat
      await notificarGoogleChat({
        nombres,
        apellidos,
        celular,
        correo,
        producto: productoData.producto + (productoData.nroCuota ? ` - Cuota ${productoData.nroCuota}` : ''),
        valor,
        nroAcuerdo: productoData.tipo === 'contado' ? 'Contado' : nroAcuerdo,
        comprobanteUrl,
        direccion,
        ciudad
      });

      // Éxito
      alert('✅ Venta reportada exitosamente!\n\nSe ha guardado en el sistema y notificado al equipo.');
      cerrarModal();

    } catch (error) {
      console.error('Error reportando venta:', error);
      alert('❌ Error al reportar la venta: ' + error.message);
    } finally {
      reportarBtn.disabled = false;
      reportarBtn.innerHTML = originalText;
    }
  }

  /**
   * Abre el modal con los datos del estudiante prediligenciados
   */
  function abrirModal(datosEstudiante) {
    crearModal();

    // Guardar datos del estudiante para uso posterior (incluyendo cédula)
    datosEstudianteActual = datosEstudiante;

    // Prediligenciar datos del estudiante
    document.getElementById('ventaCCNombres').value = datosEstudiante.nombres || '';
    document.getElementById('ventaCCApellidos').value = datosEstudiante.apellidos || '';
    document.getElementById('ventaCCCelular').value = datosEstudiante.celular || '';
    document.getElementById('ventaCCCorreo').value = datosEstudiante.correo || '';

    // Limpiar campos de venta
    document.getElementById('ventaCCNroAcuerdo').value = '';
    document.getElementById('ventaCCProducto').innerHTML = '<option value="">-- Primero busque un acuerdo o ingrese "contado" --</option>';
    document.getElementById('ventaCCProducto').disabled = true;
    document.getElementById('ventaCCValor').value = '';

    // Limpiar campos de dirección
    document.getElementById('ventaCCDireccion').value = '';
    document.getElementById('ventaCCCiudad').value = '';
    ocultarCamposDireccion();

    // Limpiar comprobante
    comprobanteFile = null;
    document.getElementById('comprobantePreview').style.display = 'none';
    document.getElementById('comprobanteInstructions').style.display = 'block';
    document.getElementById('quitarComprobante').style.display = 'none';
    document.getElementById('comprobanteInput').value = '';

    // Deshabilitar botón reportar
    document.getElementById('reportarVentaCCBtn').disabled = true;

    // Mostrar modal
    document.getElementById('reportarVentaCCModal').style.display = 'flex';
  }

  /**
   * Cierra el modal
   */
  function cerrarModal() {
    const modal = document.getElementById('reportarVentaCCModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  // Exponer función para abrir el modal desde app.js
  window.abrirReportarVentaCC = abrirModal;

})();
