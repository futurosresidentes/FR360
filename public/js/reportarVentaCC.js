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
  let membershipPlansCache = null;
  let membershipRowCounter = 0;

  // --- Helpers de fecha locales (reimplementados de app.js) ---
  function _parseLocalDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function _formatLocalDate(d) {
    const y = d.getFullYear(),
          m = String(d.getMonth() + 1).padStart(2, '0'),
          day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
  function _sumarDias(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  }
  function _getMembershipStartDate(dateInput) {
    const selectedDate = _parseLocalDate(dateInput);
    const today = new Date();
    const selOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
    const todOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (selOnly.getTime() === todOnly.getTime()) {
      const now = new Date();
      const utc = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 5, now.getMinutes(), now.getSeconds()));
      return utc.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    } else {
      const utc = new Date(Date.UTC(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), 5, 0, 0));
      return utc.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    }
  }
  function _getMembershipExpiryDate(dateInput) {
    const d = _parseLocalDate(dateInput);
    const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate() + 1, 4, 59, 59));
    return utc.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
  }
  function _humanCapitalize(str) {
    if (!str) return '';
    return str.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  }

  // --- Funciones de membresías ---
  async function cargarMembershipPlansCache() {
    if (membershipPlansCache) return membershipPlansCache;
    try {
      membershipPlansCache = await window.api.getActiveMembershipPlans();
      return membershipPlansCache || [];
    } catch (error) {
      console.error('Error cargando planes de membresía:', error);
      return [];
    }
  }

  async function agregarFilaMembresia() {
    const plans = await cargarMembershipPlansCache();
    if (!plans || plans.length === 0) {
      alert('No hay planes de membresía disponibles.');
      return;
    }

    const rowId = ++membershipRowCounter;
    const container = document.getElementById('membresiaRowsContainer');
    const emptyMsg = document.getElementById('membresiaEmpty');
    if (emptyMsg) emptyMsg.style.display = 'none';

    let planOptions = '<option value="">-- Seleccione plan --</option>';
    plans.forEach(plan => {
      planOptions += `<option value="${plan.id}">${plan.name}</option>`;
    });

    const todayStr = _formatLocalDate(new Date());

    const rowDiv = document.createElement('div');
    rowDiv.className = 'membresia-row';
    rowDiv.dataset.rowId = rowId;
    rowDiv.style.cssText = 'background:white; padding:10px; border-radius:6px; margin-bottom:8px; border:1px solid #c8e6c9;';
    rowDiv.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <select class="memb-plan-select" style="flex:1; padding:8px; border:1px solid #ddd; border-radius:4px; font-size:0.9em; font-family:inherit;">
          ${planOptions}
        </select>
        <button type="button" class="memb-remove-btn" style="background:#dc3545; color:white; border:none; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:0.85em; margin-left:8px; font-family:inherit;">✕</button>
      </div>
      <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:8px; align-items:end;">
        <div>
          <label style="font-size:0.8em; color:#666; display:block; margin-bottom:2px; font-family:inherit;">Fecha inicio</label>
          <input type="date" class="memb-start-date" value="${todayStr}" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:4px; font-size:0.9em; font-family:inherit; box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:0.8em; color:#666; display:block; margin-bottom:2px; font-family:inherit;">Duración (días)</label>
          <input type="number" class="memb-duration" min="1" placeholder="días" style="width:80px; padding:6px; border:1px solid #ddd; border-radius:4px; font-size:0.9em; font-family:inherit; box-sizing:border-box;">
        </div>
        <div>
          <label style="font-size:0.8em; color:#666; display:block; margin-bottom:2px; font-family:inherit;">Fecha fin</label>
          <input type="date" class="memb-end-date" style="width:100%; padding:6px; border:1px solid #ddd; border-radius:4px; font-size:0.9em; font-family:inherit; box-sizing:border-box;">
        </div>
      </div>
    `;

    container.appendChild(rowDiv);

    // Bidirectional date/duration
    const startInput = rowDiv.querySelector('.memb-start-date');
    const durationInput = rowDiv.querySelector('.memb-duration');
    const endInput = rowDiv.querySelector('.memb-end-date');
    const removeBtn = rowDiv.querySelector('.memb-remove-btn');

    function calcFechaFin() {
      if (!startInput.value || !durationInput.value) return;
      const duration = parseInt(durationInput.value);
      if (duration < 1 || isNaN(duration)) return;
      endInput.value = _formatLocalDate(_sumarDias(_parseLocalDate(startInput.value), duration));
    }
    function calcDuracion() {
      if (!startInput.value || !endInput.value) return;
      const start = _parseLocalDate(startInput.value);
      const end = _parseLocalDate(endInput.value);
      if (end <= start) { durationInput.value = ''; return; }
      durationInput.value = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }

    startInput.addEventListener('change', () => {
      if (durationInput.value) calcFechaFin();
      else if (endInput.value) calcDuracion();
    });
    durationInput.addEventListener('input', calcFechaFin);
    endInput.addEventListener('change', calcDuracion);

    removeBtn.addEventListener('click', () => {
      rowDiv.remove();
      if (container.querySelectorAll('.membresia-row').length === 0 && emptyMsg) {
        emptyMsg.style.display = 'block';
      }
      validarFormulario();
    });

    const planSelect = rowDiv.querySelector('.memb-plan-select');
    planSelect.addEventListener('change', () => {
      const planName = planSelect.options[planSelect.selectedIndex]?.text || '';
      if (planName.includes('Simulación especializada UdeA') || planName.includes('Simulación UniValle 2026')) {
        endInput.value = '2026-05-31';
        calcDuracion();
      }
      validarFormulario();
    });
    validarFormulario();
  }

  function mostrarSeccionMembresia() {
    const c = document.getElementById('camposMembresia');
    if (c) c.style.display = 'block';
  }
  function ocultarSeccionMembresia() {
    const c = document.getElementById('camposMembresia');
    if (c) c.style.display = 'none';
    const rows = document.getElementById('membresiaRowsContainer');
    if (rows) rows.innerHTML = '';
    const msg = document.getElementById('membresiaEmpty');
    if (msg) msg.style.display = 'block';
    membershipRowCounter = 0;
  }
  function recogerDatosMembresia() {
    const rows = document.querySelectorAll('#membresiaRowsContainer .membresia-row');
    const result = [];
    rows.forEach(row => {
      const sel = row.querySelector('.memb-plan-select');
      const start = row.querySelector('.memb-start-date');
      const end = row.querySelector('.memb-end-date');
      if (sel.value && start.value && end.value) {
        result.push({
          planId: parseInt(sel.value),
          planName: sel.options[sel.selectedIndex].textContent,
          startDate: start.value,
          endDate: end.value
        });
      }
    });
    return result;
  }

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
                  <input type="text" id="ventaCCNombres" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:0.85em; color:#666; font-family:inherit; display:block; margin-bottom:4px;">Apellidos</label>
                  <input type="text" id="ventaCCApellidos" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:0.85em; color:#666; font-family:inherit; display:block; margin-bottom:4px;">Celular</label>
                  <input type="text" id="ventaCCCelular" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
                </div>
                <div>
                  <label style="font-size:0.85em; color:#666; font-family:inherit; display:block; margin-bottom:4px;">Correo</label>
                  <input type="text" id="ventaCCCorreo" style="width:100%; padding:8px; border:1px solid #ddd; border-radius:4px; font-family:inherit; font-size:0.95em; box-sizing:border-box;">
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

              <!-- Comercial (siempre visible cuando hay producto seleccionado) -->
              <div id="campoComercial" style="display:none; margin-bottom:12px;">
                <label style="font-size:0.85em; color:#666; display:block; margin-bottom:4px; font-family:inherit;">Comercial</label>
                <select id="ventaCCComercial" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; font-size:0.95em; font-family:inherit; box-sizing:border-box;">
                  <option value="">-- Seleccione comercial --</option>
                </select>
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

              <!-- Planes de membresía (solo para contado o cuota 1) -->
              <div id="camposMembresia" style="display:none; margin-bottom:12px; background:#e8f5e9; padding:12px; border-radius:8px; border:1px solid #a5d6a7;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <p style="margin:0; font-size:0.85em; color:#2e7d32; font-family:inherit;">🎓 Planes de Membresía (opcional)</p>
                  <button type="button" id="agregarPlanMembresiaBtn" style="background:#43a047; color:white; border:none; padding:6px 14px; border-radius:4px; cursor:pointer; font-size:0.85em; font-family:inherit;">+ Agregar plan</button>
                </div>
                <div id="membresiaRowsContainer"></div>
                <p id="membresiaEmpty" style="margin:0; font-size:0.85em; color:#888; text-align:center; font-family:inherit;">Sin planes agregados. Haz clic en "+ Agregar plan" para incluir una membresía.</p>
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

    // Validar al editar campos del estudiante
    ['ventaCCNombres', 'ventaCCApellidos', 'ventaCCCelular', 'ventaCCCorreo'].forEach(id => {
      document.getElementById(id).addEventListener('input', validarFormulario);
    });

    // Normalizar celular colombiano al salir del campo
    document.getElementById('ventaCCCelular').addEventListener('blur', normalizarCelular);

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

    // Agregar plan de membresía
    document.getElementById('agregarPlanMembresiaBtn').addEventListener('click', agregarFilaMembresia);
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
   * Carga la lista de comerciales de Strapi
   */
  let comercialesCache = null;
  async function cargarComerciales() {
    const select = document.getElementById('ventaCCComercial');
    if (!select) return;

    if (comercialesCache) {
      renderComerciales(select, comercialesCache);
      return;
    }

    select.innerHTML = '<option value="">Cargando...</option>';
    try {
      const comerciales = await window.api.getComerciales();
      comercialesCache = comerciales || [];
      renderComerciales(select, comercialesCache);
    } catch (error) {
      console.error('Error cargando comerciales:', error);
      select.innerHTML = '<option value="">Error al cargar</option>';
    }
  }

  function renderComerciales(select, comerciales) {
    select.innerHTML = '<option value="">-- Seleccione comercial --</option>';
    comerciales.forEach(c => {
      const option = document.createElement('option');
      option.value = c.id;
      option.textContent = c.nombre;
      select.appendChild(option);
    });
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
      document.getElementById('ventaCCDireccion').value = '';
      document.getElementById('ventaCCCiudad').value = '';
    }
  }

  /**
   * Muestra el campo comercial abierto (para contado)
   */
  function mostrarComercialAbierto() {
    const container = document.getElementById('campoComercial');
    const select = document.getElementById('ventaCCComercial');
    if (container && select) {
      container.style.display = 'block';
      select.disabled = false;
      cargarComerciales();
    }
  }

  /**
   * Muestra el campo comercial pre-seleccionado y bloqueado (para acuerdos)
   */
  function mostrarComercialDesdeAcuerdo(comercialId) {
    const container = document.getElementById('campoComercial');
    const select = document.getElementById('ventaCCComercial');
    if (!container || !select) return;

    container.style.display = 'block';
    select.disabled = true;

    // Cargar comerciales y pre-seleccionar
    cargarComerciales().then(() => {
      if (comercialId) {
        select.value = String(comercialId);
      }
    });
  }

  /**
   * Oculta el campo comercial
   */
  function ocultarComercial() {
    const container = document.getElementById('campoComercial');
    const select = document.getElementById('ventaCCComercial');
    if (container) container.style.display = 'none';
    if (select) { select.value = ''; select.disabled = false; }
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
        mostrarSeccionMembresia();
      } else {
        ocultarCamposDireccion();
        ocultarSeccionMembresia();
      }
    } catch (e) {
      ocultarCamposDireccion();
      ocultarSeccionMembresia();
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
    // Mostrar campos de dirección, membresía y comercial abierto para contado
    mostrarCamposDireccion();
    mostrarSeccionMembresia();
    mostrarComercialAbierto();
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
      ocultarSeccionMembresia();
      ocultarComercial();
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
      ocultarSeccionMembresia();
      ocultarComercial();
      return;
    }

    select.innerHTML = '<option value="">-- Seleccione cuota a pagar --</option>';

    pendientes.forEach(cuota => {
      const option = document.createElement('option');
      const productoNombre = cuota.producto || resultado.producto || 'Producto';
      option.value = JSON.stringify({
        tipo: 'cuota',
        producto: productoNombre,
        productoId: cuota.productoId || productoId,
        comercialId: comercialId,
        nroCuota: cuota.nro_cuota,
        cuotaId: cuota.id,
        nroAcuerdo: nroAcuerdo
      });
      option.textContent = `${productoNombre} - Cuota ${cuota.nro_cuota}`;
      select.appendChild(option);
    });

    select.disabled = false;

    // Completar datos del estudiante desde Strapi si están vacíos, y bloquear
    const strapiData = resultado.data || {};
    const camposAutorellenar = [
      { id: 'ventaCCNombres', valor: strapiData.nombres },
      { id: 'ventaCCApellidos', valor: strapiData.apellidos },
      { id: 'ventaCCCelular', valor: strapiData.celular },
      { id: 'ventaCCCorreo', valor: strapiData.correo }
    ];
    camposAutorellenar.forEach(({ id, valor }) => {
      const el = document.getElementById(id);
      if (el && !el.value.trim() && valor) {
        el.value = valor;
        el.readOnly = true;
        el.style.background = '#e9ecef';
      }
    });
    // Normalizar celular colombiano
    normalizarCelular();
    validarFormulario();

    // Comercial: pre-seleccionar desde el acuerdo y bloquear
    mostrarComercialDesdeAcuerdo(comercialId);
  }

  /**
   * Normaliza el celular colombiano: si es un número de 10 dígitos que empieza por 3, agrega +57
   */
  function normalizarCelular() {
    const input = document.getElementById('ventaCCCelular');
    if (!input) return;
    let val = input.value.trim().replace(/\s+/g, '');
    // Si es 10 dígitos y empieza por 3 (celular colombiano)
    if (/^3\d{9}$/.test(val)) {
      input.value = '+57' + val;
    }
    // Si es 57 + 10 dígitos sin el +
    else if (/^57[3]\d{9}$/.test(val)) {
      input.value = '+' + val;
    }
  }

  /**
   * Valida si el formulario está completo para habilitar el botón
   */
  function validarFormulario() {
    const producto = document.getElementById('ventaCCProducto').value;
    const valor = document.getElementById('ventaCCValor').value.trim();
    const nombres = document.getElementById('ventaCCNombres').value.trim();
    const apellidos = document.getElementById('ventaCCApellidos').value.trim();
    const celular = document.getElementById('ventaCCCelular').value.trim();
    const correo = document.getElementById('ventaCCCorreo').value.trim();
    const reportarBtn = document.getElementById('reportarVentaCCBtn');

    const valido = producto && valor && comprobanteFile && nombres && apellidos && celular && correo;
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
    let membresiaTexto = '';
    if (datos.membresiaResultados && datos.membresiaResultados.length > 0) {
      membresiaTexto = `\n🎓 *Membresías solicitadas:*\n`;
      datos.membresiaResultados.forEach(r => {
        membresiaTexto += r.ok ? `  ✅ ${r.plan}\n` : `  ❌ ${r.plan} (${r.error})\n`;
      });
    }

    const mensaje = {
      text: `🆕 *Nueva Venta en Cuenta Corriente*\n\n` +
            `👤 *Estudiante:* ${datos.nombres} ${datos.apellidos}\n` +
            `🪪 *Cédula:* ${datos.cedula}\n` +
            `📱 *Celular:* ${datos.celular}\n` +
            `📧 *Correo:* ${datos.correo}\n` +
            `📦 *Producto:* ${datos.producto}\n` +
            `💰 *Valor:* $${Number(datos.valor).toLocaleString('es-CO')}\n` +
            `📄 *Acuerdo:* ${datos.nroAcuerdo || 'Contado'}\n` +
            (datos.comercial ? `🧑‍💼 *Comercial:* ${datos.comercial}\n` : '') +
            (datos.ciudad ? `🏙️ *Ciudad:* ${datos.ciudad}\n` : '') +
            (datos.direccion ? `📍 *Dirección:* ${datos.direccion}\n` : '') +
            `🔗 *Comprobante:* ${datos.comprobanteUrl || 'Pendiente'}\n` +
            membresiaTexto +
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

      // Obtener dirección, ciudad y comercial si están visibles
      const direccion = document.getElementById('ventaCCDireccion')?.value || '';
      const ciudad = document.getElementById('ventaCCCiudad')?.value || '';
      const comercialSelect = document.getElementById('ventaCCComercial');
      const comercialIdSeleccionado = comercialSelect?.value || null;

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
              comercialId: comercialIdSeleccionado || productoData.comercialId || null,
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

      // 3. Registrar membresías si las hay
      const membresias = recogerDatosMembresia();
      const membresiaResultados = [];
      if (membresias.length > 0) {
        reportarBtn.innerHTML = '<span class="spinner"></span> Registrando membresías...';
        for (const memb of membresias) {
          try {
            const payload = {
              email: correo,
              givenName: _humanCapitalize(nombres.split(' ')[0] || nombres),
              familyName: _humanCapitalize(apellidos),
              phone: celular,
              identityType: 'CC',
              identityDocument: cedula,
              membershipPlanId: memb.planId,
              membershipStartDate: _getMembershipStartDate(memb.startDate),
              membershipEndDate: _getMembershipExpiryDate(memb.endDate)
            };

            let res = await window.api.registerMembFRAPP(payload);

            // Si el usuario ya existe, reintentar solo creando membresía
            if (res && res.error && /createMembershipIfUserExists/i.test(res.error)) {
              console.log(`Usuario existente detectado para ${cedula}, agregando solo membresía...`);
              const retryPayload = {
                email: correo,
                membershipPlanId: memb.planId,
                membershipStartDate: _getMembershipStartDate(memb.startDate),
                membershipEndDate: _getMembershipExpiryDate(memb.endDate),
                createMembershipIfUserExists: true,
                allowDuplicateMemberships: false
              };
              res = await window.api.registerMembFRAPP(retryPayload);
            }

            if (res && res.success === true) {
              membresiaResultados.push({ plan: memb.planName, ok: true });
            } else {
              console.error('registerMembFRAPP error', cedula, res);
              membresiaResultados.push({ plan: memb.planName, ok: false, error: res?.error || 'Error desconocido' });
            }
          } catch (e) {
            console.error('registerMembFRAPP exception', cedula, e);
            membresiaResultados.push({ plan: memb.planName, ok: false, error: e.message });
          }
        }
      }

      // 4. Notificar a Google Chat
      const comercialNombre = comercialSelect?.selectedOptions[0]?.textContent || '';
      await notificarGoogleChat({
        nombres,
        apellidos,
        cedula,
        celular,
        correo,
        producto: productoData.producto + (productoData.nroCuota ? ` - Cuota ${productoData.nroCuota}` : ''),
        valor,
        nroAcuerdo: productoData.tipo === 'contado' ? 'Contado' : nroAcuerdo,
        comprobanteUrl,
        comercial: comercialNombre,
        direccion,
        ciudad,
        membresiaResultados
      });

      // Éxito
      const membOk = membresiaResultados.filter(r => r.ok).length;
      const membErr = membresiaResultados.filter(r => !r.ok).length;
      let alertMsg = '✅ Venta reportada exitosamente!\n\nSe ha guardado en el sistema y notificado al equipo.';
      if (membresiaResultados.length > 0) {
        alertMsg += `\n\n🎓 Membresías: ${membOk} creada(s)`;
        if (membErr > 0) alertMsg += `, ${membErr} con error`;
      }
      alert(alertMsg);
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

    // Prediligenciar datos del estudiante y bloquear campos con datos
    ['ventaCCNombres', 'ventaCCApellidos', 'ventaCCCelular', 'ventaCCCorreo'].forEach(id => {
      const el = document.getElementById(id);
      el.value = '';
      el.readOnly = false;
      el.style.background = '';
    });
    const camposCRM = [
      { id: 'ventaCCNombres', valor: datosEstudiante.nombres },
      { id: 'ventaCCApellidos', valor: datosEstudiante.apellidos },
      { id: 'ventaCCCelular', valor: datosEstudiante.celular },
      { id: 'ventaCCCorreo', valor: datosEstudiante.correo }
    ];
    camposCRM.forEach(({ id, valor }) => {
      const el = document.getElementById(id);
      if (valor) {
        el.value = valor;
        el.readOnly = true;
        el.style.background = '#e9ecef';
      }
    });

    // Limpiar campos de venta
    document.getElementById('ventaCCNroAcuerdo').value = '';
    document.getElementById('ventaCCProducto').innerHTML = '<option value="">-- Primero busque un acuerdo o ingrese "contado" --</option>';
    document.getElementById('ventaCCProducto').disabled = true;
    document.getElementById('ventaCCValor').value = '';

    // Limpiar campos de dirección y membresía
    document.getElementById('ventaCCDireccion').value = '';
    document.getElementById('ventaCCCiudad').value = '';
    ocultarCamposDireccion();
    ocultarSeccionMembresia();
    ocultarComercial();

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
