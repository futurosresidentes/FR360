/**
 * FR360 - Frontend Application JavaScript
 * Migrated from Google Apps Script HTML file
 * 
 * IMPORTANT: This file contains Google Apps Script client-side calls that need to be converted
 * to fetch() API calls for Node.js/Express backend.
 * 
 * Conversion pattern:
 api.functionName(args)
   .then(callback)
   .catch(errCallback);
 * TO:   fetch('/api/functionName', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({args})})
 *       .then(res => res.json()).then(callback).catch(errCallback)
 * 
 * List of functions to convert:
 * - getCitizenServer(uid)
 * - getProductosServer()
 * - getProductosCatalog()
 * - getCallbellContact(celular)
 * - fetchCrmByEmail(email)
 * - fetchCrmStrapiOnly(uid)
 * - sincronizarCrmPorNumeroDocumento(uid)
 * - traerMembresiasServer(uid)
 * - fetchMembresiasFRAPP(uid)
 * - fetchVentas(uid)
 * - fetchAcuerdos(uid)
 * - getLinksByIdentityDocument(uid)
 * - resolvePagoYActualizarCartera(payload)
 * - getActiveMembershipPlans()
 * - And many more...
 */

    // === SISTEMA DE LOGGING SIMPLE ===
    let loadingErrors = [];

    function trackLoadingError(source, error) {
      loadingErrors.push({ source, error: error.toString(), timestamp: new Date() });
    }

    function logLoadingSummary() {
      if (loadingErrors.length > 0) {
        console.log(`❌ Se encontraron ${loadingErrors.length} errores durante la carga:`);
        loadingErrors.forEach(item => {
          console.log(`  • ${item.source}: ${item.error}`);
        });
      } else {
        console.log('✅ Todas las consultas se completaron exitosamente');
      }
      // Limpiar errores para próxima búsqueda
      loadingErrors = [];
    }

    // === OBTENER LINK DE ACTIVACIÓN FRAPP ===
    async function obtenerLinkActivacion(cedula) {
      try {
        const btn = event?.target;
        if (btn) {
          btn.textContent = '⏳';
          btn.disabled = true;
        }

        const response = await fetch('/api/getActivationLink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ args: [cedula] })
        });

        const data = await response.json();
        const result = data.result || data;

        if (result.success && result.data?.activationLink) {
          await navigator.clipboard.writeText(result.data.activationLink);
          alert(`✅ Link de activación copiado al portapapeles!\n\nExpira: ${new Date(result.data.expiresAt).toLocaleString('es-CO')}\n${result.data.isNewLink ? '(Link nuevo generado)' : '(Link existente)'}`);
        } else {
          // Manejar errores específicos
          const errorMsg = result.error || 'Error desconocido';
          if (result.data?.currentStatus === 'active') {
            alert(`⚠️ ${errorMsg}\n\nEl usuario ya activó su cuenta.`);
          } else {
            alert(`❌ Error: ${errorMsg}`);
          }
        }

        if (btn) {
          btn.textContent = '🔗';
          btn.disabled = false;
        }
      } catch (error) {
        console.error('Error obteniendo link de activación:', error);
        alert(`❌ Error: ${error.message}`);
        if (event?.target) {
          event.target.textContent = '🔗';
          event.target.disabled = false;
        }
      }
    }

    // Sidebar tabs
    document
      .querySelectorAll('#sidebar nav li')
      .forEach((li) => {
        li.onclick = () => {
          document
            .querySelectorAll('#sidebar nav li')
            .forEach((x) => x.classList.remove('active'));
          li.classList.add('active');
          document
            .querySelectorAll('.pane')
            .forEach((p) => p.classList.remove('active'));
          document.getElementById(li.dataset.tab).classList.add('active');
        };
      });

    // Refs
    const searchId = document.getElementById('searchId');
    const searchBtn = document.getElementById('searchBtn');
    const statusTop = document.getElementById('statusTop');
    const nombres = document.getElementById('nombres');
    const apellidos = document.getElementById('apellidos');
    const correo = document.getElementById('correo');
    const celular = document.getElementById('celular');
    const producto = document.getElementById('producto');
    const productosList = document.getElementById('productosList');
    const nroAcuerdoRow = document.getElementById('row-nro-acuerdo');
    const nroAcuerdoComercialito = document.getElementById('nroAcuerdoComercialito');
    const cuotasRow = document.getElementById('row-cuotas');
    const cuotas = document.getElementById('cuotas');
    const inicioRow = document.getElementById('row-inicio');
    const inicioTipo = document.getElementById('inicioTipo');
    const inicio = document.getElementById('inicio');
    const fechaMaxRow = document.getElementById('row-fecha-max');
    const fechaMax = document.getElementById('fechaMax');
    const valorInput = document.getElementById('valor');
    const rowLinkBtn = document.getElementById('row-link-btn');
    const createLinkBtn = document.getElementById('createLinkBtn');
    const linkResult = document.getElementById('linkResult');
    const planPagosContainer = document.getElementById('planPagosContainer');
    const planPagosTable = document.querySelector('#planPagosTable tbody');
    const msPorDia = 24 * 60 * 60 * 1000;
    const addMembBtn = document.getElementById('addMembBtn');
    const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v).trim());

    // Detectar si es un celular colombiano válido
    const isCelularColombia = v => {
      const normalized = String(v).trim().replace(/[\s\-()]/g, '');
      // 10 dígitos comenzando por 3, o 12 dígitos comenzando por 573, o 13 dígitos comenzando por +573
      return (/^3\d{9}$/.test(normalized) ||
              /^573\d{9}$/.test(normalized) ||
              /^\+573\d{9}$/.test(normalized));
    };

    // Normalizar celular a formato +573XXXXXXXXX
    const normalizarCelular = v => {
      let normalized = String(v).trim().replace(/[\s\-()]/g, '');

      if (normalized.startsWith('+573') && normalized.length === 13) {
        return normalized; // Ya está en formato correcto
      } else if (normalized.startsWith('573') && normalized.length === 12) {
        return '+' + normalized; // Agregar +
      } else if (normalized.startsWith('3') && normalized.length === 10) {
        return '+57' + normalized; // Agregar +57
      }

      return null; // No es un celular válido
    };

    // Referencias del callbell
    const callbellIcon = document.getElementById('callbellIcon');

    // ===== Descuentos / precio dinámico =====
    let currentDiscountPct = 0; // 0, 15, 25 …

    // ===== Datos de membresías actuales =====
    let currentMembershipsData = null; // Para almacenar las membresías del usuario actual

    // ===== Copy to clipboard for input fields =====
    function showCopyTooltip(event, text) {
      const tooltip = document.createElement('div');
      tooltip.className = 'copy-tooltip';
      tooltip.textContent = '✓ Copiado';
      tooltip.style.left = `${event.clientX}px`;
      tooltip.style.top = `${event.clientY - 30}px`;

      document.body.appendChild(tooltip);

      setTimeout(() => {
        tooltip.remove();
      }, 1200);
    }

    // Copy icons functionality
    const copyIcons = {
      nombres: document.getElementById('copyNombres'),
      apellidos: document.getElementById('copyApellidos'),
      correo: document.getElementById('copyCorreo'),
      celular: document.getElementById('copyCelular')
    };

    // Function to show/hide copy icons based on field value
    window.updateCopyIconVisibility = function(fieldId) {
      const field = document.getElementById(fieldId);
      const icon = copyIcons[fieldId];

      if (field && icon) {
        if (field.value && field.value.trim()) {
          icon.style.display = 'block';
        } else {
          icon.style.display = 'none';
        }
      }
    };

    // Handle copy icon clicks
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('copy-icon')) {
        const fieldId = e.target.getAttribute('data-copy-target');
        const field = document.getElementById(fieldId);

        if (field && field.value && field.value.trim()) {
          const value = field.value.trim();

          // Try clipboard API
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => {
              showCopyTooltip(e, value);
            }).catch(err => {
              console.error('Error copying:', err);
              fallbackCopyToClipboard(value, field, e);
            });
          } else {
            fallbackCopyToClipboard(value, field, e);
          }
        }
      }
    });

    // Fallback copy method for browsers without clipboard API
    function fallbackCopyToClipboard(text, field, event) {
      const wasDisabled = field.disabled;
      const wasReadOnly = field.readOnly;

      try {
        // Temporarily enable the field to allow selection
        field.disabled = false;
        field.readOnly = false;
        field.select();
        field.setSelectionRange(0, 99999); // For mobile devices

        const successful = document.execCommand('copy');

        // Restore original state
        field.disabled = wasDisabled;
        field.readOnly = wasReadOnly;

        if (successful) {
          console.log('✅ Copied using fallback method:', text);
          showCopyTooltip(event, text);
        } else {
          console.error('❌ Fallback copy failed');
        }
      } catch (err) {
        console.error('❌ Error in fallback copy:', err);
        // Restore original state
        field.disabled = wasDisabled;
        field.readOnly = wasReadOnly;
      }
    }

    // ===== Estado del Plan de pagos =====
    let planState = [];        // [{nro, date:Date, amount:Number, editable:Boolean}]
    let planTotal = 0;
    let planIsMaxFin = false;
    let planPreferredDay = null; // día "modelo" para anclar fechas del plan
    let firstDateModified = false; // se marcó si cambiaron fecha de cuota 1
    let originalDates = []; // fechas originales para comparar si se volvió al estado inicial
    let cuota1IsToday = true; // indica si cuota 1 está en fecha de hoy
    const formatCOP = n => Number(n||0).toLocaleString('es-CO');
    const parseCOP  = s => Number(String(s||'').replace(/\D/g,''));
    function addMonthsSameDay(d, m){
      const y = d.getFullYear(), mo = d.getMonth() + m;
      const last = new Date(y, mo + 1, 0).getDate();
      const day  = Math.min(d.getDate(), last);
      return new Date(y, mo, day);
    }
    // anclar por d de referencia (evita que 31  30  28 se siga arrastrando)
    function addMonthsAnchored(d, m, preferredDay){
      const y = d.getFullYear(), mo = d.getMonth() + m;
      const last = new Date(y, mo + 1, 0).getDate();
      const day  = Math.min(preferredDay, last);
      return new Date(y, mo, day);
    }
    function lastDayOfNextMonth(from){
      return new Date(from.getFullYear(), from.getMonth() + 2, 0);
    }
    // Ancla por día preferido (evita arrastre permanente 31→30→28)
    function addMonthsAnchored(d, m, preferredDay){
      const y = d.getFullYear(), mo = d.getMonth() + m;
      const last = new Date(y, mo + 1, 0).getDate();
      const day  = Math.min(preferredDay, last);
      return new Date(y, mo, day);
    }
    function endOfCurrentMonth(from){
      return new Date(from.getFullYear(), from.getMonth() + 1, 0);
    }
    function todayLocal(){
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    // Rango y validación para Inicio plataforma
    function updateInicioRange(){
      const t = todayLocal();
      const max = addMonthsSameDay(t, 2);
      inicio.min = formatLocalDate(t);
      inicio.max = formatLocalDate(max);
    }

    // Lógica para manejar el dropdown de tipo de inicio
    function handleInicioTipoChange() {
      const tipoSeleccionado = inicioTipo.value;

      if (tipoSeleccionado === 'fecha-personalizada') {
        // Mostrar el date picker
        inicio.style.display = 'block';
        inicio.required = true;
        updateInicioRange(); // Actualizar el rango permitido
      } else if (tipoSeleccionado === 'primer-pago') {
        // Ocultar el date picker y usar fecha de primer pago
        inicio.style.display = 'none';
        inicio.required = false;
        // La fecha se calculará automáticamente desde planState
        setInicioFromFirstPayment();
      } else {
        // No hay selección, ocultar date picker
        inicio.style.display = 'none';
        inicio.required = false;
        inicio.value = '';
      }
    }

    // Función para establecer la fecha de inicio basada en el primer pago
    function setInicioFromFirstPayment() {
      const numberOfInstallments = Number(cuotas.value) || 0;

      if (numberOfInstallments === 1) {
        // Para pagos de contado, el "primer pago" es inmediato, usar fecha de hoy
        const today = todayLocal();
        inicio.value = formatLocalDate(today);
      } else if (planState && planState.length > 0) {
        // Para pagos financiados, usar la fecha de la primera cuota del plan
        const firstPaymentDate = planState[0].date;
        inicio.value = formatLocalDate(firstPaymentDate);
      }
    }

    // Event listener para el dropdown de tipo de inicio
    if (inicioTipo) {
      inicioTipo.addEventListener('change', handleInicioTipoChange);
    }

    // === Helpers globales para promesas y reintentos (usados en todo el panel) ===

    // Sleep helper
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Retry helper
    async function withRetry(fn, tries = 3, wait = 1000) {
        let lastErr;
        for (let i = 1; i <= tries; i++) {
          try { return await fn(); }
          catch (e) { lastErr = e; if (i < tries) await sleep(wait); }
        }
        throw lastErr;
    }

    function pLimit(concurrency = 4){
      let active = 0; const queue = [];
      const next = () => {
        if (active >= concurrency || queue.length === 0) return;
        active++;
        const { fn, resolve, reject } = queue.shift();
        fn().then(v => { active--; resolve(v); next(); })
          .catch(e => { active--; reject(e); next(); });
      };
      return (fn) => new Promise((resolve, reject) => {
        queue.push({ fn, resolve, reject }); next();
      });
    }

    const batchOpenBtn   = document.getElementById('batchOpenBtn');
    const batchModal     = document.getElementById('batchModal');
    const batchCloseBtn  = document.getElementById('batchCloseBtn');
    const batchProduct   = document.getElementById('batchProduct');
    const batchCedulas   = document.getElementById('batchCedulas');
    const batchValidate  = document.getElementById('batchValidateBtn');
    const batchPauseBtn  = document.getElementById('batchPauseBtn');
    const batchResults   = document.getElementById('batchResults');
    const batchAddBtn    = document.getElementById('batchAddBtn');
    const batchAddStatus = document.getElementById('batchAddStatus');
    let   batchPaused    = false;

    let lastUid = '';
    let lastFactRows = [];
    let activeMembershipFRAPP = null;
    let currentUserFRAPP = null; // Usuario actual de FRAPP

    // Función para actualizar indicadores de tipo de cliente y mora
    function updateMoraIndicator() {
      const moraIndicator = document.getElementById('moraIndicator');
      const clientTypeIndicator = document.getElementById('clientTypeIndicator');
      if (!moraIndicator || !clientTypeIndicator) return;

      // Índices en lastFactRows: 16 = Categoria
      // Verificar si tiene cualquier producto Élite (con o sin paz y salvo)
      const hasElite = lastFactRows.some(r =>
        String(r[16]).trim().toLowerCase() === 'élite'
      );

      // Verificar si tiene cualquier producto Esencial (con o sin paz y salvo)
      const hasEsencial = lastFactRows.some(r =>
        String(r[16]).trim().toLowerCase() === 'esencial'
      );

      // Determinar tipo de cliente (prioridad: Élite > Esencial > Nuevo)
      if (hasElite) {
        clientTypeIndicator.textContent = 'Élite';
        clientTypeIndicator.style.display = 'inline';
        clientTypeIndicator.style.backgroundColor = '#28a745';
        clientTypeIndicator.style.color = '#fff';
      } else if (hasEsencial) {
        clientTypeIndicator.textContent = 'Esencial';
        clientTypeIndicator.style.display = 'inline';
        clientTypeIndicator.style.backgroundColor = '#17a2b8';
        clientTypeIndicator.style.color = '#fff';
      } else if (lastUid) {
        clientTypeIndicator.textContent = 'Nuevo';
        clientTypeIndicator.style.display = 'inline';
        clientTypeIndicator.style.backgroundColor = '#6c757d';
        clientTypeIndicator.style.color = '#fff';
      } else {
        clientTypeIndicator.style.display = 'none';
      }

      // Verificar mora para cualquier cliente con acuerdos
      const acuerdosData = window.currentAcuerdosData;
      if (Array.isArray(acuerdosData) && acuerdosData.length > 0) {
        // Cuotas en mora de acuerdos firmados
        const moraFirmado = acuerdosData.some(item =>
          String(item.estado_pago || '').toLowerCase() === 'en_mora' &&
          String(item.estado_firma || '').toLowerCase() === 'firmado'
        );
        // Cuotas en mora de acuerdos sin firmar
        const moraSinFirmar = acuerdosData.some(item =>
          String(item.estado_pago || '').toLowerCase() === 'en_mora' &&
          String(item.estado_firma || '').toLowerCase() !== 'firmado'
        );

        if (moraFirmado) {
          moraIndicator.textContent = '⚠️ En mora';
          moraIndicator.style.display = 'inline';
        } else if (moraSinFirmar) {
          moraIndicator.textContent = '⚠️ En mora - Sin acuerdo firmado';
          moraIndicator.style.display = 'inline';
        } else {
          moraIndicator.style.display = 'none';
        }
      } else {
        moraIndicator.style.display = 'none';
      }
    }

    const BASE_PRICE_9MESES           = 4130000;
    const BASE_PRICE_6MESES           = 3410000;
    const OFF_9MESES                  = 0.2;    
    const OFF_6MESES                  = 0.0;
    const OFF_9MESES_CONTADO          = 0.2;    
    const OFF_6MESES_CONTADO          = 0.0;

    // ===== Productos dinámicos =====
    const productMeta = new Map(); // nombre → {precio, max_financiacion, categoria, ...}
    async function loadProductos() {
      // 1) Llenar datalist con nombres
      try {
        const list = await api.getProductosServer();
        productosList.innerHTML = '';
        list.forEach((n) => {
          const o = document.createElement('option');
          o.value = n;
          productosList.appendChild(o);
        });
      } catch (err) {
        console.error('getProductosServer error', err);
        statusTop.textContent = '❌ Error al cargar productos';
      }

      // 2) Cargar catálogo (precio / max_financiacion) para lógica dinámica
      try {
        const rows = await api.getProductosCatalog();
        productMeta.clear();
        (rows || []).forEach(p => productMeta.set(p.nombre, p));
      } catch (err) {
        console.warn('getProductosCatalog error', err);
      }
    }

    // → helper para YYYY-MM-DD sin sorpresas de zona
    function formatLocalDate(d) {
      const y = d.getFullYear(),
            m = String(d.getMonth()+1).padStart(2,'0'),
            day = String(d.getDate()).padStart(2,'0');
      return `${y}-${m}-${day}`;
    }

    function toUTCDateTimeString(date, endOfDay = false) {
        // Si date es un Date object local, necesitamos crear un Date UTC con los mismos valores
        let d;
        if (date instanceof Date) {
          // Tomar los valores locales y crear una fecha UTC con esos mismos valores
          const year = date.getFullYear();
          const month = date.getMonth();
          const day = date.getDate();
          const hours = endOfDay ? 23 : 0;
          const minutes = endOfDay ? 59 : 0;
          const seconds = endOfDay ? 59 : 0;

          // Date.UTC crea un timestamp usando valores como UTC
          d = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
        } else {
          d = new Date(date);
          if (endOfDay) d.setUTCHours(23, 59, 59, 0);
        }

        // Construir string con valores UTC
        const Y = d.getUTCFullYear();
        const M = String(d.getUTCMonth() + 1).padStart(2, '0');
        const D = String(d.getUTCDate()).padStart(2, '0');
        const h = String(d.getUTCHours()).padStart(2, '0');
        const m = String(d.getUTCMinutes()).padStart(2, '0');
        const s = String(d.getUTCSeconds()).padStart(2, '0');
        return `${Y}-${M}-${D} ${h}:${m}:${s}`;
      }

    function localToUTCISOString(input, endOfDay = false) {
      const d = (input instanceof Date) ? new Date(input) : new Date(input + 'T00:00:00');
      if (endOfDay) {
        d.setHours(23, 59, 59, 999);
      }
      return d.toISOString(); // ej. "2025-07-29T04:00:00.000Z"
    }

    // Nueva función para fecha inicio: convierte hora local de Colombia a UTC ISO
    function getMembershipStartDate(dateInput) {
      console.log('🔍 getMembershipStartDate input:', dateInput);
      const selectedDate = parseLocalDate(dateInput);
      console.log('🔍 selectedDate después de parseLocalDate:', selectedDate);
      const today = new Date();

      // Comparar solo las fechas (año, mes, día) sin horas
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      if (selectedDateOnly.getTime() === todayOnly.getTime()) {
        // Es hoy: usar hora actual de Colombia convertida a UTC
        const now = new Date();
        const Y = now.getFullYear();
        const M = now.getMonth();
        const D = now.getDate();
        const h = now.getHours();
        const m = now.getMinutes();
        const s = now.getSeconds();

        // Crear fecha UTC sumando 5 horas al offset de Colombia (UTC-5)
        const utcDate = new Date(Date.UTC(Y, M, D, h + 5, m, s));
        // Formatear como "YYYY-MM-DD HH:MM:SS" (formato FRAPP)
        const result = utcDate.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
        console.log('🔍 Es hoy, retornando UTC formato FRAPP:', result);
        return result;
      } else {
        // Es fecha futura: usar 00:00:00 Colombia → 05:00:00 UTC
        const Y = selectedDate.getFullYear();
        const M = selectedDate.getMonth();
        const D = selectedDate.getDate();

        // Crear fecha UTC: 00:00 Colombia = 05:00 UTC
        const utcDate = new Date(Date.UTC(Y, M, D, 5, 0, 0));
        // Formatear como "YYYY-MM-DD HH:MM:SS" (formato FRAPP)
        const result = utcDate.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
        console.log('🔍 Es fecha futura, retornando UTC formato FRAPP:', result);
        return result;
      }
    }

    // Nueva función para fecha fin: convierte 23:59:59 Colombia a UTC formato FRAPP
    function getMembershipExpiryDate(dateInput) {
      const selectedDate = parseLocalDate(dateInput);
      const Y = selectedDate.getFullYear();
      const M = selectedDate.getMonth();
      const D = selectedDate.getDate();

      // Crear fecha UTC: 23:59:59 Colombia (UTC-5) = 04:59:59 del día siguiente en UTC
      const utcDate = new Date(Date.UTC(Y, M, D + 1, 4, 59, 59));
      // Formatear como "YYYY-MM-DD HH:MM:SS" (formato FRAPP)
      return utcDate.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
    }

    // ===== Funciones del Callbell =====
    let callbellAvailable = false;

    async function checkCallbellAvailability() {
      // Siempre ocultar el icono primero para evitar mostrar datos de consultas anteriores
      if (callbellIcon) {
        callbellIcon.style.display = 'none';
        callbellAvailable = false;
      }

      const celularValue = celular.value.trim();

      if (!celularValue) {
        return;
      }

      if (!callbellIcon) {
        console.error('❌ No se encontró el elemento callbellIcon');
        return;
      }

      try {
        const result = await api.getCallbellContact(celularValue);

        if (result.success && result.conversationHref) {
          callbellIcon.style.display = 'inline';
          callbellIcon.setAttribute('data-href', result.conversationHref);
          callbellAvailable = true;
        } else {
          console.log('❌ Callbell: No se encontró contacto');
          callbellIcon.style.display = 'none';
          callbellAvailable = false;
        }
      } catch (error) {
        console.error('❌ Error consultando Callbell:', error.message);
        callbellIcon.style.display = 'none';
        callbellAvailable = false;
      }
    }

    function openCallbell() {
      if (callbellAvailable) {
        const href = callbellIcon.getAttribute('data-href');
        if (href) {
          window.open(href, '_blank');
        }
      }
    }

    // Event listeners del callbell
    if (callbellIcon) {
      callbellIcon.addEventListener('click', openCallbell);
    }

    if (celular) {
      let timeoutId;
      celular.addEventListener('input', () => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(checkCallbellAvailability, 500);
      });

      // Verificar al cargar la página si ya hay un valor
      if (celular.value.trim()) {
        checkCallbellAvailability();
      }
    }

    // Reset formulario Comercialito
    function resetForm() {
      document.querySelector('.memb-old h3').textContent = 'Plataforma vieja';
      document.querySelector('.memb-new h3').textContent = 'Plataforma nueva';
      clearMembNewHeader();
      clearMembOldHeader();
      document.getElementById('membNewContainer').innerHTML   = '';
      // Limpiar statusTop pero preservar estructura del panel de progreso
      const progressPanel = document.getElementById('loadingProgress');
      if (progressPanel) {
        progressPanel.classList.add('hidden');
      } else {
        statusTop.textContent = '';
      }
      nombres.disabled = false;
      apellidos.disabled = false;
      [nombres, apellidos, correo, celular, valorInput].forEach((e) => e.value = '');
      producto.value = '';

      // Ocultar iconos de copiar
      updateCopyIconVisibility('nombres');
      updateCopyIconVisibility('apellidos');
      updateCopyIconVisibility('correo');
      updateCopyIconVisibility('celular');
      updateEditCelularButtonVisibility();

      // Limpiar campos de inicio plataforma
      inicioTipo.value = '';
      inicio.value = '';
      inicio.style.display = 'none';
      inicio.required = false;

      // Limpiar placeholder y límites del campo valor
      valorInput.placeholder = '';
      valorInput.min = '';
      valorInput.max = '';
      valorInput.readOnly = false;

      // También limpiar campos de Venta en confianza
      ['nombresConfianza', 'apellidosConfianza', 'correoConfianza', 'celularConfianza', 'nroAcuerdo', 'productoAcuerdo', 'comercialAcuerdo', 'fechaInicioAcuerdo', 'estadoAcuerdo'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
          element.value = '';
          // Solo habilitar campos editables, mantener bloqueados: productoAcuerdo, comercialAcuerdo, fechaInicioAcuerdo, estadoAcuerdo
          if (!['productoAcuerdo', 'comercialAcuerdo', 'fechaInicioAcuerdo', 'estadoAcuerdo'].includes(id)) {
            element.disabled = false;
          }
          element.classList.remove('gray');
          // Limpiar clase de estado
          if (id === 'estadoAcuerdo') {
            element.classList.remove('sin-firmar');
          }
        }
      });

      // Ocultar botón de otorgar acceso
      const otorgarAccesoBtn = document.getElementById('otorgarAccesoBtn');
      if (otorgarAccesoBtn) {
        otorgarAccesoBtn.style.display = 'none';
      }
      cuotas.innerHTML =
        '<option value="" disabled selected>Selecciona la cantidad de cuotas</option>';
      nroAcuerdoComercialito.value = '';

      // Desbloquear campos de inicio plataforma
      inicioTipo.disabled = false;
      inicio.disabled = false;

      [cuotasRow, nroAcuerdoRow, inicioRow, fechaMaxRow, rowLinkBtn, planPagosContainer].forEach((e) =>
        e.classList.add('hidden')
      );
      linkResult.innerHTML = '';
      ['ventasContainer', 'acuerdosContainer', 'linksTitle'].forEach((id) =>
        document.getElementById(id).style.display = 'none'
      );
      ['membresiasContainer', 'ventasContainer', 'acuerdosContainer', 'linksContainer'].forEach(
        (id) => (document.getElementById(id).innerHTML = '')
      );
      [nombres, apellidos, correo, celular, valorInput].forEach(el => {
        el.disabled = false;
        el.value    = '';
      });

      // Limpiar campos de inicio plataforma (segunda parte del reset)
      inicioTipo.value = '';
      inicio.value = '';
      inicio.style.display = 'none';
      inicio.required = false;
      valorInput.readOnly = false;
      document.getElementById('discountAnalysis').innerHTML = '';
      document.getElementById('moraIndicator').style.display = 'none';
      document.getElementById('clientTypeIndicator').style.display = 'none';
      lastFactRows = [];
      window.currentAcuerdosData = null; // Limpiar datos de acuerdos del cliente anterior
      planPagosTable.innerHTML = '';
      planPagosContainer.classList.add('hidden');

      // Ocultar icono de Callbell al iniciar nueva consulta
      if (callbellIcon) {
        callbellIcon.style.display = 'none';
        callbellAvailable = false;
      }
    }

    function clearMembNewHeader(){
      const wrap   = document.querySelector('.memb-new');
      const header = wrap?.querySelector('.memb-new-header');
      if (header) {
        // Solo actualizar el h3, no borrar todo el header (preservar botón editUserBtn)
        const h3 = header.querySelector('h3');
        if (h3) h3.textContent = 'Plataforma nueva';
      }
      const info = wrap?.querySelector('#membNewInfo');
      if (info) info.remove(); // <-- quita nombre/correo/roles previos
      const cont = document.getElementById('membNewContainer');
      if (cont) cont.innerHTML = '';
    }

    function clearMembOldHeader(){
      const wrap = document.querySelector('.memb-old');
      const info = wrap?.querySelector('#membOldInfo');
      if (info) info.remove(); // <-- quita nombre/correo/roles previos
      const cont = document.getElementById('membOldContainer');
      if (cont) cont.innerHTML = '';
    }

    function setMembNewLoading(msg = 'Cargando…'){
      clearMembNewHeader();
      const cont = document.getElementById('membNewContainer');
      cont.innerHTML = `<p>${msg}</p>`;
    }

    // Trigger search (acepta cédula, correo o celular)
    // Acepta force=true para refrescar aunque sea la misma cédula/correo/celular
    function triggerSearch(force = false) {
      if (window.SEARCH_LOCK) return;
      const raw = String(searchId.value || '').trim();

      // Limpiar mensaje de éxito anterior si existe
      const existingMessage = document.getElementById('membershipCreatedMessage');
      if (existingMessage) {
        existingMessage.remove();
      }

      // ——— Búsqueda por celular ———
      if (isCelularColombia(raw)) {
        if (!force && raw === String(lastUid || '')) return;

        lastUid = raw;
        resetForm();
        setMembNewLoading('Cargando…');
        setSearching(true);
        statusTop.textContent = 'Buscando por celular…';

        api.fetchCrmByCelular(raw)
          .then(rec => {
            if (!rec || !rec.uid) {
              const progressPanel = document.getElementById('loadingProgress');
              if (progressPanel) {
                progressPanel.classList.add('hidden');
              } else {
                statusTop.textContent = '';
              }
              alert('No se encontró un registro con ese celular en Strapi.');
              return;
            }
            // Prefill + bloqueo
            nombres.value   = rec.nombres   || '';
            apellidos.value = rec.apellidos || '';
            correo.value    = rec.correo    || '';
            celular.value   = rec.celular   || raw;
            if (nombres.value)   nombres.disabled   = true;
            if (apellidos.value) apellidos.disabled = true;
            if (correo.value)    correo.disabled    = true;
            if (celular.value)   celular.disabled   = true;

            // Mostrar iconos de copiar
            updateCopyIconVisibility('nombres');
            updateCopyIconVisibility('apellidos');
            updateCopyIconVisibility('correo');
            updateCopyIconVisibility('celular');
            updateEditCelularButtonVisibility();

            // Verificar callbell después de llenar el campo celular
            if (celular.value) checkCallbellAvailability();

            // También llenar campos de Venta en confianza
            const nombresConfianza = document.getElementById('nombresConfianza');
            const apellidosConfianza = document.getElementById('apellidosConfianza');
            const correoConfianza = document.getElementById('correoConfianza');
            const celularConfianza = document.getElementById('celularConfianza');

            nombresConfianza.value = rec.nombres || '';
            apellidosConfianza.value = rec.apellidos || '';
            correoConfianza.value = rec.correo || '';
            celularConfianza.value = rec.celular || raw;

            // Deshabilitar y aplicar estilo gray si tienen valor
            if (nombresConfianza.value) { nombresConfianza.disabled = true; nombresConfianza.classList.add('gray'); }
            if (apellidosConfianza.value) { apellidosConfianza.disabled = true; apellidosConfianza.classList.add('gray'); }

            // Correo y celular siempre de solo lectura (campos automáticos)
            correoConfianza.readOnly = true;
            celularConfianza.readOnly = true;

            // Continuar por cédula
            const uid = rec.uid;
            searchId.value = uid;
            lastUid = uid;
            setMembNewLoading('Cargando…');
            return fetchAllData(uid);
          })
          .catch(err => {
            console.error('fetchCrmByCelular error:', err);
            const progressPanel = document.getElementById('loadingProgress');
            if (progressPanel) {
              progressPanel.classList.add('hidden');
            } else {
              statusTop.textContent = '';
            }
            alert('❌ Error consultando por celular.');
          })
          .finally(() => setSearching(false));
        return;
      }

      // ——— Búsqueda por correo ———
      if (isEmail(raw)) {
        if (!force && raw.toLowerCase() === String(lastUid || '').toLowerCase()) return;

        lastUid = raw.toLowerCase();
        resetForm();
        setMembNewLoading('Cargando…');
        setSearching(true);
        statusTop.textContent = 'Buscando por correo…';

        api.fetchCrmByEmail(raw)
          .then(rec => {
            if (!rec || !rec.uid) {
              const progressPanel = document.getElementById('loadingProgress');
              if (progressPanel) {
                progressPanel.classList.add('hidden');
              } else {
                statusTop.textContent = '';
              }
              alert('No se encontró un registro con ese correo en Strapi.');
              return;
            }
            // Prefill + bloqueo
            nombres.value   = rec.nombres   || '';
            apellidos.value = rec.apellidos || '';
            correo.value    = rec.correo    || raw;
            celular.value   = rec.celular   || '';
            if (nombres.value)   nombres.disabled   = true;
            if (apellidos.value) apellidos.disabled = true;
            if (correo.value)    correo.disabled    = true;
            if (celular.value)   celular.disabled   = true;

            // Mostrar iconos de copiar
            updateCopyIconVisibility('nombres');
            updateCopyIconVisibility('apellidos');
            updateCopyIconVisibility('correo');
            updateCopyIconVisibility('celular');
            updateEditCelularButtonVisibility();

            // Verificar callbell después de llenar el campo celular
            if (celular.value) checkCallbellAvailability();

            // También llenar campos de Venta en confianza
            const nombresConfianza = document.getElementById('nombresConfianza');
            const apellidosConfianza = document.getElementById('apellidosConfianza');
            const correoConfianza = document.getElementById('correoConfianza');
            const celularConfianza = document.getElementById('celularConfianza');

            nombresConfianza.value = rec.nombres || '';
            apellidosConfianza.value = rec.apellidos || '';
            correoConfianza.value = rec.correo || raw;
            celularConfianza.value = rec.celular || '';

            // Deshabilitar y aplicar estilo gray si tienen valor
            if (nombresConfianza.value) { nombresConfianza.disabled = true; nombresConfianza.classList.add('gray'); }
            if (apellidosConfianza.value) { apellidosConfianza.disabled = true; apellidosConfianza.classList.add('gray'); }

            // Correo y celular siempre de solo lectura (campos automáticos)
            correoConfianza.readOnly = true;
            celularConfianza.readOnly = true;

            // Continuar por cédula
            const uid = rec.uid;
            searchId.value = uid;
            lastUid = uid;
            setMembNewLoading('Cargando…');
            return fetchAllData(uid);
          })
          .catch(err => {
            console.error('fetchCrmByEmail error:', err);
            const progressPanel = document.getElementById('loadingProgress');
            if (progressPanel) {
              progressPanel.classList.add('hidden');
            } else {
              statusTop.textContent = '';
            }
            alert('❌ Error consultando por correo.');
          })
          .finally(() => setSearching(false));
        return;
      }

      // ——— Búsqueda por cédula ———
      searchId.value = raw.replace(/[.,\s]/g, '');
      const uid = searchId.value.replace(/\D/g, '').trim();
      if (!uid) { alert('Por favor ingresa un Nro ID válido o un correo.'); return; }

      if (!force && uid === lastUid) return;   // evita duplicados salvo refresh
      lastUid = uid;

      resetForm();
      setMembNewLoading('Cargando…');
      setSearching(true);
      fetchAllData(uid); // setSearching(false) se maneja dentro de fetchAllData()
    }

    // Click = SIEMPRE refresh (force=true) — protegido contra clicks múltiples
    searchBtn.onclick = () => { if (window.SEARCH_LOCK) return; triggerSearch(true); };

    // Enter mantiene el comportamiento anterior (no forza si es igual)
    searchId.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); triggerSearch(false); }
    });

    // blur sigue igual que antes (puedes dejar tu normalización como está)


    searchId.addEventListener('blur', () => {
      const raw = String(searchId.value || '').trim();
      // Si es correo o celular, no normalizar ni auto-buscar aquí
      if (isEmail(raw) || isCelularColombia(raw)) return;
      // Normalizar si es cédula
      searchId.value = raw.replace(/[.,\s]/g, '');
      const uid = searchId.value.replace(/\D/g,'').trim();
      if (uid.length < 7) return; // no auto-buscar si es muy corto
      if (uid !== lastUid) triggerSearch();
    });

    // ——— Botón para borrar datos y reiniciar consulta ———
    const clearFormBtn = document.getElementById('clearFormBtn');
    if (clearFormBtn) {
      clearFormBtn.addEventListener('click', () => {
        searchId.value = '';
        lastUid = null;
        resetForm();
      });
    }

    // ——— Actualiza rango min/max según producto elegido y cuotas ———
    function updatePriceRange() {
      const name = producto.value.trim();
      const meta = productMeta.get(name);

      // Usuarios especiales que pueden omitir las restricciones Min/Max
      const specialUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com', 'eliana.montilla@sentiretaller.com'];
      const isSpecialUser = specialUsers.includes(USER_EMAIL);

      // si no hay meta, limpiamos límites
      if (!meta) {
        valorInput.placeholder = '';
        valorInput.min = '';
        valorInput.max = '';
        valorInput.readOnly = false;
        return;
      }

      // MAX: Siempre es el campo "precio" de Strapi
      const max = (typeof meta.precio === 'number' && !isNaN(meta.precio)) ? meta.precio : null;

      // MIN: Depende de si hay descuento o no
      const numCuotas = Number(cuotas.value) || 0;
      let min = null;

      if (currentDiscountPct > 0) {
        // CON descuento: aplicar descuento sobre "precio"
        min = (max != null) ? Math.round(max * (1 - currentDiscountPct / 100)) : null;
      } else {
        // SIN descuento: usar precio_contado_comercial o precio_financiado_comercial según cuotas
        if (numCuotas <= 1) {
          min = meta.precio_contado_comercial ?? meta.precio;
        } else {
          min = meta.precio_financiado_comercial ?? meta.precio;
        }
        min = (typeof min === 'number' && !isNaN(min)) ? min : null;
      }

      if (isSpecialUser) {
        // Para usuarios especiales: solo mostrar placeholder pero sin restricciones
        valorInput.min = '';
        valorInput.max = '';
        valorInput.placeholder = (max != null)
          ? `Min $${(min||0).toLocaleString('es-CO')} – Max $${max.toLocaleString('es-CO')}`
          : '';
        valorInput.readOnly = false;
      } else {
        // Para usuarios normales: aplicar restricciones
        valorInput.min         = (min != null) ? String(min) : '';
        valorInput.max         = (max != null) ? String(max) : '';
        valorInput.placeholder = (max != null)
        ? `Min $${(min||0).toLocaleString('es-CO')} – Max $${max.toLocaleString('es-CO')}`
          : '';

        // Sólo bloquear cuando min === max
        if (min != null && max != null && min === max) {
          valorInput.value = max.toLocaleString('es-CO');
          valorInput.readOnly = true;
        } else {
          valorInput.readOnly = false;
        }
      }
    }

    // ——— Lógica de cuotas/campos 100% dinámica por producto ———
    function handleProductChange() {
      const name = producto.value.trim();
      const meta = productMeta.get(name);
      // Reset UI base
      linkResult.innerHTML = '';
      valorInput.value = '';
      valorInput.readOnly = false;  // desbloquear por si el anterior quedó bloqueado
      // Si no hay metadatos del producto → ocultamos secciones dependientes
      if (!meta) {
        valorInput.placeholder = '';
        valorInput.min = '';
        valorInput.max = '';
       cuotasRow.classList.add('hidden');
        nroAcuerdoRow.classList.add('hidden');
        rowLinkBtn.classList.add('hidden');
        planPagosContainer.classList.add('hidden');
        return;
      }

      // Detectar si el producto contiene "cuota" en el nombre (case-insensitive)
      const esCuotaExtraordinaria = name.toLowerCase().includes('cuota');
      const esCuota1 = name.toLowerCase().includes('cuota 1');

      // Si max_financiacion es null ⇒ NO mostrar el campo "Nro de cuotas"
      const mf = (Object.prototype.hasOwnProperty.call(meta, 'max_financiacion') ? meta.max_financiacion : null);
      if (mf == null) {
        cuotasRow.classList.add('hidden');
        cuotas.innerHTML = '<option value="1" selected>1</option>';
        cuotas.value = '1';
        planPagosContainer.classList.add('hidden');

        // Si contiene "cuota" → mostrar campo nro de acuerdo, inicio y botón
        if (esCuotaExtraordinaria) {
          nroAcuerdoRow.classList.remove('hidden');
          rowLinkBtn.classList.remove('hidden');
          inicioRow.classList.remove('hidden'); // Siempre mostrar inicio para cuotas
          fechaMaxRow.classList.remove('hidden');
          updateCreateButtonText(1);
          updateInicioRange();

          // Configurar rango de fecha máxima
          const today = new Date();
          const minStr = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
          const maxStr = formatLocalDate(new Date(today.getFullYear(), today.getMonth()+1, 0));
          fechaMax.min = minStr;
          fechaMax.max = maxStr;
        } else {
          nroAcuerdoRow.classList.add('hidden');
        }
      } else {
        // Producto con financiación: ocultar nro de acuerdo, mostrar selector de cuotas
        nroAcuerdoRow.classList.add('hidden');
        const maxCuotas = Math.max(1, Number(mf));
        cuotasRow.classList.remove('hidden');
        cuotas.innerHTML = '<option value="" disabled selected>Selecciona la cantidad de cuotas</option>';
        for (let i = 1; i <= maxCuotas; i++) {
          const o = document.createElement('option');
          o.value = i; o.textContent = i;
          cuotas.appendChild(o);
        }
      }
      // Recalcular rango según precio publicitado
      updatePriceRange();
    }

    producto.oninput = handleProductChange;
    producto.onchange = handleProductChange;

    // Buscar inicio plataforma del acuerdo cuando se ingresa número de acuerdo
    let inicioPlataformaAcuerdo = null;
    nroAcuerdoComercialito.addEventListener('blur', async () => {
      const nroAcuerdo = nroAcuerdoComercialito.value.trim();
      if (!nroAcuerdo) {
        inicioPlataformaAcuerdo = null;
        return;
      }

      // Detectar si el producto es Cuota 1
      const productoNombre = producto.value.trim();
      const esCuota1 = productoNombre.toLowerCase().includes('cuota 1');

      try {
        // Buscar en Strapi carteras por nro_acuerdo
        const response = await api.consultarAcuerdo(nroAcuerdo);

        if (response.success && response.data && response.data.fechaInicio) {
          // Obtener fechaInicio del acuerdo
          inicioPlataformaAcuerdo = response.data.fechaInicio;
          console.log('✅ Inicio plataforma del acuerdo:', inicioPlataformaAcuerdo);

          // Si NO es Cuota 1, poblar y bloquear los campos de inicio
          if (!esCuota1) {
            inicioTipo.value = 'fecha-personalizada';
            inicio.value = inicioPlataformaAcuerdo;
            inicio.style.display = 'block';

            // Bloquear los campos para que no se puedan editar
            inicioTipo.disabled = true;
            inicio.disabled = true;
          }
        } else {
          inicioPlataformaAcuerdo = null;
          alert('⚠️ No se encontró el acuerdo o no tiene inicio de plataforma definido');
        }
      } catch (error) {
        console.error('Error buscando acuerdo:', error);
        inicioPlataformaAcuerdo = null;
        alert('❌ Error al buscar el acuerdo: ' + error.message);
      }
    });


    // Referencias a los nuevos campos del modal de lote
    const batchStart = document.getElementById('batchStart');
    const batchDuration = document.getElementById('batchDuration');
    const batchExpiry = document.getElementById('batchExpiry');

    // Variable global para almacenar los planes en el modal de lote
    let batchMembershipPlans = [];

    // Función para cargar planes en el modal de lote
    async function loadBatchMembershipPlans() {
      try {
        const plans = await api.getActiveMembershipPlans();
        batchMembershipPlans = plans;

        batchProduct.innerHTML = '<option value="" disabled selected>Seleccione un plan</option>';

        if (plans && plans.length > 0) {
          plans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = plan.name;
            batchProduct.appendChild(option);
          });
          console.log('✅ Planes de membresía cargados en modal de lote:', plans.length);
        } else {
          batchProduct.innerHTML = '<option value="" disabled selected>No hay planes disponibles</option>';
          console.warn('⚠️ No se encontraron planes de membresía');
        }
      } catch (err) {
        console.error('❌ Error cargando planes en lote:', err);
        batchProduct.innerHTML = '<option value="" disabled selected>Error al cargar planes</option>';
        alert('❌ Error al cargar los planes de membresía. Por favor contacta al administrador.\n\nDetalle: ' + (err.message || err));
      }
    }

    // Funciones de cálculo bidireccional para modal de lote
    function calcularBatchFechaFin() {
      if (!batchStart.value || !batchDuration.value) return;
      const duration = parseInt(batchDuration.value);
      if (duration < 1 || isNaN(duration)) return;
      const start = parseLocalDate(batchStart.value);
      const end = sumarDias(start, duration);
      batchExpiry.value = formatLocalDate(end);
    }

    function calcularBatchDuracion() {
      if (!batchStart.value || !batchExpiry.value) return;
      const start = parseLocalDate(batchStart.value);
      const end = parseLocalDate(batchExpiry.value);
      if (end <= start) {
        batchDuration.value = '';
        return;
      }
      const diffTime = end - start;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      batchDuration.value = diffDays;
    }

    // Listeners para cálculo bidireccional en modal de lote
    batchStart.addEventListener('change', () => {
      if (batchDuration.value) {
        calcularBatchFechaFin();
      } else if (batchExpiry.value) {
        calcularBatchDuracion();
      }
    });
    batchDuration.addEventListener('input', calcularBatchFechaFin);
    batchExpiry.addEventListener('change', calcularBatchDuracion);

    //Modal de membresías en bloque FRAPP
    batchOpenBtn.addEventListener('click', async () => {
      // Limpiar estado visual
      batchCedulas.value = '';
      document.getElementById('batchResultsList').innerHTML = '';
      document.getElementById('batchAddList').innerHTML = '';

      // Cargar planes de membresía y esperar a que termine
      await loadBatchMembershipPlans();

      // Setear fecha de inicio como hoy
      const today = new Date();
      batchStart.value = formatLocalDate(today);

      // Limpiar valores de duración y fecha fin
      batchDuration.value = '';
      batchExpiry.value = '';

      // Mostrar modal
      batchModal.classList.remove('hidden');
    });

    batchCloseBtn.addEventListener('click', () => batchModal.classList.add('hidden'));

    cuotas.onchange = () => {
      updatePriceRange();
      const q = Number(cuotas.value);
      rowLinkBtn.classList.remove('hidden');
      inicioRow.classList.remove('hidden');

      // Update button text and width based on number of installments
      updateCreateButtonText(q);
      // Si es contado mostramos fecha máxima de validez del link, si no, la ocultamos
      if (q === 1) {
        fechaMaxRow.classList.remove('hidden');
        const today = new Date();
        const minStr = formatLocalDate(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
        const maxStr = formatLocalDate(new Date(today.getFullYear(), today.getMonth()+1, 0));
        fechaMax.min = minStr;
        fechaMax.max = maxStr;
      } else {
        fechaMaxRow.classList.add('hidden');
      }
      // Plan de pagos sólo si hay financiación (>1)
      if (q > 1) {
        planPagosContainer.classList.remove('hidden');
        const total = Number(valorInput.value.replace(/\D/g, '')) || 0;
        buildPlanPagos(q, total);
      } else {
        planPagosContainer.classList.add('hidden');
      }
      // Ajustes de rangos y límites para fechas
      updateInicioRange();
      if (q === 1) {
        const t = todayLocal();
        const lastThisMonth = endOfCurrentMonth(t);
        fechaMax.min = formatLocalDate(t);
        fechaMax.max = formatLocalDate(lastThisMonth);
      }
    };

    // Validaciones para Inicio plataforma y Fecha máxima al pegar/escribir
    const validateInicio = () => {
      if (!inicio.value) return;
      const v = parseLocalDate(inicio.value);
      const min = inicio.min ? parseLocalDate(inicio.min) : null;
      const max = inicio.max ? parseLocalDate(inicio.max) : null;
      if ((min && v < min) || (max && v > max)){
        alert('La fecha de Inicio plataforma debe estar entre hoy y hoy + 2 meses.');
        inicio.value = '';
      }
    };
    inicio.addEventListener('input', validateInicio);
    inicio.addEventListener('change', validateInicio);
    const validateFechaMax = () => {
      if (!fechaMax.value) return;
      const v = parseLocalDate(fechaMax.value);
      const max = fechaMax.max ? parseLocalDate(fechaMax.max) : null;
      if (max && v > max){
        alert('La Fecha máxima no puede exceder el último día del mes actual.');
        fechaMax.value = '';
      }
    };
    fechaMax.addEventListener('input', validateFechaMax);
    fechaMax.addEventListener('change', validateFechaMax);

    // si cambia el inicio, rehacer plan (si hay cuotas y total)
    // Eliminado: El campo "Inicio plataforma" no debe afectar las fechas del Plan de pagos

    // si cambia el valor y hay financiación, rehacer plan
    valorInput.addEventListener('input', () => {
      const q = Number(cuotas.value) || 0;
      const total = Number(valorInput.value.replace(/\D/g, '')) || 0;
      if (q > 1 && total) buildPlanPagos(q, total);
    });
        
    function handleValorValidation() {
      const raw = valorInput.value.replace(/\D/g, '');
      if (!raw) return;
      const v   = Number(raw);
      const min = Number(valorInput.min || 0);
      const max = Number(valorInput.max || 0);

      // Usuarios especiales que pueden omitir las restricciones Min/Max
      const specialUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com', 'eliana.montilla@sentiretaller.com'];
      const isSpecialUser = specialUsers.includes(USER_EMAIL);

      if (!isSpecialUser) {
        if (max && (v > max)) {
          alert(`El valor no puede exceder $${max.toLocaleString()}.`);
          valorInput.value = '';
          return;
        }
        if (min && (v < min)) {
          alert(`El valor debe ser al menos $${min.toLocaleString()}.`);
          valorInput.value = '';
          return;
        }
      }

      const q = Number(cuotas.value);
      if (q > 1) buildPlanPagos(q, v);
    }

    valorInput.onblur = handleValorValidation;

    valorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleValorValidation();
      }
    });

    function buildPlanPagos(q, total) {
      // encabezado con columna "Modificar"
      const theadTr = document.querySelector('#planPagosTable').parentElement.querySelector('thead tr');
      theadTr.innerHTML = `
        <th>Nro de cuota</th>
        <th>Fecha</th>
        <th>Valor cuota</th>
        <th>Modificar</th>`;

      // estado base
      planTotal = Number(total)||0;
      const meta = productMeta.get(producto.value.trim());
      const maxCuotasProd = Math.max(1, Number(meta?.max_financiacion || q));
      planIsMaxFin = (q === maxCuotasProd);
      planState = [];

      const today = todayLocal();
      planPreferredDay = today.getDate();
      firstDateModified = false;
      const base = Math.floor(planTotal / q);
      const rem  = planTotal - base * q;

      for (let i = 1; i <= q; i++) {
        const val = base + (i <= rem ? 1 : 0);
        // Todas las cuotas se calculan basándose en la fecha de hoy para cuota 1
        const date = addMonthsAnchored(today, i - 1, planPreferredDay);
        planState.push({
          nro: i,
          date,
          amount: val,
          editable: true // Todas las cuotas son editables (se determina lógica específica en UI)
        });
      }
      
      // Guardar fechas originales para comparación
      originalDates = planState.map(p => new Date(p.date.getTime()));
      
      // En financiamiento no máximo, verificar si cuota 1 es hoy
      if (!planIsMaxFin) {
        const todayStr = formatLocalDate(today);
        const cuota1Str = formatLocalDate(planState[0].date);
        cuota1IsToday = (todayStr === cuota1Str);
      }
      
      repaintPlan();
    }

    function repaintPlan(){
      planPagosTable.innerHTML = '';
      planState.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.dataset.idx = String(idx);
        tr.innerHTML = `
          <td>${r.nro}</td>
          <td class="col-fecha">${r.date.toLocaleDateString('es-CO')}</td>
          <td class="col-valor">${formatCOP(r.amount)}</td>
          <td class="col-edit" style="text-align:center">
            ${r.editable ? '<button class="edit-btn" data-act="edit" title="Editar">✏️</button>' : '🔒'}
          </td>`;
        planPagosTable.appendChild(tr);
      });

      // Actualizar inicio si está configurado como "con primer pago"
      if (inicioTipo.value === 'primer-pago') {
        setInicioFromFirstPayment();
      }
    }

    function sumUntil(i){ let s=0; for(let k=0;k<=i;k++) s += Number(planState[k].amount||0); return s; }
    function distributeFrom(i){
      const used = sumUntil(i);
      const left = planTotal - used;
      const remain = planState.length - (i+1);
      if (remain <= 0) return;
      const base = Math.floor(left / remain);
      const rem  = left - base*remain;
      for (let j=i+1; j<planState.length; j++){
        planState[j].amount = base + (j-(i+1) < rem ? 1 : 0);
      }
    }
    function clampCuota2IfNeeded(){
      if (planState.length < 2) return;
      const max2 = lastDayOfNextMonth(planState[0].date);
      if (planState[1].date > max2) planState[1].date = max2;
    }
    function recalcDatesFrom(i){
      for (let j=i+1; j<planState.length; j++){
        planState[j].date = addMonthsAnchored(planState[j-1].date, 1, planPreferredDay || planState[0].date.getDate());
      }
    }
    
    // Función para determinar si una cuota puede editar su fecha
    function canEditDateForInstallment(idx) {
      if (planIsMaxFin) {
        // Máximo financiamiento: solo cuota 2
        return idx === 1;
      } else {
        // No máximo: cuota 1 siempre puede, las demás solo si cuota 1 es hoy y no hay fechas modificadas
        if (idx === 0) return true;
        
        // Para cuotas 2+: verificar si alguna cuota anterior fue modificada
        for (let i = 0; i < idx; i++) {
          const originalStr = formatLocalDate(originalDates[i]);
          const currentStr = formatLocalDate(planState[i].date);
          if (originalStr !== currentStr) {
            return false; // Alguna cuota anterior fue modificada, bloquear
          }
        }
        
        return cuota1IsToday; // Solo si cuota 1 es hoy
      }
    }

    // Delegación de eventos para editar/guardar/cancelar
    planPagosTable.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const tr = btn.closest('tr');
      const idx = Number(tr.dataset.idx);
      const row = planState[idx];
      if (btn.classList.contains('edit-btn')) {
        const fechaISO = formatLocalDate(row.date);
        
        // Determinar qué campos se pueden editar según las condiciones
        let canEditDate = canEditDateForInstallment(idx);
        let canEditValue = true;
        
        if (planIsMaxFin) {
          // Máximo financiamiento: cuota 1 no puede editar fecha
          if (idx === 0) {
            canEditDate = false;
          }
        }
        
        tr.querySelector('.col-fecha').innerHTML = canEditDate 
          ? `<input type="date" class="inp-fecha" value="${fechaISO}">`
          : row.date.toLocaleDateString('es-CO');
          
        tr.querySelector('.col-valor').innerHTML = canEditValue
          ? `<input type="number" class="inp-valor" min="1" step="1" value="${row.amount}">`
          : formatCOP(row.amount);
          
        tr.querySelector('.col-edit').innerHTML = (canEditDate || canEditValue)
          ? '<button class="save-btn" data-act="save">💾</button> <button class="cancel-btn" data-act="cancel">❌</button>'
          : '🔒';
          
        // Configurar restricciones específicas para inputs
        const inpF = tr.querySelector('.inp-fecha');
        const inpV = tr.querySelector('.inp-valor');
        const tNow = todayLocal();
        
        if (planIsMaxFin) {
          if (idx === 0 && inpV) {
            // Cuota 1: solo puede aumentar valor
            const remain = planState.length - 1;
            const maxAllowed = Math.max(1, planTotal - remain);
            inpV.min = String(row.amount);
            inpV.max = String(maxAllowed);
          }
          if (idx === 1 && inpF) {
            // Cuota 2: fecha entre cuota 1 y último día del siguiente mes
            const minDate = planState[0].date;
            const maxDate = lastDayOfNextMonth(minDate);
            inpF.min = formatLocalDate(minDate);
            inpF.max = formatLocalDate(maxDate);
          }
        } else {
          // Financiamiento no máximo
          if (idx === 0 && inpF) {
            // Cuota 1: fecha entre hoy y hoy + 1 mes
            const maxDate = addMonthsSameDay(tNow, 1);
            inpF.min = formatLocalDate(tNow);
            inpF.max = formatLocalDate(maxDate);
          } else if (idx > 0 && inpF) {
            // Cuotas 2+: máximo hasta el último día del mes siguiente a la cuota anterior
            const maxDate = lastDayOfNextMonth(planState[idx-1].date);
            inpF.max = formatLocalDate(maxDate);
            // Min: no puede ser anterior a la cuota anterior
            if (idx > 0) {
              inpF.min = formatLocalDate(planState[idx-1].date);
            }
          }
        }
      } else if (btn.classList.contains('cancel-btn')) {
        repaintPlan();
      } else if (btn.classList.contains('save-btn')) {
        const inpF = tr.querySelector('.inp-fecha');
        const inpV = tr.querySelector('.inp-valor');
        let needsRepaint = false;
        if (inpF) {
          const d = parseLocalDate(inpF.value);
          if (isNaN(d)) { alert('Fecha inválida'); return; }
          
          if (planIsMaxFin) {
            // Validaciones para máximo financiamiento
            if (idx === 1) {
              // Cuota 2: debe estar entre cuota 1 y último día del siguiente mes
              const minDate = planState[0].date;
              const maxDate = lastDayOfNextMonth(minDate);
              if (d < minDate) { 
                alert('La fecha de la cuota 2 no puede ser anterior a la fecha de la cuota 1.'); 
                return; 
              }
              if (d > maxDate) { 
                alert('La fecha de la cuota 2 no puede superar el último día del mes siguiente a la cuota 1.'); 
                return; 
              }
              // Actualizar el día preferido basado en la cuota 2
              planPreferredDay = d.getDate();
            }
          } else {
            // Validaciones para financiamiento no máximo
            if (idx === 0) {
              const t = todayLocal();
              const max0 = addMonthsSameDay(t, 1);
              if (d < t || d > max0) { 
                alert('La fecha de la cuota 1 debe estar entre hoy y hoy + 1 mes.'); 
                return; 
              }
              firstDateModified = (d.getTime() !== planState[0].date.getTime());
              planPreferredDay = d.getDate();
              
              // Actualizar si cuota 1 es hoy
              const todayStr = formatLocalDate(t);
              const cuota1Str = formatLocalDate(d);
              cuota1IsToday = (todayStr === cuota1Str);
            } else {
              // Cuotas 2+: validar que no superen el límite del mes siguiente
              const maxDate = lastDayOfNextMonth(planState[idx-1].date);
              if (d > maxDate) { 
                alert(`La fecha de la cuota ${idx + 1} no puede superar el último día del mes siguiente a la cuota anterior.`); 
                return; 
              }
              planPreferredDay = d.getDate();
            }
          }
          
          planState[idx].date = d;
          
          // Recalcular fechas siguientes
          if (planIsMaxFin && idx === 1) {
            recalcDatesFrom(idx);
          } else {
            recalcDatesFrom(idx);
            if (idx === 0) clampCuota2IfNeeded();
          }
          
          // Marcar que necesitamos repintar después para financiamiento no máximo
          needsRepaint = !planIsMaxFin;
        }
        if (inpV) {
          const v = Math.floor(Number(inpV.value||0));
          if (v <= 0) { alert('El valor debe ser mayor que 0.'); return; }
          
          // Validación especial para cuota 1 en máximo financiamiento
          if (idx === 0 && planIsMaxFin) {
            const originalAmount = planState[0].amount;
            if (v < originalAmount) {
              alert('Solo puedes aumentar el valor de la primera cuota, no disminuirla. El valor original era: ' + formatCOP(originalAmount));
              return;
            }
            const remain = planState.length - 1;
            const maxAllowed = Math.max(1, planTotal - remain);
            if (v > maxAllowed) {
              alert('El valor de la cuota 1 no puede exceder: ' + formatCOP(maxAllowed));
              return;
            }
          }
          
          if (idx === planState.length - 1) {
            const prev = sumUntil(idx-1);
            if (prev + v !== planTotal) {
              alert('La suma total no coincide con el valor del producto.');
              return;
            }
            planState[idx].amount = v;
          } else {
            planState[idx].amount = v;
            distributeFrom(idx);
          }
        }
        
        // Repintar: con delay para no máximo si es necesario, inmediato en otros casos
        if (needsRepaint) {
          setTimeout(() => {
            repaintPlan();
            // Actualizar inicio si está configurado como "con primer pago"
            if (inicioTipo.value === 'primer-pago') {
              setInicioFromFirstPayment();
            }
          }, 10);
        } else {
          repaintPlan();
          // Actualizar inicio si está configurado como "con primer pago"
          if (inicioTipo.value === 'primer-pago') {
            setInicioFromFirstPayment();
          }
        }
      }
    });

    // Fetch all data with failure handlers
    function fetchAllData(uid) {
      if (typeof window.CURRENT_FETCH_SEQ === 'undefined') window.CURRENT_FETCH_SEQ = 0;
      const mySeq = ++window.CURRENT_FETCH_SEQ;   // marca esta búsqueda como la "actual"
      statusTop.textContent = 'Cargando datos…';
      setMembNewLoading('Cargando…');
      setSearching(true);
      // 👉 Devuelve una Promesa para permitir .then/.catch/.finally
      return new Promise((resolve) => {
        // contador dinámico + watchdog para liberar UI ante timeouts/errores 500
        let finished = false;
        let pending  = 0;
        const pendingQueries = new Set(); // Track which queries are still pending

        const inc = (queryName) => {
          pending++;
          pendingQueries.add(queryName);
        };

        const finish = () => {
          if (finished) return;
          finished = true;
          clearTimeout(watchdog);

          // Mostrar resumen de errores y limpiar mensaje
          logLoadingSummary();
          statusTop.textContent = '';

          setSearching(false);
          resolve();
        };

        const done = (queryName) => {
          if (mySeq !== window.CURRENT_FETCH_SEQ || finished) return;
          pendingQueries.delete(queryName);
          if (--pending <= 0) finish();
        };

        // si algo queda colgado (p.ej. HTTP 500 que no retorna), soltamos el botón
        const watchdog = setTimeout(() => {
          console.warn('⏱️ fetchAllData: timeout de seguridad (20s), liberando UI');

          // Log detailed timeout info
          if (pendingQueries.size > 0) {
            const pendingList = Array.from(pendingQueries).join(', ');
            console.error(`❌ Consultas que no respondieron a tiempo: ${pendingList}`);
            trackLoadingError('timeout', `Consultas sin respuesta: ${pendingList}`);
          } else {
            trackLoadingError('timeout', 'Timeout general del sistema');
          }

          finish();
        }, 20000);

      // === 1) Ciudadano ===
      inc('Datos ciudadano');
      api.getCitizenServer(uid)
        .then((r) => {
          try {
            nombres.value = r.nombres || '';
            apellidos.value = r.apellidos || '';
            nombres.disabled = true;
            apellidos.disabled = true;

            // Mostrar iconos de copiar
            updateCopyIconVisibility('nombres');
            updateCopyIconVisibility('apellidos');

            // También llenar campos de Venta en confianza
            const nombresConfianza = document.getElementById('nombresConfianza');
            const apellidosConfianza = document.getElementById('apellidosConfianza');

            nombresConfianza.value = r.nombres || '';
            apellidosConfianza.value = r.apellidos || '';

            // Deshabilitar y aplicar estilo gray
            if (nombresConfianza.value) { nombresConfianza.disabled = true; nombresConfianza.classList.add('gray'); }
            if (apellidosConfianza.value) { apellidosConfianza.disabled = true; apellidosConfianza.classList.add('gray'); }

          } finally { done('Datos ciudadano'); }
        })
        .catch(err => {
          try {
            console.error('getCitizenServer error', err);
            trackLoadingError('Datos ciudadano', err);
          } finally { done('Datos ciudadano'); }
        });

      // === 2) CRM (Strapi solo) ===
      inc('CRM Strapi');
      api.fetchCrmStrapiOnly(uid)
        .then(strapi => {
          try {
            if (strapi && (strapi.correo || strapi.celular)) {
              correo.value  = strapi.correo  || '';
              celular.value = strapi.celular || '';
              if (strapi.correo)  correo.disabled = true;
              if (strapi.celular) celular.disabled = true;

              // Mostrar iconos de copiar
              updateCopyIconVisibility('correo');
              updateCopyIconVisibility('celular');
              updateEditCelularButtonVisibility();

              // Verificar callbell después de llenar el campo celular
              if (celular.value) checkCallbellAvailability();

              // También llenar campos de Venta en confianza
              const correoConfianza = document.getElementById('correoConfianza');
              const celularConfianza = document.getElementById('celularConfianza');

              // Poblar campos automáticamente desde Strapi (campos siempre bloqueados)
              correoConfianza.value = strapi.correo || '';
              celularConfianza.value = strapi.celular || '';

              // Asegurar que siempre estén de solo lectura
              correoConfianza.readOnly = true;
              celularConfianza.readOnly = true;

              // Actualizar tooltip si se poblaron datos
              if (strapi.correo) {
                correoConfianza.title = 'Campo automático: datos del CRM';
              }
              if (strapi.celular) {
                celularConfianza.title = 'Campo automático: datos del CRM';
              }
            }
          } finally { done('CRM Strapi'); }
        })
        .catch(err => {
          try {
            console.warn('Error cargando CRM (solo Strapi):', err);
            trackLoadingError('CRM Strapi', err);
          }
          finally { done('CRM Strapi'); }
        });

      // === 3) Sincronizador CRM ===
      inc('Sincronización CRM');
      api.sincronizarCrmPorNumeroDocumento(uid)
        .then(res => {
          try {
            if (res.estado === 'error') {
              console.warn('Error al sincronizar CRM:', res.mensaje);
              return;
            }
            const rec = res.datos?.data || res.datos || {};
            const att = rec.attributes   || rec;
            if (att.correo)  { correo.value = att.correo;   correo.disabled = true; }
            if (att.celular) { celular.value = att.celular; celular.disabled = true; }

            // Mostrar iconos de copiar
            if (att.correo) updateCopyIconVisibility('correo');
            if (att.celular) updateCopyIconVisibility('celular');

            // Verificar callbell después de llenar el campo celular
            if (att.celular) checkCallbellAvailability();

            // También llenar campos de Venta en confianza (campos siempre bloqueados)
            const correoConfianza = document.getElementById('correoConfianza');
            const celularConfianza = document.getElementById('celularConfianza');

            correoConfianza.value = att.correo || '';
            celularConfianza.value = att.celular || '';

            // Asegurar que siempre estén de solo lectura
            correoConfianza.readOnly = true;
            celularConfianza.readOnly = true;

            // Actualizar tooltip si se poblaron datos
            if (att.correo) {
              correoConfianza.title = 'Campo automático: datos del CRM sincronizado';
            }
            if (att.celular) {
              celularConfianza.title = 'Campo automático: datos del CRM sincronizado';
            }
          } finally { done('Sincronización CRM'); }
        })
        .catch(err => {
          try {
            console.error('sincronizarCrmPorNumeroDocumento falló:', err);
            trackLoadingError('Sincronización CRM', err);
          }
          finally { done('Sincronización CRM'); }
        });

      // === 4) Membresías (plataforma vieja) ===
      inc('Membresías vieja');
      api.traerMembresiasServer(uid)
        .then(data => {
          try {
            renderMembOld(data);
          } finally { done('Membresías vieja'); }
        })
        .catch(err => {
          try {
            console.error('traerMembresiasServer error', err);
            document.getElementById('membOldContainer').innerHTML =
              '<p>❌ Error al cargar membresías viejas</p>';
            trackLoadingError('Membresías vieja', err);
          } finally { done('Membresías vieja'); }
        });

      // === 5) Membresías (FRAPP / plataforma nueva) ===
      inc('Membresías FRAPP');
      api.fetchMembresiasFRAPP(uid)
        .then(res => {
          try {
            renderMembFRAPP(res);
          } finally { done('Membresías FRAPP'); }
        })
        .catch(err => {
          try {
            console.error('fetchMembresiasFRAPP error', err);
            document.getElementById('membNewContainer').innerHTML =
              '<p>❌ Error al cargar membresías nuevas</p>';
            trackLoadingError('Membresías FRAPP', err);
          } finally { done('Membresías FRAPP'); }
        });

      // === 6) Ventas y 7) Acuerdos - Carga coordinada ===
      // Acuerdos necesita que Ventas termine primero para validar correctamente
      inc('Ventas');
      let ventasDataLoaded = false;
      let acuerdosDataLoaded = false;
      let acuerdosDataCache = null;

      const maybeRenderAcuerdos = () => {
        if (ventasDataLoaded && acuerdosDataLoaded && acuerdosDataCache) {
          try {
            renderAcuerdos(acuerdosDataCache);
          } catch(e) {
            console.error('renderAcuerdos error tras carga coordinada:', e);
          } finally {
            done('Acuerdos');
          }
        }
      };

      api.fetchVentas(uid)
        .then(res => {
          try {
            renderVentas(res);
            ventasDataLoaded = true;
            maybeRenderAcuerdos(); // Intentar renderizar Acuerdos si ya llegó
          } finally { done('Ventas'); }
        })
        .catch(err => {
          try {
            console.error('fetchFacturacion error', err);
            document.getElementById('ventasContainer').innerHTML =
              '<p>❌ Error al cargar facturación</p>';
            trackLoadingError('Ventas', err);
            ventasDataLoaded = true;
            maybeRenderAcuerdos(); // Intentar de todas formas
          } finally { done('Ventas'); }
        });

      // === 7) Acuerdos ===
      inc('Acuerdos');
      api.fetchAcuerdos(uid)
        .then((data) => {
          acuerdosDataCache = data;
          window.currentAcuerdosData = data; // Guardar globalmente para editor de celular
          acuerdosDataLoaded = true;
          maybeRenderAcuerdos(); // Intentar renderizar si Ventas ya terminó
        })
        .catch(err => {
          try {
            console.error('fetchCartera error', err);
            trackLoadingError('Acuerdos', err);
            acuerdosDataCache = [];
            acuerdosDataLoaded = true;
            maybeRenderAcuerdos(); // Renderizar vacío
          } catch(e) {
            console.error('Error en failureHandler de Acuerdos:', e);
          }
        });

      // === 8) Links ===
      inc('Links');
      api.getLinksByIdentityDocument(uid)
        .then(res => {
          try {
            window.currentLinksData = res; // Guardar globalmente para editor de celular
            renderLinks(res);
          } finally { done('Links'); }
        })
        .catch(err => {
          try {
            console.error('getLinksByIdentityDocument error', err);
            document.getElementById('linksContainer').innerHTML =
              '<p>❌ Error al cargar links</p>';
            trackLoadingError('Links', err);
          } finally { done('Links'); }
        });

    // Por si (muy raro) no se llegó a incrementar nada:
        if (pending === 0) finish();
      });
    }


    function renderVentas(data) {
      const c = document.getElementById('ventasContainer');
      c.innerHTML = '';
      c.style.display = 'block';

      // sin datos - mostrar botón de reportar venta CC de todas formas
      if (!Array.isArray(data) || data.length === 0) {
        // Crear contenedor de controles con el botón de reportar
        const controlsSinVentas = document.createElement('div');
        controlsSinVentas.style.display = 'flex';
        controlsSinVentas.style.alignItems = 'center';
        controlsSinVentas.style.gap = '8px';
        controlsSinVentas.style.marginBottom = '12px';

        const btnReportarCCSinVentas = document.createElement('button');
        btnReportarCCSinVentas.innerHTML = '💴 <span>Reportar venta en cuenta corriente</span>';
        btnReportarCCSinVentas.className = 'btn-refresh-orange';
        btnReportarCCSinVentas.addEventListener('click', () => {
          const datosEstudiante = {
            cedula: searchId.value.replace(/\D/g, ''),
            nombres: nombres.value || '',
            apellidos: apellidos.value || '',
            celular: celular.value || '',
            correo: correo.value || ''
          };
          if (typeof window.abrirReportarVentaCC === 'function') {
            window.abrirReportarVentaCC(datosEstudiante);
          } else {
            alert('Error: módulo de reportar venta no cargado');
          }
        });
        controlsSinVentas.appendChild(btnReportarCCSinVentas);

        c.appendChild(controlsSinVentas);
        c.appendChild(document.createTextNode(''));
        const msgNoVentas = document.createElement('p');
        msgNoVentas.textContent = 'No hay ventas para mostrar.';
        c.appendChild(msgNoVentas);
        return;
      }

      // helper fecha d/m/yyyy sin zona horaria
      const fmt = (iso) => {
        if (!iso) return '';
        const [y,m,d] = iso.split('-');
        return `${Number(d)}/${Number(m)}/${y}`;
      };

      // ordenar por fecha (más reciente primero)
      const ordered = [...data].sort((a,b) => new Date(b.fecha) - new Date(a.fecha));
      const recent  = ordered[0];

      // ====== Resumen superior
      const resumen = document.createElement('div');
      resumen.className = 'summary';
      resumen.style.marginBottom = '12px';
      resumen.style.display = 'flex';
      resumen.style.alignItems = 'center';
      resumen.style.gap = '24px';

      const leftBlock = document.createElement('div');
      leftBlock.style.display = 'flex';
      leftBlock.style.flexDirection = 'column';
      leftBlock.innerHTML =
        `<div><strong>${(recent.nombres||'')} ${(recent.apellidos||'')}</strong></div>` +
        `<div><strong>${recent.telefono||''}</strong></div>` +
        `<div><strong>${recent.correo||''}</strong></div>`;
      resumen.appendChild(leftBlock);

      // controles + botón refrescar con spinner
      const controls = document.createElement('div');
      controls.id = 'ventasControls';
      controls.style.display = 'flex';
      controls.style.alignItems = 'center';
      controls.style.gap = '8px';

      // inyecta keyframes una vez
      (function ensureSpinnerCSS(){
        if (!document.getElementById('spinKeyframes')) {
          const st = document.createElement('style');
          st.id = 'spinKeyframes';
          st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
          document.head.appendChild(st);
        }
      })();

      const btn = document.createElement('button');
      const origHTMLV = `🔄 <span>Actualizar ventas</span>`;
      btn.innerHTML = origHTMLV;
      btn.className = 'btn-refresh-orange';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.classList.add('loading');
        btn.innerHTML = `<span class="spinner"></span><span>Actualizando…</span>`;

        const uid = searchId.value.replace(/\D/g,'');
        api.fetchVentas(uid)
          .then(newData => {
            renderVentas(newData);
            const msg = document.createElement('span');
            msg.className = 'refresh-msg';
            msg.style.color = '#666';
            msg.textContent = 'Ventas actualizadas correctamente';
            controls.appendChild(msg);
            setTimeout(() => controls.removeChild(msg), 5000);
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.innerHTML = origHTMLV;
          })
          .catch(err => {
            console.error('Error al refrescar ventas', err);
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.innerHTML = origHTMLV;
          });
      });
      controls.appendChild(btn);

      // Botón Reportar Venta en Cuenta Corriente
      const btnReportarCC = document.createElement('button');
      btnReportarCC.innerHTML = '💴 <span>Reportar venta en cuenta corriente</span>';
      btnReportarCC.className = 'btn-refresh-orange';
      btnReportarCC.style.marginLeft = '8px';
      btnReportarCC.addEventListener('click', () => {
        // Obtener datos del estudiante actual
        const datosEstudiante = {
          cedula: searchId.value.replace(/\D/g, ''),
          nombres: nombres.value || '',
          apellidos: apellidos.value || '',
          celular: celular.value || '',
          correo: correo.value || ''
        };
        if (typeof window.abrirReportarVentaCC === 'function') {
          window.abrirReportarVentaCC(datosEstudiante);
        } else {
          alert('Error: módulo de reportar venta no cargado');
        }
      });
      controls.appendChild(btnReportarCC);

      resumen.appendChild(controls);
      c.appendChild(resumen);

      // ====== Tabla (encabezados solicitados)
      let html = '<table><thead><tr>' +
        '<th>Fecha</th>' +
        '<th>Transacción</th>' +
        '<th>Comercial</th>' +
        '<th>Producto</th>' +
        '<th>Recaudo</th>' +
        '<th>Fecha inicio</th>' +
        '<th>Paz y salvo</th>' +
        '<th>Acuerdo</th>' +
        '<th>Marca</th>' +
        '<th>Sub categoría</th>' +
        '<th>Categoria</th>' +
        '<th>Acciones</th>' +
        '</tr></thead><tbody>';

      ordered.forEach(item => {
        const fecha       = fmt(item.fecha);
        const transaccion = item.transaccion || '';
        const comercial   = (item.comercial?.nombre || '').split(' ')[0] || '';
        const producto    = item.producto?.nombre || '';
        const recaudo     = item.valor_neto != null ? Number(item.valor_neto).toLocaleString('es-CO') : '';
        const fechaIni    = fmt(item.fecha_inicio);
        const paz         = item.paz_y_salvo || '';
        const acuerdo     = item.acuerdo || '';
        const marca       = item.producto?.marca || '';
        const subcat      = item.producto?.sub_categoria || '';
        const categoria   = item.producto?.categoria || '';

        // Pintar solo si: Categoria === "Élite" Y Paz y salvo === "Si"
        const isPaz   = String(paz).trim().toLowerCase() === 'si';
        const isElite = String(categoria||'')
                          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                          .toLowerCase() === 'elite';
        const rowClass = (isElite && isPaz) ? ' class="highlight"' : '';
        html += `<tr${rowClass} data-document-id="${item.documentId || ''}" data-comercial-id="${item.comercial?.id || ''}" data-comercial-nombre="${item.comercial?.nombre || ''}" data-producto-id="${item.producto?.id || ''}" data-valor-neto="${item.valor_neto || ''}">` +
          `<td class="col-fecha" data-raw="${item.fecha || ''}">${fecha}</td>` +
          `<td class="col-transaccion">${transaccion}</td>` +
          `<td class="col-comercial">${comercial}</td>` +
          `<td class="col-producto" data-raw="${item.producto?.nombre || ''}">${producto}</td>` +
          `<td class="col-recaudo" data-raw="${item.valor_neto || ''}">${recaudo}</td>` +
          `<td class="col-fecha-ini" data-raw="${item.fecha_inicio || ''}">${fechaIni}</td>` +
          `<td class="col-paz">${paz}</td>` +
          `<td class="col-acuerdo">${acuerdo}</td>` +
          `<td class="col-marca">${marca}</td>` +
          `<td class="col-subcat">${subcat}</td>` +
          `<td class="col-categoria">${categoria}</td>` +
          `<td class="col-edit-venta" style="text-align:center"><button class="edit-venta-btn" title="Editar venta">✏️</button></td>` +
        `</tr>`;
      });

      html += '</tbody></table>';
      const tableWrapper = document.createElement('div');
      tableWrapper.innerHTML = html;
      c.appendChild(tableWrapper);

      // ====== Event delegation para editar ventas inline ======
      const ventasTable = tableWrapper.querySelector('table');
      if (ventasTable) {
        // Guardar valores originales para restaurar al cancelar
        let originalValues = {};

        ventasTable.addEventListener('click', async (e) => {
          const btn = e.target.closest('button');
          if (!btn) return;

          const tr = btn.closest('tr');
          const documentId = tr.dataset.documentId;
          const currentComercialId = tr.dataset.comercialId;
          const currentComercialNombre = tr.dataset.comercialNombre;

          // Verificar permisos del usuario
          const allowedUsers = [
            'daniel.cardona@sentiretaller.com',
            'alex.lopez@sentiretaller.com',
            'yicela.agudelo@sentiretaller.com',
            'ana.quintero@sentiretaller.com'
          ];

          const userEmail = USER_EMAIL || '';
          const isDaniel = userEmail.toLowerCase() === 'daniel.cardona@sentiretaller.com';

          if (!allowedUsers.includes(userEmail.toLowerCase())) {
            alert('⚠️ No tienes permisos para editar ventas.');
            return;
          }

          if (btn.classList.contains('edit-venta-btn')) {
            // ====== MODO EDICIÓN ======
            if (!documentId) {
              alert('⚠️ No se pudo obtener el ID del registro');
              return;
            }

            // Deshabilitar otros botones de edición mientras se edita
            ventasTable.querySelectorAll('.edit-venta-btn').forEach(b => b.disabled = true);

            // Guardar valores originales
            originalValues = {
              fecha: tr.querySelector('.col-fecha').dataset.raw || '',
              fechaDisplay: tr.querySelector('.col-fecha').textContent,
              transaccion: tr.querySelector('.col-transaccion').textContent,
              comercialId: currentComercialId,
              comercialNombre: currentComercialNombre,
              productoId: tr.dataset.productoId || '',
              productoNombre: tr.querySelector('.col-producto').textContent,
              recaudo: tr.querySelector('.col-recaudo').dataset.raw || '',
              recaudoDisplay: tr.querySelector('.col-recaudo').textContent,
              fechaIni: tr.querySelector('.col-fecha-ini').dataset.raw || '',
              fechaIniDisplay: tr.querySelector('.col-fecha-ini').textContent,
              paz: tr.querySelector('.col-paz').textContent,
              acuerdo: tr.querySelector('.col-acuerdo').textContent
            };

            try {
              // Fetch comerciales (y productos si es Daniel)
              const comerciales = await api.getComerciales();
              let productos = [];
              if (isDaniel) {
                productos = await api.getProductosCatalog();
              }

              if (!comerciales || comerciales.length === 0) {
                alert('❌ No hay comerciales disponibles');
                ventasTable.querySelectorAll('.edit-venta-btn').forEach(b => b.disabled = false);
                return;
              }

              // Crear select con comerciales
              let selectHTML = '<select class="inp-comercial" style="width:100%; padding:4px;">';
              comerciales.forEach(com => {
                const selected = String(com.id) === String(currentComercialId) ? ' selected' : '';
                selectHTML += `<option value="${com.id}"${selected}>${com.nombre || 'Comercial ' + com.id}</option>`;
              });
              selectHTML += '</select>';
              tr.querySelector('.col-comercial').innerHTML = selectHTML;

              // Si es Daniel, habilitar edición de todos los campos
              if (isDaniel) {
                // Fecha (date input)
                tr.querySelector('.col-fecha').innerHTML = `<input type="date" class="inp-fecha" value="${originalValues.fecha}" style="width:100%; padding:2px;">`;

                // Transacción (text input)
                tr.querySelector('.col-transaccion').innerHTML = `<input type="text" class="inp-transaccion" value="${originalValues.transaccion}" style="width:100%; padding:2px;">`;

                // Producto (select)
                let productoSelectHTML = '<select class="inp-producto" style="width:100%; padding:2px;">';
                productoSelectHTML += '<option value="">(Sin producto)</option>';
                productos.forEach(prod => {
                  const selected = String(prod.id) === String(originalValues.productoId) ? ' selected' : '';
                  productoSelectHTML += `<option value="${prod.id}"${selected}>${prod.nombre}</option>`;
                });
                productoSelectHTML += '</select>';
                tr.querySelector('.col-producto').innerHTML = productoSelectHTML;

                // Recaudo/Valor neto (number input)
                tr.querySelector('.col-recaudo').innerHTML = `<input type="number" class="inp-recaudo" value="${originalValues.recaudo}" style="width:80px; padding:2px;">`;

                // Fecha inicio (date input)
                tr.querySelector('.col-fecha-ini').innerHTML = `<input type="date" class="inp-fecha-ini" value="${originalValues.fechaIni}" style="width:100%; padding:2px;">`;

                // Paz y salvo (select)
                const pazOptions = ['', 'Si', 'No'];
                let pazSelectHTML = '<select class="inp-paz" style="width:100%; padding:2px;">';
                pazOptions.forEach(opt => {
                  const selected = opt === originalValues.paz ? ' selected' : '';
                  pazSelectHTML += `<option value="${opt}"${selected}>${opt || '(vacío)'}</option>`;
                });
                pazSelectHTML += '</select>';
                tr.querySelector('.col-paz').innerHTML = pazSelectHTML;

                // Acuerdo (text input)
                tr.querySelector('.col-acuerdo').innerHTML = `<input type="text" class="inp-acuerdo" value="${originalValues.acuerdo}" style="width:100%; padding:2px;">`;
              }

              // Cambiar botón a guardar/cancelar
              tr.querySelector('.col-edit-venta').innerHTML =
                '<button class="save-venta-btn" title="Guardar">💾</button> ' +
                '<button class="cancel-venta-btn" title="Cancelar">❌</button>';

            } catch (error) {
              console.error('❌ Error al cargar comerciales:', error);
              alert('❌ Error al cargar la lista de comerciales');
              ventasTable.querySelectorAll('.edit-venta-btn').forEach(b => b.disabled = false);
            }

          } else if (btn.classList.contains('save-venta-btn')) {
            // ====== GUARDAR CAMBIOS ======
            const selectComercial = tr.querySelector('.inp-comercial');
            const nuevoComercialId = selectComercial?.value;

            // Recopilar todos los valores (para Daniel incluye más campos)
            const updateData = {
              comercial: nuevoComercialId
            };

            if (isDaniel) {
              const inpFecha = tr.querySelector('.inp-fecha');
              const inpTransaccion = tr.querySelector('.inp-transaccion');
              const inpProducto = tr.querySelector('.inp-producto');
              const inpRecaudo = tr.querySelector('.inp-recaudo');
              const inpFechaIni = tr.querySelector('.inp-fecha-ini');
              const inpPaz = tr.querySelector('.inp-paz');
              const inpAcuerdo = tr.querySelector('.inp-acuerdo');

              if (inpFecha) updateData.fecha = inpFecha.value;
              if (inpTransaccion) updateData.transaccion = inpTransaccion.value;
              if (inpProducto) updateData.producto = inpProducto.value || null;
              if (inpRecaudo) updateData.valor_neto = parseFloat(inpRecaudo.value) || 0;
              if (inpFechaIni) updateData.fecha_inicio = inpFechaIni.value;
              if (inpPaz) updateData.paz_y_salvo = inpPaz.value;
              if (inpAcuerdo) updateData.acuerdo = inpAcuerdo.value;
            }

            // Deshabilitar controles durante guardado
            tr.querySelectorAll('input, select').forEach(el => el.disabled = true);
            btn.disabled = true;
            tr.querySelector('.cancel-venta-btn').disabled = true;

            try {
              let result;

              if (isDaniel) {
                // Daniel puede actualizar todos los campos
                result = await api.updateFacturacion(documentId, updateData);
              } else {
                // Otros usuarios solo pueden cambiar el comercial
                if (String(nuevoComercialId) === String(currentComercialId)) {
                  // No hubo cambios, restaurar
                  restoreVentaRow(tr, originalValues, isDaniel);
                  ventasTable.querySelectorAll('.edit-venta-btn').forEach(b => b.disabled = false);
                  return;
                }
                result = await api.updateVentaComercial(documentId, nuevoComercialId);
              }

              if (result.success) {
                // Obtener el nombre del nuevo comercial
                const nuevoComercialNombre = selectComercial.options[selectComercial.selectedIndex].text;

                // Actualizar data attributes
                tr.dataset.comercialId = nuevoComercialId;
                tr.dataset.comercialNombre = nuevoComercialNombre;

                // Restaurar vista con nuevos valores
                tr.querySelector('.col-comercial').textContent = nuevoComercialNombre.split(' ')[0];

                if (isDaniel) {
                  const newFecha = updateData.fecha || '';
                  const newRecaudo = updateData.valor_neto || 0;
                  const newFechaIni = updateData.fecha_inicio || '';

                  tr.querySelector('.col-fecha').textContent = newFecha ? fmt(newFecha) : '';
                  tr.querySelector('.col-fecha').dataset.raw = newFecha;
                  tr.querySelector('.col-transaccion').textContent = updateData.transaccion || '';

                  // Producto - obtener nombre del select
                  const selectProducto = tr.querySelector('.inp-producto');
                  if (selectProducto) {
                    const nuevoProductoNombre = selectProducto.options[selectProducto.selectedIndex]?.text || '';
                    const nuevoProductoId = selectProducto.value || '';
                    tr.querySelector('.col-producto').textContent = nuevoProductoNombre === '(Sin producto)' ? '' : nuevoProductoNombre;
                    tr.dataset.productoId = nuevoProductoId;
                  }

                  tr.querySelector('.col-recaudo').textContent = newRecaudo ? Number(newRecaudo).toLocaleString('es-CO') : '';
                  tr.querySelector('.col-recaudo').dataset.raw = newRecaudo;
                  tr.querySelector('.col-fecha-ini').textContent = newFechaIni ? fmt(newFechaIni) : '';
                  tr.querySelector('.col-fecha-ini').dataset.raw = newFechaIni;
                  tr.querySelector('.col-paz').textContent = updateData.paz_y_salvo || '';
                  tr.querySelector('.col-acuerdo').textContent = updateData.acuerdo || '';
                }

                tr.querySelector('.col-edit-venta').innerHTML = '<button class="edit-venta-btn" title="Editar venta">✏️</button>';

                // Mostrar mensaje temporal de éxito
                const colComercial = tr.querySelector('.col-comercial');
                const originalText = colComercial.textContent;
                colComercial.innerHTML = '✅ ' + originalText;
                setTimeout(() => {
                  colComercial.textContent = originalText;
                }, 2000);

              } else {
                alert(`❌ Error al actualizar: ${result.error || 'Error desconocido'}`);
                restoreVentaRow(tr, originalValues, isDaniel);
              }

            } catch (error) {
              console.error('❌ Error al actualizar:', error);
              alert(`❌ Error de conexión: ${error.message}`);
              restoreVentaRow(tr, originalValues, isDaniel);
            } finally {
              ventasTable.querySelectorAll('.edit-venta-btn').forEach(b => b.disabled = false);
            }

          } else if (btn.classList.contains('cancel-venta-btn')) {
            // ====== CANCELAR EDICIÓN ======
            restoreVentaRow(tr, originalValues, isDaniel);
            ventasTable.querySelectorAll('.edit-venta-btn').forEach(b => b.disabled = false);
          }
        });

        // Función auxiliar para restaurar la fila
        function restoreVentaRow(tr, orig, isDaniel) {
          tr.querySelector('.col-comercial').textContent = (orig.comercialNombre || '').split(' ')[0];
          if (isDaniel) {
            tr.querySelector('.col-fecha').textContent = orig.fechaDisplay;
            tr.querySelector('.col-fecha').dataset.raw = orig.fecha;
            tr.querySelector('.col-transaccion').textContent = orig.transaccion;
            tr.querySelector('.col-producto').textContent = orig.productoNombre;
            tr.dataset.productoId = orig.productoId;
            tr.querySelector('.col-recaudo').textContent = orig.recaudoDisplay;
            tr.querySelector('.col-recaudo').dataset.raw = orig.recaudo;
            tr.querySelector('.col-fecha-ini').textContent = orig.fechaIniDisplay;
            tr.querySelector('.col-fecha-ini').dataset.raw = orig.fechaIni;
            tr.querySelector('.col-paz').textContent = orig.paz;
            tr.querySelector('.col-acuerdo').textContent = orig.acuerdo;
          }
          tr.querySelector('.col-edit-venta').innerHTML = '<button class="edit-venta-btn" title="Editar venta">✏️</button>';
        }
      }

      // ====== Guardamos matriz para análisis (ahora con "Categoria" al final):
      // ['Año','Mes','Día','Transacción','Comercial','Producto','Valor neto','Fecha inicio','Paz y salvo','Acuerdo','Valor acordado','Acuerdo firmado?','Ya sumó en confianza?','Venta','Marca','Sub categoría','Categoria']
      lastFactRows = ordered.map(it => {
        const [y,m,d] = (it.fecha || '').split('-').map(Number);
        return [
          y || '',                         // Año
          m || '',                         // Mes
          d || '',                         // Día
          it.transaccion || '',            // Transacción
          (it.comercial?.nombre||'').split(' ')[0] || '', // Comercial
          it.producto?.nombre || '',       // Producto
          it.valor_neto || 0,              // Valor neto
          it.fecha_inicio || '',           // Fecha inicio
          it.paz_y_salvo || '',            // Paz y salvo
          it.acuerdo || '',                // Acuerdo
          '',                              // Valor acordado (no viene)
          '',                              // Acuerdo firmado? (no viene)
          '',                              // Ya sumó en confianza? (no viene)
          '',                              // Venta (no viene)
          it.producto?.marca || '',        // Marca
          it.producto?.sub_categoria || '', // Sub categoría
          it.producto?.categoria || ''     // Categoria
        ];
      });

      calcularAnalisis();
    }

    // Normaliza roles/product handle a "Title Case" reemplazando - y _ por espacios
    function roleToLabel(role) {
      if (!role) return '';
      return String(role)
        .replace(/[_-]+/g, ' ')
        .trim()
        .split(/\s+/)
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }


    function renderAcuerdos(data) {
      const c = document.getElementById('acuerdosContainer');
      c.style.display = 'block';
      c.innerHTML = '';

      // — Botón refrescar + bloque de datos juntos en una misma fila —
      const controls = document.createElement('div');
      controls.id = 'acuerdosControls';
      controls.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:12px';
      c.appendChild(controls);

      // ===== Resumen (tomando registro con fecha_límite más alta) =====
      const valid = (Array.isArray(data) ? data : []).filter(r => r.fecha_limite && r.fecha_limite !== '1970-01-01');
      valid.sort((a,b)=> new Date(b.fecha_limite) - new Date(a.fecha_limite));
      const recInfo = valid[0] || data[0] || {};

      const resumen = document.createElement('div');
      resumen.className = 'summary';
      resumen.style.cssText = 'display:flex; flex-direction:column; gap:2px; margin-right:12px;';
      resumen.innerHTML = `
        <div><strong>${(recInfo.nombres||'')} ${(recInfo.apellidos||'')}</strong></div>
        <div><strong>${recInfo.celular||''}</strong></div>
        <div><strong>${recInfo.correo||''}</strong></div>
      `;  

      (function ensureSpinnerCSS(){
        if (!document.getElementById('spinKeyframes')) {
          const st = document.createElement('style');
          st.id = 'spinKeyframes';
          st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
          document.head.appendChild(st);
        }
      })();

      const btn = document.createElement('button');
      btn.className = 'btn-refresh';
      const origHTML = `🔄 <span>Actualizar acuerdos</span>`;
      btn.innerHTML = origHTML;
      controls.appendChild(resumen);      // datos a la izquierda
      controls.appendChild(btn);          // botón a la derecha

      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.classList.add('loading');
        btn.innerHTML = `<span class="spinner"></span><span>Actualizando…</span>`;

        const uid = searchId.value.replace(/\D/g,'');
        let ventasOK = false;
        let acuerdosOK = false;
        let acuerdosData = null;
        const maybeFinish = () => {
          if (ventasOK && acuerdosOK) {
            // cuando ambos regresen, ya tenemos lastFactRows nuevo
            try { renderAcuerdos(acuerdosData); } catch(e){ console.error('renderAcuerdos error tras refresh doble:', e); }
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.innerHTML = origHTML;
          }
        };

        // 1) Refrescar Ventas (actualiza lastFactRows dentro de renderVentas)
        api.fetchVentas(uid)
          .then(v => { try { renderVentas(v); } catch(e){ console.error('renderVentas error:', e); } ventasOK = true; maybeFinish(); })
          .catch(err => { console.error('Error al refrescar ventas', err); ventasOK = true; maybeFinish(); });

        // 2) Refrescar Acuerdos (se pintan cuando ventas también esté lista)
        api.fetchAcuerdos(uid)
          .then(a => { acuerdosData = a; acuerdosOK = true; maybeFinish(); })
          .catch(err => { console.error('Error al refrescar acuerdos', err); acuerdosData = []; acuerdosOK = true; maybeFinish(); });
      });
      
      // ==== Partición por estado_firma y doble tabla ====
      // helpers locales
      const fmt = d => {
        if (!d || d === '1970-01-01') return '';
        const [year, month, day] = d.split('-');
        return `${Number(day)}/${Number(month)}/${year}`;
      };
      const cleanDate = d => (!d || d === '1970-01-01') ? '' : d;
      const humanEstado = s => s === 'al_dia' ? 'Al día'
                              : s === 'en_mora' ? 'En mora'
                              : s === 'pagado' ? 'Pagado'
                              : (s || '');

      const signed    = (Array.isArray(data) ? data : []).filter(r => String(r.estado_firma||'').toLowerCase()==='firmado');
      const unsigned  = (Array.isArray(data) ? data : []).filter(r => String(r.estado_firma||'').toLowerCase()==='sin_firmar');
      if (!signed.length && !unsigned.length) {
        const msg = document.createElement('p');
        msg.textContent = 'No se encontraron acuerdos.';
        controls.insertAdjacentElement('afterend', msg);
        return;
      }

      // ----------- constructor de una tabla de acuerdos -----------
      function buildAcuerdosTable(list, title, idSuffix){
        const section = document.createElement('section');
        const heading = document.createElement('h3');
        heading.textContent = title;
        heading.style.marginTop = '20px';
        heading.style.color = '#075183';
        section.appendChild(heading);
        // pequeño espacio bajo el título
        const spacer = document.createElement('div');
        spacer.style.height = '8px';
        section.appendChild(spacer);

        // wrapper con scroll horizontal
        const wrap = document.createElement('div');
        wrap.id = `acuerdosTableWrap-${idSuffix}`;
        const tableDiv = document.createElement('div');
        tableDiv.id = `acuerdosTable-${idSuffix}`;
        wrap.appendChild(tableDiv);
        section.appendChild(wrap);
        c.appendChild(section);

        if (!list.length){
          tableDiv.innerHTML = '<p>No hay registros.</p>';
          return;
        }

        // agrupo por nro_acuerdo
        const grupos = list.reduce((acc, item) => {
          const key = item.nro_acuerdo;
          (acc[key] = acc[key]||[]).push(item);
          return acc;
        }, {});
        const acuerdosOrdenados = Object.keys(grupos)
          .map(Number).sort((a,b)=>b-a).map(String);

        let html = `
          <table style="font-size:0.9em; width:100%">
            <thead>
              <tr>
                <th>Nro<br>Acuerdo</th>
                <th>Comercial</th>
                <th>Producto</th>
                <th>Valor total<br>acuerdo</th>
                <th>Nro<br>cuotas</th>
                <th>Inicio<br>plataforma</th>
                <th>Fecha<br>firma</th>
                <th>Cuota nro</th>
                <th>Valor<br>Cuota</th>
                <th>Fecha<br>límite</th>
                <th>Estado</th>
                <th>Fecha<br>pago</th>
                <th>Valor<br>pagado</th>
                <th>Link<br>Mora</th>
                <th>Acciones</th>
                <th>Otrosí</th>
                <th>Paz y<br>salvo</th>
              </tr>
            </thead>
            <tbody>
        `;

      // recorro en orden descendente de nro_acuerdo
      acuerdosOrdenados.forEach(acuerdoKey => {
          const filas = grupos[acuerdoKey];
          filas.sort((a, b) => a.cuota_nro - b.cuota_nro);
          filas.forEach((item, i) => {
          const rowSpan = filas.length;
          // abro fila y datos-data-attributes
          html += `<tr
            data-document-id="${item.documentId||''}"
            data-id-pago="${item.id_pago||''}"
            data-id-pago-mora="${item.id_pago_mora||''}"
            data-fecha-limite="${cleanDate(item.fecha_limite)}"
            data-valor-cuota="${item.valor_cuota!=null?Number(item.valor_cuota):''}"
            data-nro-acuerdo="${item.nro_acuerdo||''}"
            data-producto-nombre="${item.producto?.nombre||''}"
            data-cuota-nro="${item.cuota_nro||''}"
            data-nro-cuotas="${item.nro_cuotas||''}"
            data-estado-pago="${item.estado_pago||''}"
            data-fecha-pago="${item.fecha_de_pago||''}"
            data-valor-pagado="${item.valor_pagado!=null?Number(item.valor_pagado):''}"
          >`;

          if (i === 0) {
            const nro = item.nro_acuerdo || '';
            const nroLink = item.acuerdo
              ? `<a href="${item.acuerdo}" target="_blank" rel="noopener">${nro}</a>`
              : nro;

            html += `
              <td rowspan="${rowSpan}" class="head-cols">${nroLink}</td>
              <td rowspan="${rowSpan}" class="head-cols">${(item.comercial?.nombre||'').split(' ')[0]}</td>
              <td rowspan="${rowSpan}" class="head-cols">${item.producto?.nombre||''}</td>
              <td rowspan="${rowSpan}" class="head-cols">${

                item.valor_total_acuerdo!=null
                  ? Number(item.valor_total_acuerdo).toLocaleString('es-CO')
                  : ''
              }</td>
              <td rowspan="${rowSpan}" class="head-cols">${item.nro_cuotas||''}</td>
              <td rowspan="${rowSpan}" class="head-cols">${ fmt(item.inicio_plataforma) }</td>
              <td rowspan="${rowSpan}" class="head-cols">${ fmt(item.fecha_firma) }</td>
            `;
          }

          // columnas por cuota
          html += `<td class="qcell">${item.cuota_nro||''}</td>`;

          const vcRaw = item.valor_cuota!=null
                      ? Number(item.valor_cuota).toLocaleString('es-CO')
                      : '';

          html += item.link_pago
            ? `<td class="qcell"><a href="${item.link_pago}" target="_blank">${vcRaw}</a></td>`
            : `<td class="qcell">${vcRaw}</td>`;

          html += `<td class="qcell">${ fmt(item.fecha_limite) }</td>`;

          // columnas calculadas/servidas por API (Estado, Fecha pago, Valor pagado)
          const estadoServ = humanEstado(item.estado_pago||'');
          const fechaPagoServ = fmt(item.fecha_de_pago);
          const valorPagadoServ = item.valor_pagado!=null
                                  ? Number(item.valor_pagado).toLocaleString('es-CO')
                                  : '';
          html += `<td class="qcell estado-cell">${estadoServ}</td>`;
          html += `<td class="qcell fecha-pago-cell">${fechaPagoServ}</td>`;
          html += `<td class="qcell valor-pagado-cell">${valorPagadoServ}</td>`;

          html += item.link_pago_mora
            ? `<td class="qcell"><a href="${item.link_pago_mora}" target="_blank">Ver</a></td>`
            : `<td class="qcell"></td>`;

          html += `<td class="qcell edit-icon" style="text-align:center; cursor:pointer">✏️</td>`;

          // celda combinada Otrosí (se llenará luego según permisos y estado)
          if (i === 0) {
            html += `<td rowspan="${rowSpan}" class="head-cols otrosi-cell"></td>`;
          }

          // celda combinada Paz y salvo (se llenará luego según el estado del acuerdo)
          if (i === 0) {
            html += `<td rowspan="${rowSpan}" class="head-cols paz-salvo-cell"></td>`;
          }

          html += '</tr>';
        });
      });

      html += '</tbody></table>';
      tableDiv.innerHTML = html;

      // === Resolución robusta por fila ===
      const MAX_RESOLVE_ATTEMPTS = 3;   // cuántas veces reintentamos cada fila
      const RETRY_BASE_MS        = 600; // ms base para backoff exponencial
      // setea celdas y data-attributes desde la respuesta del servidor
      // Verifica si una cuota está vencida comparando fecha límite con hoy (zona horaria Colombia)
      function checkIfOverdue(tr) {
        const estadoActual = (tr.dataset.estadoPago || '').toLowerCase();

        // NO recalcular si ya está "pagado" (eso es definitivo)
        if (estadoActual === 'pagado') return;

        const fechaLimite = tr.dataset.fechaLimite; // formato "YYYY-MM-DD"
        if (!fechaLimite || fechaLimite === '1970-01-01') return;

        // Calcular "hoy" en zona horaria de Colombia (comparación por strings YYYY-MM-DD)
        const hoyColombiaStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });

        // Recalcular estado basándose en la fecha
        if (fechaLimite < hoyColombiaStr) {
          // La fecha límite YA pasó → En mora
          if (estadoActual !== 'en_mora') {
            tr.dataset.estadoPago = 'en_mora';
            const cE = tr.querySelector('.estado-cell');
            if (cE) cE.textContent = 'En mora';
          }
        } else {
          // La fecha límite NO ha pasado → Al día
          if (estadoActual === 'en_mora') {
            // Autocorrección: estaba marcado "en_mora" pero NO debería
            tr.dataset.estadoPago = 'al_dia';
            const cE = tr.querySelector('.estado-cell');
            if (cE) cE.textContent = 'Al día';
          }
        }
      }

      function hydrateRowFromResponse(tr, res, fmt){
        const human = s => s === 'al_dia' ? 'Al día' : s === 'en_mora' ? 'En mora' : s === 'pagado' ? 'Pagado' : (s||'');
        const estado = human(res?.estado_pago || '');
        const fecha  = fmt(res?.fecha_de_pago);
        const valor  = (res?.valor_pagado != null) ? Number(res.valor_pagado).toLocaleString('es-CO') : '';
        if (estado) {
          const c1 = tr.querySelector('.estado-cell');      if (c1) c1.textContent = estado;
          tr.dataset.estadoPago = res.estado_pago || '';
        }
        if (fecha !== undefined) {
          const c2 = tr.querySelector('.fecha-pago-cell');  if (c2) c2.textContent = fecha;
          tr.dataset.fechaPago = res?.fecha_de_pago || '';
        }
        if (valor !== undefined) {
          const c3 = tr.querySelector('.valor-pagado-cell');if (c3) c3.textContent = valor;
          tr.dataset.valorPagado = (res?.valor_pagado!=null ? String(res.valor_pagado) : '');
        }

        // Después de hidratar, verificar si está vencida
        checkIfOverdue(tr);
      }
      // criterio de "ya quedó lista" - solo si NO tiene links de pago que consultar
      function rowIsResolved(tr){
        // Si tiene id_pago o id_pago_mora, SIEMPRE necesitamos consultar ePayco para actualizar Strapi
        const idPago = tr.dataset.idPago || '';
        const idPagoMora = tr.dataset.idPagoMora || '';
        if (idPago || idPagoMora) return false; // Necesita resolución

        // Si el estado es "en_mora", SIEMPRE recalcular (para autocorregir errores de zona horaria)
        const est = (tr.dataset.estadoPago || '').toLowerCase();
        if (est === 'en_mora') return false; // Necesita recalcular

        // Si ya tiene estado "al_dia" o "pagado", está resuelto
        if (est) return true;

        // Si no vino, pero la marcamos como Pagado por "Paz y salvo"
        const c1 = tr.querySelector('.estado-cell');
        return !!c1 && c1.textContent === 'Pagado';
      }

      // reintenta resolver una fila con backoff exponencial + validación "Paz y salvo"
      function resolveRow(tr, attempt){
        // si ya está resuelta (no tiene links para consultar y ya tiene estado), no hacemos nada
        if (rowIsResolved(tr)) return onRowDone();

        // PRIMERO: Marcar desde Ventas para obtener los datos correctos
        markAsPaidFromVentas(tr);

        // SEGUNDO: Extraer los datos ya calculados desde el tr
        const estadoPagoActual = tr.dataset.estadoPago || '';
        const fechaPagoActual = tr.dataset.fechaPago || '';
        const valorPagadoActual = tr.dataset.valorPagado || '';

        // Si el estado es "en_mora" y no hay fecha de pago (no encontró pagos en Ventas),
        // NO enviar estado_pago_calculado para forzar recálculo en backend
        const debeRecalcular = estadoPagoActual === 'en_mora' && !fechaPagoActual;

        const payload = {
          documentId:      tr.dataset.documentId,
          id_pago:         tr.dataset.idPago || '',
          id_pago_mora:    tr.dataset.idPagoMora || '',
          fecha_limite:    tr.dataset.fechaLimite || '',
          valor_cuota:     tr.dataset.valorCuota ? Number(tr.dataset.valorCuota) : 0,
          nro_acuerdo:     tr.dataset.nroAcuerdo || '',
          producto_nombre: tr.dataset.productoNombre || '',
          cuota_nro:       tr.dataset.cuotaNro || '',
          // NUEVO: Enviar los datos ya calculados desde Ventas, EXCEPTO si debe recalcular
          estado_pago_calculado: debeRecalcular ? '' : estadoPagoActual,
          fecha_pago_calculada: debeRecalcular ? '' : fechaPagoActual,
          valor_pagado_calculado: debeRecalcular ? null : (valorPagadoActual ? Number(valorPagadoActual) : null)
        };

        api.resolvePagoYActualizarCartera(payload)
          .then(res => {
            // Solo hidratar si la respuesta tiene datos (por si acaso el backend calculó algo diferente)
            if (res && res.estado_pago) {
              hydrateRowFromResponse(tr, res, fmt);
            }

            if (rowIsResolved(tr) || attempt >= MAX_RESOLVE_ATTEMPTS) {
              onRowDone();
            } else {
              const wait = RETRY_BASE_MS * Math.pow(2, attempt-1);
              setTimeout(() => resolveRow(tr, attempt+1), wait);
            }
          })
          .catch(err => console.error(err));
      }

      // — Helper: busca en ventas una línea "<producto> - Paz y salvo" del mismo acuerdo
      function findPazYSalvoVenta(nroAcuerdo, baseProducto){
        if (!Array.isArray(lastFactRows) || !lastFactRows.length) return null;
        const target = `${baseProducto} - Paz y salvo`;
        // lastFactRows: [Año,Mes,Día,Transacción,Comercial,Producto,ValorNeto,FechaInicio,PazYSalvo,Acuerdo,...]
        const row = lastFactRows.find(r =>
          String(r[9]).trim() === String(nroAcuerdo) && String(r[5]).trim() === target
        );
        if (!row) return null;
        const y = Number(row[0]), m = Number(row[1]), d = Number(row[2]);
        const fecha = `${d}/${m}/${y}`;                       // mismo formato que fmt()
        const valor = Number(row[6] || 0).toLocaleString('es-CO');
        return { fecha, valor };
      }

      // Devuelve TODAS las filas de ventas que pagan esta cuota (incluye "Cuota N (Mora)"; y "Paz y salvo" si es la última)
      function findVentasFor(acuerdo, baseProd, cuota, total){
        if (!Array.isArray(lastFactRows) || !lastFactRows.length) return [];
        const targets = [];
        const isLast = cuota && total && cuota === total;
        if (isLast) targets.push(`${baseProd} - Paz y salvo`);
        if (cuota) {
          targets.push(`${baseProd} - Cuota ${cuota}`);
          targets.push(`${baseProd} - Cuota ${cuota} (Mora)`);
        }
        const norm = s => String(s||'')
          .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
          .trim().toLowerCase();
        const wanted = new Set(targets.map(norm));
        const accWanted = norm(acuerdo);
        const matches = [];
        for (const r of lastFactRows) {
          if (norm(r[9]) !== accWanted) continue;  // Acuerdo
          if (wanted.has(norm(r[5]))) matches.push(r); // Producto
        }
        // ordena por fecha ascendente
        matches.sort((a,b)=>{
          const da = new Date(`${a[0]}-${String(a[1]).padStart(2,'0')}-${String(a[2]).padStart(2,'0')}`);
          const db = new Date(`${b[0]}-${String(b[1]).padStart(2,'0')}-${String(b[2]).padStart(2,'0')}`);
          return da - db;
        });
        return matches;
      }

      function fmtRowDate(y,m,d){ return `${Number(d)}/${Number(m)}/${y}`; }

      // Decide estado según suma de pagos de la cuota (incluye "Mora")
      function applyEstadoFromVentas(tr, ventas){
        if (!ventas.length) return false;
        const cuotaValor = Number(tr.dataset.valorCuota || 0);
        let sum = 0, lastY=0, lastM=0, lastD=0;
        for (const v of ventas){
          sum += Number(v[6] || 0); // Valor neto
          const y = Number(v[0])||0, m = Number(v[1])||0, d = Number(v[2])||0;
          const cur = Date.UTC(y,m-1,d), prev = Date.UTC(lastY||0,(lastM||1)-1,lastD||1);
          if (!lastY || cur >= prev){ lastY=y; lastM=m; lastD=d; }
        }
        // tolerancia nominal (centavos/redondeos)
        const TOL = 1000; // COP
        const paidEnough = cuotaValor ? (sum + TOL >= cuotaValor) : sum > 0;
        const fechaStr = lastY ? fmtRowDate(lastY,lastM,lastD) : '';
        const valorStr = sum ? Number(sum).toLocaleString('es-CO') : '';

        // Actualizar DOM
        tr.dataset.estadoPago = paidEnough ? 'pagado' : 'en_mora';
        tr.dataset.fechaPago = fechaStr;
        tr.dataset.valorPagado = sum.toString();

        const cE = tr.querySelector('.estado-cell');       if (cE) cE.textContent = paidEnough ? 'Pagado' : 'En mora';
        const cF = tr.querySelector('.fecha-pago-cell');   if (cF) cF.textContent = fechaStr;
        const cV = tr.querySelector('.valor-pagado-cell'); if (cV) cV.textContent = valorStr;
        return true;
      }

      function markAsPaidFromVentas(tr){
        const cuota = Number(tr.dataset.cuotaNro || 0);
        const total = Number(tr.dataset.nroCuotas || 0);
        const acc   = (tr.dataset.nroAcuerdo || '').trim();
        const base  = (tr.dataset.productoNombre || '').trim();
        const idPago = (tr.dataset.idPago || '').trim();
        const idPagoMora = (tr.dataset.idPagoMora || '').trim();

        let ventas = [];

        // PASO 1: Buscar PRIMERO por id_pago (más confiable)
        if (idPago && Array.isArray(lastFactRows)) {
          ventas = lastFactRows.filter(r => String(r[3] || '').trim() === idPago); // Columna 3 = Transacción
          if (ventas.length > 0) {
            console.log(`🎯 Cuota ${cuota} encontrada por id_pago: ${idPago}`);
          }
        }

        // PASO 2: Si no encontró por id_pago, buscar por id_pago_mora
        if (ventas.length === 0 && idPagoMora && Array.isArray(lastFactRows)) {
          ventas = lastFactRows.filter(r => String(r[3] || '').trim() === idPagoMora);
          if (ventas.length > 0) {
            console.log(`🎯 Cuota ${cuota} encontrada por id_pago_mora: ${idPagoMora}`);
          }
        }

        // PASO 3: Si no encontró por IDs, buscar por nombre de producto (fallback)
        if (ventas.length === 0) {
          ventas = findVentasFor(acc, base, cuota, total);
        }

        if (!ventas.length) return false;

        // Si es la última cuota y hay "Paz y salvo", se considera pagada
        const paz = ventas.find(v => String(v[5]).toLowerCase().includes('paz y salvo'));
        if (paz){
          const y=Number(paz[0]), m=Number(paz[1]), d=Number(paz[2]);
          const valorPaz = Number(paz[6]||0);
          const fechaStr = fmtRowDate(y,m,d);
          const valorStr = valorPaz.toLocaleString('es-CO');

          // Actualizar dataset
          tr.dataset.estadoPago = 'pagado';
          tr.dataset.fechaPago = fechaStr;
          tr.dataset.valorPagado = valorPaz.toString();

          // Actualizar DOM
          const cE = tr.querySelector('.estado-cell');       if (cE) cE.textContent = 'Pagado';
          const cF = tr.querySelector('.fecha-pago-cell');   if (cF) cF.textContent = fechaStr;
          const cV = tr.querySelector('.valor-pagado-cell'); if (cV) cV.textContent = valorStr;
          return true;
        }
        // Para el resto de cuotas: sumar "Cuota N" + "Cuota N (Mora)"
        return applyEstadoFromVentas(tr, ventas);
      }

      function applyGroupStyles() {
        const rows = tableDiv.querySelectorAll('tr[data-document-id]');
        const byAcc = {};
        rows.forEach(tr => {
          // Verificar si está vencida antes de aplicar estilos
          checkIfOverdue(tr);

          const acc = tr.dataset.nroAcuerdo || '';
          (byAcc[acc] = byAcc[acc] || []).push(tr);
          const est = (tr.dataset.estadoPago || '').toLowerCase();
          if (est === 'pagado')  tr.classList.add('row-paid');
          if (est === 'en_mora') tr.classList.add('row-mora');
        });

        Object.values(byAcc).forEach(group => {
          const estados = group.map(tr => (tr.dataset.estadoPago||'').toLowerCase());
          const allPaid = estados.length && estados.every(s => s === 'pagado');
          const hasMora = estados.some(s => s === 'en_mora');

          if (allPaid) group.forEach(tr => tr.classList.add('group-all-paid'));
          if (hasMora) group[0].classList.add('group-has-mora'); // solo afecta celdas de cabecera

          // botón Paz y salvo sólo si TODO está pagado
          const first = group[0];
          const psCell = first.querySelector('.paz-salvo-cell');
          if (psCell) {
            psCell.innerHTML = allPaid ? `<button class="ps-btn" title="Expedir paz y salvo">🔖</button>` : '';
          }

          // botón Otrosí - solo para usuarios autorizados y si hay cuotas NO pagadas
          const otrosiCell = first.querySelector('.otrosi-cell');
          const otrosiAllowed = ['david.cardona@sentiretaller.com', 'daniel.cardona@sentiretaller.com', 'eliana.montilla@sentiretaller.com'];
          const hasUnpaid = estados.some(s => s !== 'pagado');
          if (otrosiCell) {
            if (otrosiAllowed.includes(USER_EMAIL) && hasUnpaid) {
              otrosiCell.innerHTML = `<button class="otrosi-btn" title="Crear Otrosí - Renegociar cuotas" style="background:none; border:none; font-size:1.3em; cursor:pointer;">📜</button>`;
            } else {
              otrosiCell.innerHTML = '';
            }
          }
        });

        // handler del botón paz y salvo
        tableDiv.querySelectorAll('.ps-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const tr = btn.closest('tr');
            const nroAcuerdo = tr.dataset.nroAcuerdo || '';
            const productoNombre = tr.dataset.productoNombre || '';

            // Obtener datos del cliente desde el formulario principal
            const clienteNombres = document.getElementById('nombres')?.value || '';
            const clienteApellidos = document.getElementById('apellidos')?.value || '';
            const clienteCedula = document.getElementById('searchId')?.value?.replace(/\D/g, '') || '';
            const clienteCelular = document.getElementById('celular')?.value || '';

            if (!clienteNombres || !clienteApellidos || !clienteCedula) {
              alert('❌ No se encontraron los datos del cliente. Por favor, realice una búsqueda primero.');
              return;
            }

            if (!nroAcuerdo || !productoNombre) {
              alert('❌ No se encontraron los datos del acuerdo.');
              return;
            }

            // Confirmar antes de generar
            const confirmar = confirm(
              `¿Generar paz y salvo?\n\n` +
              `Cliente: ${clienteNombres} ${clienteApellidos}\n` +
              `Cédula: ${clienteCedula}\n` +
              `Producto: ${productoNombre}\n` +
              `Acuerdo: ${nroAcuerdo}\n\n` +
              `${clienteCelular ? `Se enviará por WhatsApp a: ${clienteCelular}` : '⚠️ No hay celular registrado, no se enviará por WhatsApp'}`
            );

            if (!confirmar) return;

            // Deshabilitar botón mientras se procesa
            btn.disabled = true;
            btn.textContent = '⏳';

            try {
              const response = await fetch('/api/paz-y-salvo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  nombres: clienteNombres,
                  apellidos: clienteApellidos,
                  cedula: clienteCedula,
                  celular: clienteCelular,
                  producto: productoNombre,
                  acuerdo: nroAcuerdo
                })
              });

              const result = await response.json();

              if (result.success) {
                let mensaje = `✅ ${result.message}`;
                if (result.pdfUrl) {
                  mensaje += `\n\n📄 PDF: ${result.pdfUrl}`;
                }
                alert(mensaje);
                btn.textContent = '✅';

                // Abrir PDF en nueva pestaña
                if (result.pdfUrl) {
                  window.open(result.pdfUrl, '_blank');
                }
              } else {
                alert(`❌ Error: ${result.error || 'Error desconocido'}`);
                btn.textContent = '🔖';
                btn.disabled = false;
              }
            } catch (error) {
              alert(`❌ Error de conexión: ${error.message}`);
              btn.textContent = '🔖';
              btn.disabled = false;
            }
          });
        });

        // handler del botón Otrosí - renegociar cuotas
        tableDiv.querySelectorAll('.otrosi-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const tr = btn.closest('tr');
            const nroAcuerdo = tr.dataset.nroAcuerdo || '';
            const productoNombre = tr.dataset.productoNombre || '';

            // Recopilar cuotas NO pagadas de este acuerdo
            const allRows = tableDiv.querySelectorAll(`tr[data-nro-acuerdo="${nroAcuerdo}"]`);
            const unpaidCuotas = [];

            allRows.forEach(row => {
              const estado = (row.dataset.estadoPago || '').toLowerCase();
              if (estado !== 'pagado') {
                unpaidCuotas.push({
                  documentId: row.dataset.documentId || '',
                  cuotaNro: row.dataset.cuotaNro || '',
                  valorCuota: row.dataset.valorCuota || '',
                  fechaLimite: row.dataset.fechaLimite || '',
                  estado: estado
                });
              }
            });

            if (unpaidCuotas.length === 0) {
              alert('Todas las cuotas de este acuerdo ya están pagadas.');
              return;
            }

            showOtrosiModal(nroAcuerdo, productoNombre, unpaidCuotas);
          });
        });
      }

      // Modal para Otrosí - renegociar cuotas
      function showOtrosiModal(nroAcuerdo, productoNombre, cuotas) {
        // Remover modal existente si hay
        const existingModal = document.getElementById('otrosiModal');
        if (existingModal) existingModal.remove();

        // === 1. Buscar membresía Élite activa ===
        let eliteMembership = null;
        let fechaFinMembresia = null;
        if (currentMembershipsData && Array.isArray(currentMembershipsData.memberships)) {
          eliteMembership = currentMembershipsData.memberships.find(m => {
            const isActive = m.status === 'active';
            const planName = (m.membershipPlan?.name || m.roles || '').toLowerCase();
            const isElite = planName.includes('elite') || planName.includes('élite');
            return isActive && isElite;
          });
          if (eliteMembership && eliteMembership.expiryDate) {
            // Convertir a fecha local para evitar desfase de timezone
            const expiryDate = new Date(eliteMembership.expiryDate);
            const year = expiryDate.getFullYear();
            const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
            const day = String(expiryDate.getDate()).padStart(2, '0');
            fechaFinMembresia = `${year}-${month}-${day}`; // YYYY-MM-DD en hora local
          }
        }

        // === 2. Aplicar 5% de recargo si tiene más de 5 días en mora ===
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const cuotasAjustadas = cuotas.map(c => {
          const fechaLimite = new Date(c.fechaLimite + 'T00:00:00');
          const diffDias = Math.floor((hoy - fechaLimite) / (1000 * 60 * 60 * 24));
          const tieneMoraMayor5Dias = diffDias > 5;

          let valorAjustado = Number(c.valorCuota || 0);
          let tieneRecargo = false;

          if (tieneMoraMayor5Dias) {
            valorAjustado = Math.round(valorAjustado * 1.05);
            tieneRecargo = true;
          }

          return {
            ...c,
            valorOriginal: Number(c.valorCuota || 0),
            valorCuota: valorAjustado,
            tieneRecargo,
            diasMora: diffDias > 0 ? diffDias : 0
          };
        });

        // Calcular total pendiente (con recargos aplicados)
        const totalPendiente = cuotasAjustadas.reduce((sum, c) => sum + c.valorCuota, 0);
        const totalOriginalSinRecargo = cuotasAjustadas.reduce((sum, c) => sum + c.valorOriginal, 0);
        const totalRecargos = totalPendiente - totalOriginalSinRecargo;

        // === 3. Generar HTML de cuotas ===
        let cuotasHtml = '';
        cuotasAjustadas.forEach((c) => {
          const recargoTag = c.tieneRecargo
            ? `<span style="color:#c01414; font-size:11px; display:block;">+5% mora (${c.diasMora} días)</span>`
            : '';
          cuotasHtml += `
            <tr data-document-id="${c.documentId}" data-original-valor="${c.valorOriginal}" data-original-fecha="${c.fechaLimite}">
              <td style="padding:8px; text-align:center;">${c.cuotaNro}</td>
              <td style="padding:8px;">
                <input type="number" class="otrosi-valor" value="${c.valorCuota}" style="width:120px; padding:4px; text-align:right;">
                ${recargoTag}
              </td>
              <td style="padding:8px;">
                <input type="date" class="otrosi-fecha" value="${c.fechaLimite}" style="padding:4px;"${fechaFinMembresia ? ` max="${fechaFinMembresia}"` : ''}>
              </td>
              <td style="padding:8px; text-align:center; color:#666;">${c.estado === 'en_mora' ? '🔴 En mora' : '🟡 Al día'}</td>
            </tr>
          `;
        });

        // === 4. HTML de membresía Élite ===
        let membresiaHtml = '';
        if (eliteMembership) {
          const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-CO') : 'N/A';
          membresiaHtml = `
            <div style="background:#e8f4fd; padding:12px; border-radius:4px; margin-bottom:16px; border-left:4px solid #075183;">
              <p style="margin:0; font-weight:600; color:#075183;">👑 Membresía Élite activa</p>
              <p style="margin:4px 0 0; font-size:13px;">
                <strong>Plan:</strong> ${eliteMembership.membershipPlan?.name || 'Élite'}<br>
                <strong>Inicio:</strong> ${formatDate(eliteMembership.startDate)} |
                <strong>Fin:</strong> ${formatDate(eliteMembership.expiryDate)}
              </p>
              <p style="margin:8px 0 0; font-size:12px; color:#666;">
                ⚠️ Las cuotas no pueden superar la fecha fin de membresía
              </p>
            </div>

            <div style="background:#fff3e0; padding:12px; border-radius:4px; margin-bottom:16px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="otrosiCongelarCheck" style="width:18px; height:18px;">
                <span>El usuario también desea congelar sus accesos 🥶</span>
              </label>
            </div>

            <!-- Sección de congelamiento (oculta inicialmente) -->
            <div id="otrosiFreezeSection" style="display:none; background:#e3f2fd; padding:16px; border-radius:4px; margin-bottom:16px; border:2px solid #2196f3;">
              <h4 style="margin:0 0 12px; color:#1565c0;">🥶 Configurar congelamiento</h4>
              <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px;">
                <div>
                  <label style="font-size:12px; color:#666;">Desde</label>
                  <input type="date" id="otrosiFreezeFrom" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
                </div>
                <div>
                  <label style="font-size:12px; color:#666;">Hasta</label>
                  <input type="date" id="otrosiFreezeTo" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
                </div>
                <div>
                  <label style="font-size:12px; color:#666;">Días restantes</label>
                  <input type="number" id="otrosiDaysRemaining" readonly style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; background:#f5f5f5;">
                </div>
              </div>
              <p id="otrosiNewEndDate" style="margin:12px 0 0; font-size:13px; color:#1565c0;"></p>
            </div>
          `;
        } else {
          membresiaHtml = `
            <div style="background:#fff3cd; padding:12px; border-radius:4px; margin-bottom:16px; border-left:4px solid #ffc107;">
              <p style="margin:0; color:#856404;">⚠️ No se encontró membresía Élite activa en Plataforma nueva</p>
            </div>
          `;
        }

        // === 5. HTML del recargo total ===
        const recargoInfoHtml = totalRecargos > 0
          ? `<p style="margin:4px 0 0; color:#c01414; font-size:13px;">📈 Incluye +$${totalRecargos.toLocaleString('es-CO')} por recargos de mora (5%)</p>`
          : '';

        const modalHtml = `
          <div id="otrosiModal" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:9999;">
            <div style="background:#fff; border-radius:8px; padding:24px; max-width:700px; width:90%; max-height:90vh; overflow-y:auto; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                <h3 style="margin:0; color:#f70f79;">📜 Otrosí - Renegociar Cuotas</h3>
                <button id="closeOtrosiModal" style="background:none; border:none; font-size:24px; cursor:pointer;">&times;</button>
              </div>

              <div style="background:#ffe6f1; padding:12px; border-radius:4px; margin-bottom:16px;">
                <p style="margin:0;"><strong>Acuerdo:</strong> ${nroAcuerdo}</p>
                <p style="margin:4px 0 0;"><strong>Producto:</strong> ${productoNombre}</p>
                <p style="margin:4px 0 0;"><strong>Total pendiente:</strong> $${totalPendiente.toLocaleString('es-CO')} <span id="otrosiTotalActual" style="color:#666;"></span></p>
                ${recargoInfoHtml}
              </div>

              ${membresiaHtml}

              <p style="margin-bottom:12px; color:#666;">Cuotas pendientes de pago (${cuotasAjustadas.length}):</p>

              <table style="width:100%; border-collapse:collapse; margin-bottom:16px;">
                <thead>
                  <tr>
                    <th style="padding:8px; background:#f70f79; color:#fff;">Cuota</th>
                    <th style="padding:8px; background:#f70f79; color:#fff;">Valor Cuota</th>
                    <th style="padding:8px; background:#f70f79; color:#fff;">Fecha Límite</th>
                    <th style="padding:8px; background:#f70f79; color:#fff;">Estado</th>
                  </tr>
                </thead>
                <tbody id="otrosiCuotasBody">
                  ${cuotasHtml}
                </tbody>
              </table>

              <div style="display:flex; gap:12px; justify-content:flex-end;">
                <button id="cancelOtrosi" style="background:#ccc; color:#333; border:none; padding:10px 20px; border-radius:4px; cursor:pointer;">
                  Cancelar
                </button>
                <button id="saveOtrosi" style="background:#f70f79; color:#fff; border:none; padding:10px 20px; border-radius:4px; cursor:pointer;">
                  📜 Elaborar otrosí
                </button>
              </div>
            </div>
          </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        // === 6. Configurar lógica de congelamiento ===
        const congelarCheck = document.getElementById('otrosiCongelarCheck');
        const freezeSection = document.getElementById('otrosiFreezeSection');
        const freezeFrom = document.getElementById('otrosiFreezeFrom');
        const freezeTo = document.getElementById('otrosiFreezeTo');
        const daysRemainingInput = document.getElementById('otrosiDaysRemaining');
        const newEndDateP = document.getElementById('otrosiNewEndDate');

        // Guardar fecha fin original para cálculos
        let fechaFinOriginal = fechaFinMembresia;
        let diasCongelamiento = 0;

        if (congelarCheck && eliteMembership) {
          // Calcular días restantes de membresía
          const hoyDate = new Date();
          const finDate = new Date(eliteMembership.expiryDate);
          const diasRestantes = Math.max(0, Math.ceil((finDate - hoyDate) / (1000 * 60 * 60 * 24)));

          congelarCheck.addEventListener('change', () => {
            if (congelarCheck.checked) {
              freezeSection.style.display = 'block';
              // Establecer valores iniciales
              const today = new Date().toISOString().split('T')[0];
              freezeFrom.value = today;
              freezeFrom.min = today;
              freezeTo.min = today;
              daysRemainingInput.value = diasRestantes;
            } else {
              freezeSection.style.display = 'none';
              diasCongelamiento = 0;
              // Restaurar max de fechas de cuotas
              document.querySelectorAll('#otrosiCuotasBody .otrosi-fecha').forEach(input => {
                input.max = fechaFinOriginal || '';
              });
              newEndDateP.textContent = '';
            }
          });

          // Actualizar cuando cambian las fechas de congelamiento
          const updateFreezeCalc = () => {
            if (!freezeFrom.value || !freezeTo.value) return;

            const from = new Date(freezeFrom.value + 'T00:00:00');
            const to = new Date(freezeTo.value + 'T00:00:00');
            diasCongelamiento = Math.max(0, Math.ceil((to - from) / (1000 * 60 * 60 * 24)));

            if (fechaFinOriginal) {
              const nuevaFechaFin = new Date(fechaFinOriginal + 'T00:00:00');
              nuevaFechaFin.setDate(nuevaFechaFin.getDate() + diasCongelamiento);
              // Formatear en hora local (evitar toISOString que usa UTC)
              const year = nuevaFechaFin.getFullYear();
              const month = String(nuevaFechaFin.getMonth() + 1).padStart(2, '0');
              const day = String(nuevaFechaFin.getDate()).padStart(2, '0');
              const nuevaFechaFinStr = `${year}-${month}-${day}`;

              newEndDateP.innerHTML = `
                <strong>Nueva fecha máxima:</strong> ${nuevaFechaFin.toLocaleDateString('es-CO')}
                <span style="color:#666;">(+${diasCongelamiento} días de congelamiento)</span>
              `;

              // Actualizar max de fechas de cuotas
              document.querySelectorAll('#otrosiCuotasBody .otrosi-fecha').forEach(input => {
                input.max = nuevaFechaFinStr;
              });
            }
          };

          freezeFrom.addEventListener('change', () => {
            freezeTo.min = freezeFrom.value;
            updateFreezeCalc();
          });
          freezeTo.addEventListener('change', updateFreezeCalc);
        }

        // Event listeners
        document.getElementById('closeOtrosiModal').addEventListener('click', () => {
          document.getElementById('otrosiModal').remove();
        });

        document.getElementById('cancelOtrosi').addEventListener('click', () => {
          document.getElementById('otrosiModal').remove();
        });

        document.getElementById('otrosiModal').addEventListener('click', (e) => {
          if (e.target.id === 'otrosiModal') {
            document.getElementById('otrosiModal').remove();
          }
        });

        // === Lógica de cascada de fechas ===
        // Cuando se modifica una fecha, las siguientes se mueven conservando el día original
        function getEndOfMonth(year, month) {
          return new Date(year, month + 1, 0).getDate();
        }

        function addMonthsKeepingDay(baseDate, monthsToAdd, targetDay) {
          const [year, month] = baseDate.split('-').map(Number);
          let newYear = year;
          let newMonth = month - 1 + monthsToAdd;

          while (newMonth > 11) { newMonth -= 12; newYear++; }
          while (newMonth < 0) { newMonth += 12; newYear--; }

          const endOfMonth = getEndOfMonth(newYear, newMonth);
          const newDay = Math.min(targetDay, endOfMonth);

          return `${newYear}-${String(newMonth + 1).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
        }

        const dateInputs = document.querySelectorAll('#otrosiCuotasBody .otrosi-fecha');
        dateInputs.forEach((input, index) => {
          input.addEventListener('change', () => {
            const currentDate = input.value;
            if (!currentDate) return;

            // El día objetivo es el día de la fecha modificada
            const targetDay = parseInt(currentDate.split('-')[2], 10);

            // Aplicar a las fechas siguientes, sumando 1 mes cada vez desde la fecha modificada
            for (let i = index + 1; i < dateInputs.length; i++) {
              const monthsFromChanged = i - index;
              dateInputs[i].value = addMonthsKeepingDay(currentDate, monthsFromChanged, targetDay);
            }
          });
        });

        // === Lógica de redistribución de valores ===
        const valorInputs = document.querySelectorAll('#otrosiCuotasBody .otrosi-valor');
        const totalOriginal = totalPendiente;

        function updateTotalDisplay() {
          const currentTotal = Array.from(valorInputs).reduce((sum, inp) => sum + Number(inp.value || 0), 0);
          const diff = currentTotal - totalOriginal;
          const totalSpan = document.getElementById('otrosiTotalActual');
          if (totalSpan) {
            if (diff > 0) {
              totalSpan.textContent = `(Actual: $${currentTotal.toLocaleString('es-CO')} +$${diff.toLocaleString('es-CO')})`;
              totalSpan.style.color = '#13bf81';
            } else if (diff < 0) {
              totalSpan.textContent = `(Actual: $${currentTotal.toLocaleString('es-CO')} -$${Math.abs(diff).toLocaleString('es-CO')})`;
              totalSpan.style.color = '#c01414';
            } else {
              totalSpan.textContent = '';
            }
          }
        }

        valorInputs.forEach((input, index) => {
          input.addEventListener('change', () => {
            const cuotasRestantes = valorInputs.length - index - 1;
            if (cuotasRestantes <= 0) {
              updateTotalDisplay();
              return;
            }

            // Calcular suma de cuotas anteriores + la modificada
            let sumaAnterior = 0;
            for (let i = 0; i <= index; i++) {
              sumaAnterior += Number(valorInputs[i].value || 0);
            }

            // Calcular saldo a distribuir
            let saldoRestante = totalOriginal - sumaAnterior;

            // Si el saldo es negativo, las cuotas siguientes quedan en 0
            if (saldoRestante < 0) saldoRestante = 0;

            // Distribuir equitativamente entre las cuotas restantes
            const valorPorCuota = Math.round(saldoRestante / cuotasRestantes);

            for (let i = index + 1; i < valorInputs.length; i++) {
              if (i === valorInputs.length - 1) {
                // Última cuota: asignar el resto para evitar errores de redondeo
                const sumaHastaAhora = sumaAnterior + (valorPorCuota * (cuotasRestantes - 1));
                valorInputs[i].value = Math.max(0, totalOriginal - sumaHastaAhora);
              } else {
                valorInputs[i].value = valorPorCuota;
              }
            }

            updateTotalDisplay();
          });

          // También actualizar display cuando se edita manualmente sin redistribuir
          input.addEventListener('input', updateTotalDisplay);
        });

        document.getElementById('saveOtrosi').addEventListener('click', async () => {
          const rows = document.querySelectorAll('#otrosiCuotasBody tr');
          const cuotasData = [];

          // Recopilar TODAS las cuotas con sus nuevos valores
          rows.forEach(row => {
            const documentId = row.dataset.documentId;
            const cuotaNro = row.querySelector('td:first-child').textContent.trim();
            const newValor = row.querySelector('.otrosi-valor').value;
            const newFecha = row.querySelector('.otrosi-fecha').value;

            cuotasData.push({
              documentId,
              cuotaNro: Number(cuotaNro),
              valor_cuota: Number(newValor),
              fecha_limite: newFecha
            });
          });

          // Validar que el total no sea menor al pendiente original
          const totalActual = cuotasData.reduce((sum, c) => sum + c.valor_cuota, 0);
          if (totalActual < totalOriginal) {
            alert(`❌ El valor total de las cuotas ($${totalActual.toLocaleString('es-CO')}) no puede ser menor al total pendiente ($${totalOriginal.toLocaleString('es-CO')}).`);
            return;
          }

          // Obtener datos del cliente
          const clienteNombres = document.getElementById('nombres')?.value || '';
          const clienteApellidos = document.getElementById('apellidos')?.value || '';
          const clienteCedula = document.getElementById('searchId')?.value?.replace(/\D/g, '') || '';

          if (!clienteNombres || !clienteApellidos || !clienteCedula) {
            alert('❌ No se encontraron los datos del cliente.');
            return;
          }

          const nombreCompleto = `${clienteNombres} ${clienteApellidos}`.trim();

          const confirmar = confirm(
            `¿Elaborar otrosí para el acuerdo ${nroAcuerdo}?\n\n` +
            `Cliente: ${nombreCompleto}\n` +
            `Cédula: ${clienteCedula}\n` +
            `Cuotas a modificar: ${cuotasData.length}`
          );
          if (!confirmar) return;

          const saveBtn = document.getElementById('saveOtrosi');
          const cancelBtn = document.getElementById('cancelOtrosi');
          saveBtn.disabled = true;
          cancelBtn.disabled = true;
          // Aplicar estilos visuales de disabled
          saveBtn.style.opacity = '0.7';
          saveBtn.style.cursor = 'not-allowed';
          saveBtn.style.pointerEvents = 'none';
          cancelBtn.style.opacity = '0.5';
          cancelBtn.style.cursor = 'not-allowed';
          cancelBtn.style.pointerEvents = 'none';
          saveBtn.innerHTML = `
            <span style="display:inline-block; width:14px; height:14px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin .8s linear infinite; vertical-align:middle; margin-right:8px;"></span>
            Generando otrosí...
          `;
          // Asegurar que la animación esté definida
          if (!document.getElementById('otrosiSpinKeyframes')) {
            const st = document.createElement('style');
            st.id = 'otrosiSpinKeyframes';
            st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
            document.head.appendChild(st);
          }

          try {
            const response = await api.elaborarOtrosi({
              nroAcuerdo,
              nombre: nombreCompleto,
              cedula: clienteCedula,
              cuotas: cuotasData
            });

            if (response.success) {
              // Guardar el HTML para abrir después
              window._otrosiHtmlContent = response.htmlContent;

              // Mostrar resultado con link al documento
              const modal = document.getElementById('otrosiModal');
              modal.querySelector('div > div').innerHTML = `
                <div style="text-align:center; padding:20px;">
                  <div style="font-size:48px; margin-bottom:16px;">✅</div>
                  <h3 style="color:#f70f79; margin-bottom:16px;">Otrosí generado exitosamente</h3>
                  <p style="margin-bottom:8px;"><strong>Acuerdo:</strong> ${nroAcuerdo}</p>
                  <p style="margin-bottom:16px;"><strong>Cliente:</strong> ${nombreCompleto}</p>
                  ${response.htmlContent ? `
                    <div style="display:flex; gap:12px; justify-content:center; margin-bottom:16px;">
                      <button id="verOtrosiBtn"
                         style="display:inline-block; background:#f70f79; color:#fff; padding:12px 24px; border-radius:4px; border:none; cursor:pointer; font-size:14px;">
                        📄 Ver documento
                      </button>
                      <button id="descargarOtrosiBtn"
                         style="display:inline-block; background:#075183; color:#fff; padding:12px 24px; border-radius:4px; border:none; cursor:pointer; font-size:14px;">
                        ⬇️ Descargar
                      </button>
                    </div>
                  ` : ''}
                  <button onclick="document.getElementById('otrosiModal').remove()"
                          style="background:#ccc; color:#333; border:none; padding:10px 20px; border-radius:4px; cursor:pointer;">
                    Cerrar
                  </button>
                </div>
              `;

              // Handler para abrir el documento
              const verBtn = document.getElementById('verOtrosiBtn');
              if (verBtn) {
                verBtn.addEventListener('click', () => {
                  const blob = new Blob([window._otrosiHtmlContent], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  window.open(url, '_blank');
                });
              }

              // Handler para descargar el PDF
              const descargarBtn = document.getElementById('descargarOtrosiBtn');
              if (descargarBtn && response.pdfBase64) {
                window._otrosiPdfBase64 = response.pdfBase64;
                descargarBtn.addEventListener('click', () => {
                  const byteCharacters = atob(window._otrosiPdfBase64);
                  const byteNumbers = new Array(byteCharacters.length);
                  for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                  }
                  const byteArray = new Uint8Array(byteNumbers);
                  const blob = new Blob([byteArray], { type: 'application/pdf' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `Otrosi-Acuerdo-${nroAcuerdo}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                });
              }

              // Recargar acuerdos
              if (clienteCedula) {
                api.fetchAcuerdos(clienteCedula).then(renderAcuerdos);
              }
            } else {
              alert(`❌ Error: ${response.error || 'Error al generar el otrosí.'}`);
              saveBtn.disabled = false;
              cancelBtn.disabled = false;
              saveBtn.style.opacity = '1';
              saveBtn.style.cursor = 'pointer';
              saveBtn.style.pointerEvents = 'auto';
              cancelBtn.style.opacity = '1';
              cancelBtn.style.cursor = 'pointer';
              cancelBtn.style.pointerEvents = 'auto';
              saveBtn.innerHTML = '📜 Elaborar otrosí';
            }
          } catch (error) {
            alert(`❌ Error de conexión: ${error.message}`);
            saveBtn.disabled = false;
            cancelBtn.disabled = false;
            saveBtn.style.opacity = '1';
            saveBtn.style.cursor = 'pointer';
            saveBtn.style.pointerEvents = 'auto';
            cancelBtn.style.opacity = '1';
            cancelBtn.style.cursor = 'pointer';
            cancelBtn.style.pointerEvents = 'auto';
            saveBtn.innerHTML = '📜 Elaborar otrosí';
          }
        });
      }

      // === Orquestación: primera pasada + reintentos con backoff ===
      const rows = Array.from(tableDiv.querySelectorAll('tr[data-document-id]'));
      let done = 0;
      function onRowDone(){
        done++;
        if (done === rows.length) applyGroupStyles();
      }
      // marca de entrada por si ya vino servido y para validar con Ventas
      rows.forEach(tr => markAsPaidFromVentas(tr));
      // resuelve cada fila con reintentos
      rows.forEach(tr => resolveRow(tr, 1));



      // handler del lápiz
      tableDiv.querySelectorAll('.edit-icon').forEach(el => {
        el.addEventListener('click', () => {
          const tr = el.closest('tr');
          const docId = tr.dataset.documentId;
          const idPago = tr.dataset.idPago;
          const idPagoMora = tr.dataset.idPagoMora;
          alert(
            'Función aún no disponible\n' +
            `documentId: ${docId}\n` +
            `ID Pago: ${idPago}\n` +
            `ID Pago Mora: ${idPagoMora}`
          );
        });
      });
    }

    // ===== Renderizo ambas secciones =====
      buildAcuerdosTable(signed,   'Acuerdos firmados',   'firmados');
      // Espacio entre tablas
      const sep = document.createElement('div'); sep.style.height='16px'; c.appendChild(sep);
      buildAcuerdosTable(unsigned, 'Acuerdos sin firmar','sin-firmar');

      // Actualizar indicador de mora para egresados (ahora que tenemos los datos de acuerdos)
      updateMoraIndicator();
     }
    

    // Update button text based on number of installments
    function updateCreateButtonText(numberOfInstallments) {
      const btn = document.getElementById('createLinkBtn');
      if (numberOfInstallments === 1) {
        btn.textContent = 'Crear link';
      } else if (numberOfInstallments > 1) {
        btn.textContent = 'Crear Acuerdo';
      }
    }

    // Validation functions
    function validateEmail(email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    function validatePhone(phone) {
      // Usuarios que pueden ingresar cualquier número de celular
      const celularBypassUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com', 'eliana.montilla@sentiretaller.com'];
      if (celularBypassUsers.includes(USER_EMAIL)) {
        return phone.trim().length > 0;
      }

      const cleanPhone = phone.replace(/\s/g, '');
      // 10 characters starting with 3
      if (cleanPhone.length === 10 && cleanPhone.startsWith('3')) {
        return true;
      }
      // 12 characters starting with 573
      if (cleanPhone.length === 12 && cleanPhone.startsWith('573')) {
        return true;
      }
      // 13 characters starting with +57
      if (cleanPhone.length === 13 && cleanPhone.startsWith('+57')) {
        return true;
      }
      return false;
    }

    function validateValue() {
      const value = Number(valorInput.value.replace(/\D/g, '')) || 0;
      const min = Number(valorInput.min) || 0;
      const max = Number(valorInput.max) || 0;

      // Usuarios especiales que pueden omitir las restricciones Min/Max
      const specialUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com', 'eliana.montilla@sentiretaller.com'];
      const isSpecialUser = specialUsers.includes(USER_EMAIL);

      if (!isSpecialUser) {
        if (min && value < min) {
          return { valid: false, message: `El valor debe ser al menos $${min.toLocaleString('es-CO')}` };
        }
        if (max && value > max) {
          return { valid: false, message: `El valor no puede exceder $${max.toLocaleString('es-CO')}` };
        }
      }
      return { valid: true };
    }

    function validateInstallments() {
      const numberOfInstallments = Number(cuotas.value) || 0;
      if (numberOfInstallments <= 1) return { valid: true };

      // Validate installment sum matches total value
      const totalValue = Number(valorInput.value.replace(/\D/g, '')) || 0;
      const installmentSum = planState.reduce((sum, item) => sum + (item.amount || 0), 0);

      if (Math.abs(installmentSum - totalValue) > 1) {
        return { valid: false, message: 'La suma de las cuotas no coincide con el valor total' };
      }

      // Validate number of installments matches plan
      if (planState.length !== numberOfInstallments) {
        return { valid: false, message: 'El número de cuotas no coincide con el plan de pagos' };
      }

      return { valid: true };
    }

    function validateRequiredFields() {
      const nombres = document.getElementById('nombres').value.trim();
      const apellidos = document.getElementById('apellidos').value.trim();
      const inicioTipoValue = inicioTipo.value;
      const inicioValue = inicio.value.trim();
      const comercial = document.getElementById('comercial').value.trim();

      if (!nombres) return { valid: false, message: 'El campo Nombres es obligatorio' };
      if (!apellidos) return { valid: false, message: 'El campo Apellidos es obligatorio' };

      // Validar tipo de inicio
      if (!inicioTipoValue) return { valid: false, message: 'Debe seleccionar el tipo de inicio plataforma' };

      // Si es fecha personalizada, validar que haya fecha
      if (inicioTipoValue === 'fecha-personalizada' && !inicioValue) {
        return { valid: false, message: 'Debe seleccionar una fecha personalizada para inicio plataforma' };
      }

      // Si es "con primer pago" y hay más de 1 cuota, verificar que haya plan de pagos
      const numberOfInstallments = Number(cuotas.value) || 0;
      if (inicioTipoValue === 'primer-pago' && numberOfInstallments > 1 && (!planState || planState.length === 0)) {
        return { valid: false, message: 'Para usar "Con primer pago" debe tener un plan de pagos generado' };
      }

      if (!comercial) return { valid: false, message: 'El campo Comercial es obligatorio' };

      return { valid: true };
    }

    async function validateCancelados() {
      // TODO: Implement Strapi 'Cancelados' database call
      // This is a placeholder for future implementation
      try {
        // const response = await fetch('strapi-cancelados-endpoint');
        // const data = await response.json();
        // return { valid: !data.isCancelled, message: 'Cliente encontrado en lista de cancelados' };
        return { valid: true };
      } catch (error) {
        console.warn('Error checking Cancelados database:', error);
        return { valid: true }; // Allow to proceed if service is down
      }
    }

    async function validateForm() {
      // Check Cancelados database first
      const canceladosCheck = await validateCancelados();
      if (!canceladosCheck.valid) {
        alert(canceladosCheck.message);
        return false;
      }

      // Validate email
      const email = correo.value.trim();
      if (!validateEmail(email)) {
        alert('Por favor ingrese un correo electrónico válido');
        return false;
      }

      // Validate phone
      const phone = celular.value.trim();
      if (!validatePhone(phone)) {
        alert('Por favor revise el celular ingresado. Formatos válidos:\n- 10 dígitos comenzando con 3\n- 12 dígitos comenzando con 573\n- 13 dígitos comenzando con +57');
        return false;
      }

      // Validate value range
      const valueValidation = validateValue();
      if (!valueValidation.valid) {
        alert(valueValidation.message);
        return false;
      }

      // Validate installments if more than 1
      const installmentValidation = validateInstallments();
      if (!installmentValidation.valid) {
        alert(installmentValidation.message);
        return false;
      }

      // Validate required fields
      const requiredValidation = validateRequiredFields();
      if (!requiredValidation.valid) {
        alert(requiredValidation.message);
        return false;
      }

      return true;
    }

    // Función para validar específicamente los campos de venta de contado
    function validateSinglePaymentFields() {
      const productoNombre = producto.value.trim();
      const esCuota1 = productoNombre.toLowerCase().includes('cuota 1');
      const esCuotaExtraordinaria = productoNombre.toLowerCase().includes('cuota') && !esCuota1;

      // Campos siempre obligatorios
      const requiredFields = [
        { id: 'searchId', name: 'Cédula' },
        { id: 'nombres', name: 'Nombres' },
        { id: 'apellidos', name: 'Apellidos' },
        { id: 'correo', name: 'Correo' },
        { id: 'celular', name: 'Celular' },
        { id: 'producto', name: 'Producto' },
        { id: 'cuotas', name: 'Nro de cuotas' },
        { id: 'valor', name: 'Valor' },
        { id: 'fechaMax', name: 'Fecha máxima' },
        { id: 'comercial', name: 'Comercial' }
      ];

      // Inicio plataforma solo es obligatorio para Cuota 1 o productos normales (no cuotas extraordinarias)
      if (!esCuotaExtraordinaria) {
        requiredFields.push({ id: 'inicio', name: 'Inicio plataforma' });
      }

      const missingFields = [];
      for (const field of requiredFields) {
        const element = document.getElementById(field.id);
        if (!element || !element.value || element.value.trim() === '') {
          missingFields.push(field.name);
        }
      }

      if (missingFields.length > 0) {
        return {
          valid: false,
          message: `Faltan los siguientes campos obligatorios:\n• ${missingFields.join('\n• ')}`
        };
      }

      // Validar número de acuerdo si el producto contiene "cuota"
      if (productoNombre.toLowerCase().includes('cuota')) {
        const nroAcuerdo = nroAcuerdoComercialito.value.trim();
        if (!nroAcuerdo) {
          return {
            valid: false,
            message: 'El campo "Nro de acuerdo" es obligatorio para productos con cuota extraordinaria'
          };
        }
      }

      return { valid: true };
    }

    // Función para procesar venta de contado
    async function processSinglePayment() {
      console.log('🚀 Iniciando proceso de venta de contado en frontend');

      try {
        // Validar campos específicos de venta de contado
        const fieldsValidation = validateSinglePaymentFields();
        if (!fieldsValidation.valid) {
          alert(fieldsValidation.message);
          return;
        }

        // Recopilar datos del formulario
        const formData = {
          cedula: searchId.value.replace(/\D/g,'').trim(),
          nombres: nombres.value.trim(),
          apellidos: apellidos.value.trim(),
          correo: correo.value.trim(),
          celular: celular.value.trim(),
          producto: producto.value.trim(),
          cuotas: cuotas.value,
          valor: valorInput.value.trim(),
          inicio: inicio.value,
          fechaMax: fechaMax.value,
          comercial: comercial.value.trim(),
          inicioTipo: inicioTipo.value,
          inicioFecha: inicio.value,
          nroAcuerdo: nroAcuerdoComercialito.value.trim() || null
        };

        console.log('📋 Datos del formulario recopilados:', formData);

        // Deshabilitar botón durante el proceso
        createLinkBtn.disabled = true;
        createLinkBtn.classList.add('loading');
        createLinkBtn.innerHTML = '<span class="spinner"></span>Procesando...';

        // Llamar a la función del backend
        const result = await api.processSinglePayment(formData);

        console.log('✅ Resultado del backend:', result);

        if (result.success) {
          console.log('🔗 Link de pago generado:', result.paymentLink);

          // Mostrar el link en la UI
          const linkUrl = result.paymentLink.data?.data?.data?.routeLink;
          if (linkUrl) {
            showPaymentLinkSuccess(linkUrl);
            // Mostrar mensaje de éxito sin alert (ya se muestra en el cuadro)
            console.log('✅ Link mostrado en UI:', linkUrl);
          } else {
            console.log('⚠️ No se pudo extraer el link URL de la respuesta');
            console.log('📝 Estructura recibida:', result.paymentLink);
            alert('✅ Link de pago creado pero no se pudo mostrar en la UI');
          }

        } else {
          console.log('❌ Error en el procesamiento:', result);
          alert(`❌ Error al procesar la venta:\n${result.message}`);
        }

      } catch (error) {
        console.log('❌ Error en frontend:', error);
        alert('❌ Error de conexión al procesar la venta. Por favor intente nuevamente.');
      } finally {
        // Restaurar botón
        createLinkBtn.disabled = false;
        createLinkBtn.classList.remove('loading');
        updateCreateButtonText(Number(cuotas.value) || 1);
      }
    }

    // Función para mostrar el link de pago exitoso
    function showPaymentLinkSuccess(linkUrl) {
      const linkResult = document.getElementById('linkResult');

      linkResult.innerHTML = `
        <div style="background: #f0f8f0; border: 2px solid #13bf81; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="color: #13bf81; font-size: 20px;">✅</span>
            <h3 style="margin: 0; color: #13bf81; font-size: 16px;">Link de pago generado exitosamente</h3>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span class="label" style="min-width: 80px;">Link:</span>
            <input
              id="generatedLink"
              type="text"
              value="${linkUrl}"
              readonly
              style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; background: #f9f9f9; cursor: pointer; font-family: monospace; font-size: 12px;"
              onclick="copyToClipboard('${linkUrl}')"
              title="Click para copiar al portapapeles"
            />
          </div>

          <div style="display: flex; gap: 8px;">
            <button
              onclick="sendToWhatsApp('${linkUrl}')"
              style="background: #25D366; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;"
            >
              📲 Enviar al WhatsApp
            </button>
            <button
              onclick="openWhatsApp('${linkUrl}')"
              style="background: #128C7E; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;"
            >
              📱 Abrir WhatsApp
            </button>
          </div>
        </div>
      `;
    }

    // Función para copiar al portapapeles
    function copyToClipboard(text) {
      navigator.clipboard.writeText(text).then(() => {
        // Mostrar feedback visual
        const input = document.getElementById('generatedLink');
        const originalBg = input.style.background;
        input.style.background = '#13bf81';
        input.style.color = 'white';

        setTimeout(() => {
          input.style.background = originalBg;
          input.style.color = '';
        }, 500);

        console.log('📋 Link copiado al portapapeles:', text);
      }).catch(err => {
        console.error('Error copiando al portapapeles:', err);
        alert('Link copiado: ' + text);
      });
    }

    // Función para enviar al WhatsApp
    async function sendToWhatsApp(linkUrl) {
      console.log('📲 Enviar al WhatsApp:', linkUrl);

      // Buscar todos los botones de WhatsApp en la página
      const whatsappButtons = document.querySelectorAll('button[onclick*="sendToWhatsApp"], button[onclick*="openWhatsApp"]');

      try {
        // Deshabilitar todos los botones de WhatsApp
        whatsappButtons.forEach(btn => {
          btn.disabled = true;
          btn.style.cursor = 'not-allowed';
          btn.style.opacity = '0.6';
        });

        // Obtener datos del formulario
        const celular = document.getElementById('celular').value.trim();
        const producto = document.getElementById('producto').value.trim();

        if (!celular || !producto) {
          alert('❌ Error: Faltan datos del celular o producto');
          // Re-habilitar botones
          whatsappButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
          });
          return;
        }

        // Buscar área para mostrar feedback
        const feedbackArea = document.getElementById('whatsappFeedback') || createWhatsAppFeedback();

        // Mostrar estado de enviando
        feedbackArea.innerHTML = '<div style="color: #ff9800;">📤 Enviando mensaje por WhatsApp...</div>';

        // Llamar al backend para enviar el mensaje
        const result = await api.sendWhatsAppMessage(celular, producto, linkUrl);

        console.log('📤 Resultado envío WhatsApp:', result);

        if (result.success) {
          // Mensaje enviado, ahora verificar estado después de 3 segundos
          feedbackArea.innerHTML = '<div style="color: #2196F3;">⏳ Verificando entrega del mensaje...</div>';

          setTimeout(async () => {
            try {
              const statusResult = await api.checkMessageStatus(result.messageUuid);

              console.log('📊 Estado del mensaje:', statusResult);

              if (statusResult.success && statusResult.isDelivered) {
                feedbackArea.innerHTML = '<div style="color: #4CAF50;">✅ Mensaje enviado exitosamente</div>';
              } else {
                const errorMsg = statusResult.errorDetails || 'Estado no confirmado';
                feedbackArea.innerHTML = `<div style="color: #f44336;">⛔ Error enviando el mensaje (${errorMsg})</div>`;
              }
            } catch (statusError) {
              console.error('Error verificando estado:', statusError);
              feedbackArea.innerHTML = '<div style="color: #ff9800;">⚠️ Mensaje enviado pero no se pudo verificar el estado</div>';
            } finally {
              // Re-habilitar botones después de completar la verificación
              whatsappButtons.forEach(btn => {
                btn.disabled = false;
                btn.style.cursor = 'pointer';
                btn.style.opacity = '1';
              });
            }
          }, 3000);

        } else {
          feedbackArea.innerHTML = `<div style="color: #f44336;">❌ Error: ${result.message}</div>`;
          // Re-habilitar botones si falla el envío inicial
          whatsappButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
          });
        }

      } catch (error) {
        console.error('Error enviando WhatsApp:', error);
        const feedbackArea = document.getElementById('whatsappFeedback') || createWhatsAppFeedback();
        feedbackArea.innerHTML = '<div style="color: #f44336;">❌ Error de conexión enviando WhatsApp</div>';
        // Re-habilitar botones en caso de error de conexión
        whatsappButtons.forEach(btn => {
          btn.disabled = false;
          btn.style.cursor = 'pointer';
          btn.style.opacity = '1';
        });
      }
    }

    // Función para abrir WhatsApp
    async function openWhatsApp(linkUrl) {
      console.log('📱 Abrir WhatsApp:', linkUrl);

      // Buscar todos los botones de WhatsApp en la página
      const whatsappButtons = document.querySelectorAll('button[onclick*="sendToWhatsApp"], button[onclick*="openWhatsApp"]');

      try {
        // Deshabilitar todos los botones de WhatsApp
        whatsappButtons.forEach(btn => {
          btn.disabled = true;
          btn.style.cursor = 'not-allowed';
          btn.style.opacity = '0.6';
        });

        // Obtener celular del formulario
        const celular = document.getElementById('celular').value.trim();

        if (!celular) {
          alert('❌ Error: No se encontró el número de celular');
          // Re-habilitar botones
          whatsappButtons.forEach(btn => {
            btn.disabled = false;
            btn.style.cursor = 'pointer';
            btn.style.opacity = '1';
          });
          return;
        }

        // Llamar al backend para obtener el contacto
        const result = await api.getCallbellContact(celular);

        console.log('🔍 Resultado búsqueda contacto:', result);

        if (result.success && result.conversationHref) {
          // Abrir conversación en nueva pestaña
          window.open(result.conversationHref, '_blank');
        } else {
          alert(`❌ No se pudo abrir WhatsApp: ${result.message}`);
        }

      } catch (error) {
        console.error('Error abriendo WhatsApp:', error);
        alert('❌ Error de conexión al buscar el contacto');
      } finally {
        // Re-habilitar todos los botones de WhatsApp
        whatsappButtons.forEach(btn => {
          btn.disabled = false;
          btn.style.cursor = 'pointer';
          btn.style.opacity = '1';
        });
      }
    }

    // Función para crear área de feedback de WhatsApp
    function createWhatsAppFeedback() {
      const linkResult = document.getElementById('linkResult');

      // Buscar si ya existe el área de feedback
      let feedbackArea = document.getElementById('whatsappFeedback');

      if (!feedbackArea) {
        feedbackArea = document.createElement('div');
        feedbackArea.id = 'whatsappFeedback';
        feedbackArea.style.marginTop = '8px';
        feedbackArea.style.fontSize = '14px';

        // Agregar después del último elemento en linkResult
        linkResult.appendChild(feedbackArea);
      }

      return feedbackArea;
    }

    // calcularAnalisis con regla por CATEGORIA (Élite / Esencial)
    function calcularAnalisis() {
      if (!lastFactRows.length) return;

      // 1) Tipo de egresado por categoría: mira cualquier fila con Paz y salvo = 'Si'
      // Índices en lastFactRows:
      // 8 = Paz y salvo, 16 = Categoria
      const hasElitePaid = lastFactRows.some(r =>
        String(r[8]).trim().toLowerCase() === 'si' &&
        String(r[16]).trim().toLowerCase() === 'élite'
      );
      const hasEsencialPaid = lastFactRows.some(r =>
        String(r[8]).trim().toLowerCase() === 'si' &&
        String(r[16]).trim().toLowerCase() === 'esencial'
      );
      let te = 'N/A';
      if (hasElitePaid) te = 'Élite';
      else if (hasEsencialPaid) te = 'Esencial';

      // 1.5) Actualizar indicador de mora para egresados
      updateMoraIndicator();

      // 2) Tipo de compra: solo exact match sobre la lista de productos "élite"
      const prod = producto.value.trim();
      const esCompraElite = /^Élite\b/i.test(prod);

      const compra = esCompraElite ? 'Élite' : 'Otro';

      // 3) Definir % de descuento
      let desc = '0%';
      if (te === 'Élite'    && compra === 'Élite') desc = '25%';
      if (te === 'Esencial' && compra === 'Élite') desc = '15%';

      // 4) Renderizar análisis en pantalla
      document.getElementById('discountAnalysis').innerHTML =
        `<div>Tipo de Egresado: ${te}</div>` +
        `<div>Tipo de Compra: ${compra}</div>` +
        `<div>Descuento: ${desc}</div>`;

      // 5) Recalcular rango/placeholder según descuento
      const pct  = parseInt(desc, 10) || 0;
      currentDiscountPct = pct;

      // Delegar todo el cálculo a updatePriceRange() que ya tiene la lógica correcta
      updatePriceRange();
    }

    // renderMembOld - Renderiza membresías de plataforma vieja (WordPress)
    function renderMembOld(data) {
      const cont = document.getElementById('membOldContainer');

      // Si hay error, mostrar mensaje
      if (data && data.error) {
        cont.innerHTML = data.message || '<p>Error al cargar membresías viejas</p>';
        return;
      }

      // Validar estructura de datos
      if (!data || !data.user || !Array.isArray(data.memberships)) {
        cont.innerHTML = '<p>No hay membresías viejas</p>';
        return;
      }

      const user = data.user;
      const memberships = data.memberships;

      // Construir info del usuario (nombre + cédula + email + roles)
      const wrapper = document.querySelector('.memb-old');
      const header = wrapper.querySelector('.memb-old h3');

      // Crear o actualizar el div de info del usuario
      let info = wrapper.querySelector('#membOldInfo');
      if (!info) {
        info = document.createElement('div');
        info.id = 'membOldInfo';
        info.style.margin = '4px 0 10px';
        header.insertAdjacentElement('afterend', info);
      }

      const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
      const cedula = user.user_login || '';
      const email = user.user_email || '';
      const roles = user.roles ? user.roles.replace(/elite/gi, 'Élite') : '';

      info.innerHTML = [
        fullName ? `<div>${fullName}${cedula ? ` <span class="student-name">(${cedula})</span>` : ''}</div>` : '',
        email ? `<div>${email}</div>` : '',
        roles ? `<div>Roles: ${roles}</div>` : ''
      ].filter(Boolean).join('');

      // Renderizar tabla de membresías
      if (!memberships.length) {
        cont.innerHTML = '<p>No hay membresías viejas</p>';
        return;
      }

      let html = '<table><thead><tr>'
        + '<th>Id</th><th>Membresía</th><th>Fecha inicio</th>'
        + '<th>Fecha fin</th><th>Estado</th><th class="actions-header">Acciones</th></tr></thead><tbody>';

      memberships.forEach(m => {
        let role = (m.roles || '').replace(/elite/gi, 'Élite');

        // Calcular meses (copiado de calcularMeses del backend)
        const calcMeses = (start, end) => {
          if (!start || !end) return null;
          const d1 = new Date(start);
          const d2 = new Date(end);
          if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
          return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24 * 30));
        };

        const months = calcMeses(m.start_date, m.expiry_date);
        if (months != null) {
          const color = m.status === 'active' ? '#fff' : '#999';
          role += ` <span style="color:${color}">(${months} ${months === 1 ? 'mes' : 'meses'})</span>`;
        }

        // Formatear fechas DD/MM/YYYY
        const formatDate = (s) => {
          if (!s) return '';
          const d = new Date(s);
          if (isNaN(d)) return '';
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          return `${day}/${month}/${year}`;
        };

        const highlightClass = m.status === 'active' ? ' class="highlight"' : '';

        html += `<tr${highlightClass}>`
          + `<td>${m.id || ''}</td>`
          + `<td>${role}</td>`
          + `<td>${formatDate(m.start_date)}</td>`
          + `<td>${formatDate(m.expiry_date)}</td>`
          + `<td>${m.status || ''}</td>`
          + `</tr>`;
      });

      html += '</tbody></table>';
      cont.innerHTML = html;
      attachRowActions('membOldContainer', { enableFreeze: false, enableEdit: false });
    }

    // renderMembFRAPP
    function renderMembFRAPP(data) {
      const c = document.getElementById('membNewContainer');
      // En caso de que por algún motivo llegue como string
      let obj = data;
      if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch(e) { obj = {}; }
      }
      const user  = obj && obj.user ? obj.user : null;
      const items = Array.isArray(obj && obj.memberships) ? obj.memberships : [];

      // Almacenar los datos de membresías en la variable global para reutilizar
      currentMembershipsData = obj;

      // —— Nombre y Roles debajo del H4 ——
      // Contenedor (debajo del título "Plataforma nueva")
      const wrapper = document.querySelector('.memb-new');
      const header  = wrapper.querySelector('.memb-new-header');
      let info = wrapper.querySelector('#membNewInfo');
      if (!info) {
        info = document.createElement('div');
        info.id = 'membNewInfo';
        info.style.margin = '4px 0 10px';
        header.insertAdjacentElement('afterend', info);
      }
      // NUEVO: el usuario viene dentro de cada membership; usa el primero como fuente
      const userFromMembership = (items[0] && items[0].user) ? items[0].user : null;
      const u = obj?.user || userFromMembership || null;

      console.log('🔍 renderMembFRAPP - Usuario detectado:', u);
      console.log('🔍 renderMembFRAPP - obj.user:', obj?.user);
      console.log('🔍 renderMembFRAPP - userFromMembership:', userFromMembership);
      console.log('🔍 renderMembFRAPP - items[0]:', items[0]);

      // Guardar usuario actual para edición
      currentUserFRAPP = u;

      // Mostrar botón de editar si hay usuario
      const editUserBtn = document.getElementById('editUserBtn');
      console.log('🔍 editUserBtn element:', editUserBtn);
      console.log('🔍 Usuario u:', u);
      if (editUserBtn) {
        editUserBtn.style.display = u ? 'inline-block' : 'none';
        console.log('🔍 Botón de editar display:', editUserBtn.style.display);
      }

      const fullName = u ? [u.givenName || '', u.familyName || ''].filter(Boolean).join(' ').trim() : '';
      // Roles: tomar de cada membership (string), normalizar y deduplicar
      const rolesFromItems = Array.from(new Set(
        items.map(m => roleToLabel(m.roles)).filter(Boolean)
      ));
      // Fallback: si el usuario trae roles como array de objetos [{name}]
      const rolesFromUser = Array.isArray(u?.roles) && u.roles.length
        ? u.roles.map(r => roleToLabel(r.name || r)).filter(Boolean)
        : [];
      const rolesMerged = rolesFromItems.length ? rolesFromItems : rolesFromUser;
      const rolesTxt = rolesMerged.join(', ');
      // Pintar (nombre + email si existe + roles + estado)
      const emailTxt   = u?.email  ? `<div>${u.email}</div>` : '';
      const userCedula = u?.identityDocument || searchId.value.replace(/\D/g,'');
      const pendingBtn = u?.status === 'pending' ? ` <button onclick="obtenerLinkActivacion('${userCedula}')" style="background:none;border:none;cursor:pointer;font-size:0.85em;padding:0;margin-left:4px;color:#6f42c1;" title="Copia el link de activación al portapapeles">🔗 (Copiar link activación)</button>` : '';
      const statusLine = u?.status ? `<div>Estado: ${u.status}${pendingBtn}</div>` : '';
      info.innerHTML = [
        fullName ? `<div>${fullName}${u?.identityDocument ? ` <span class="student-name">(${u.identityType || ''} ${u.identityDocument})</span>` : ''}</div>` : '',
        emailTxt,
        rolesTxt ? `<div>Roles: ${rolesTxt}</div>` : '',
        statusLine
      ].filter(Boolean).join('');

      // —— Guardar membresía activa para referencia ——
      activeMembershipFRAPP = items.find(m => m.status === 'active') || null;

      // —— Tabla de membresías ——
      if (!items.length) {
        c.innerHTML = '<p>No hay membresías nuevas</p>';
        attachRowActions('membNewContainer', { enableFreeze: true, enableEdit: true });
        return;
      }

      const formatColDate = iso =>
        iso ? new Date(iso).toLocaleDateString('es-CO', { day:'numeric', month:'numeric', year:'numeric' }) : '';

      let html = '<table><thead><tr>'
                + '<th>Id</th>'
                + '<th>Membresía</th>'
                + '<th>Fecha inicio</th>'
                + '<th>Fecha fin</th>'
                + '<th>Estado</th>'
                + '</tr></thead><tbody>';

      items.forEach(m => {
        const start = formatColDate(m.startDate);
        const end   = formatColDate(m.expiryDate);
        // Mostrar la membresía desde roles normalizado; si no hay roles, usa product.name/description/handle
        let membLabel = '';
        if (m.membershipPlan?.name) {
          // “Plan Élite 9 meses” → “Élite 9 meses”
          membLabel = m.membershipPlan.name.replace(/^\s*Plan\s+/i, '').trim();
        } else if (m.roles) {
          // Usuario viejo: usar roles; “elite” → “Élite”
          membLabel = roleToLabel(m.roles);
          membLabel = membLabel.replace(/\bElite\b/gi, 'Élite');
        } else if (m.product?.name) {
          membLabel = m.product.name;
        } else {
          membLabel = m.description || m.productHandle || '—';
        }
        html += `<tr class="${m.status === 'active' ? 'active' : ''}">`
              +  `<td>${m.id}</td>`
              +  `<td>${membLabel}</td>`
              +  `<td>${start}</td>`
              +  `<td>${end}</td>`
              +  `<td>${m.status}</td>`
              +  `</tr>`;
      });

      html += '</tbody></table>';
      c.innerHTML = html;
      attachRowActions('membNewContainer', { enableFreeze: true, enableEdit: true });
    }

    // toISODate helper
    function toISODate(str) {
      const [d, m, y] = str.split('/');
      if (!y) return '';
      return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }

    /**
     * Activa los iconos de editar y congelar/descongelar en cada fila.
     * options = { enableFreeze: boolean }
     */

    function ensureSpinnerCSS(){
      if (!document.getElementById('spinKeyframes')) {
        const st = document.createElement('style');
        st.id = 'spinKeyframes';
        st.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
        document.head.appendChild(st);
      }
    }

    function setSearching(loading){
      ensureSpinnerCSS();
      window.SEARCH_LOCK = !!loading;
      if (loading){
        searchBtn.disabled = true;
        searchBtn.innerHTML =
          `<span style="display:inline-block;width:14px;height:14px;border:2px solid #ccc;border-top-color:#075183;border-radius:50%;animation:spin .8s linear infinite;vertical-align:middle;margin-right:6px;"></span>` +
          'Buscando…';
      } else {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Buscar';
      }
    }

    function attachRowActions(containerId, options) {
      const { enableFreeze, enableEdit = true } = options;
      const cont = document.getElementById(containerId);
      const table = cont.querySelector('table');
      if (!table) return;

      const head = table.querySelector('thead tr');
      if (!head.querySelector('th.actions-header')) {
        const th = document.createElement('th');
        th.textContent = 'Acciones';
        th.classList.add('actions-header');
        head.appendChild(th);
      }

      table.querySelectorAll('tbody tr').forEach(tr => {
        if (tr._actionsAttached) return;
        tr._origHTML = tr.innerHTML;

        const td = document.createElement('td');
        td.classList.add('action-cell');
        td.style.whiteSpace = 'nowrap';

        // ✏️ Editar
        const edit = document.createElement('button');
          edit.textContent = '✏️';
          edit.style.cursor = 'pointer';
          edit.className = 'edit-membership-btn';
          edit.title = enableEdit
          ? 'Editar esta membresía'
          : 'Edición no disponible';
        edit.addEventListener('click', () => {
          if (!enableEdit) {
            alert('La edición de Plataforma vieja aún no está disponible');
          } else {
            enterEditMode(tr, options);
          }
        });
        td.appendChild(edit);

        // —🥶 Congelar— solo si permitimos freeze Y el <tr> tiene clase "active"
        if (enableFreeze && tr.classList.contains('active')) {
          const freeze = document.createElement('button');
          freeze.textContent = '🥶';
          freeze.className = 'freeze-membership-btn';
          freeze.style.cursor = 'pointer';
          freeze.title = 'Congelar esta membresía';
          freeze.addEventListener('click', () => {
            // **Aquí** obtenemos las celdas:
            const cells = tr.querySelectorAll('td');
            const membershipId = Number(cells[0].textContent.trim());
            const expiryText  = cells[3].textContent.trim();      // dd/MM/yyyy
            const expiryIso   = toISODate(expiryText);             // yyyy-MM-dd
            const changedById = USER_IDS[USER_EMAIL];
            if (!changedById) return alert('🚫 No tienes permiso para congelar.');

            currentFreeze = { id: membershipId, expiryIso };

            // inicializamos modal...
            freezeReason.value  = '';
            freezeDate.value    = formatLocalDate(new Date());
            unfreezeDate.value  = '';
            daysRemaining.value = '';
            unfreezeDate.min    = freezeDate.value;
            updateDaysRemaining();
            freezeModal.classList.remove('hidden');
          });
          td.appendChild(freeze);
        }

        tr.appendChild(td);
        tr._actionsAttached = true;
      });
    }

    /**
     * Pone la fila en modo edición inline:
     * convierte 3 celdas en inputs y muestra botones ✅❌
     */
    function enterEditMode(tr, options) {
      const cells = tr.querySelectorAll('td');
      const idxInicio = 2, idxFin = 3, idxEstado = 4, idxAcc = 5;

      const txtInicio = cells[idxInicio].textContent.trim();
      const txtFin    = cells[idxFin].textContent.trim();
      const selEstado = cells[idxEstado].textContent.trim();

      cells[idxInicio].innerHTML = `<input type="date" class="edit-date" value="${toISODate(txtInicio)}">`;
      cells[idxFin].innerHTML    = `<input type="date" class="edit-date" value="${toISODate(txtFin)}">`;
      cells[idxEstado].innerHTML = `
        <select class="edit-status">
          <option value="active"${selEstado==='active'?' selected':''}>active</option>
          <option value="scheduled"${selEstado==='scheduled'?' selected':''}>scheduled</option>
          <option value="expired"${selEstado==='expired'?' selected':''}>expired</option>
        </select>`;

      const accTd = cells[idxAcc];
      accTd.innerHTML = '';
      const save = document.createElement('button');
      save.textContent = '💾';
      save.className = 'save-membership-btn';
      save.title = 'Guardar cambios';
      save.addEventListener('click', () => {
      // 1) Obtener el membershipId de la primera celda
      const membershipId = Number(tr.querySelector('td').textContent.trim());
      // 2) Comprobar permiso
      const changedById = USER_IDS[USER_EMAIL];
      if (!changedById) return alert('🚫 No tienes permiso para hacer este cambio.');

      // 3) Leer valores del formulario inline
      const dateInputs = Array.from(tr.querySelectorAll('input.edit-date'));
      if (dateInputs.length < 2) {
        return alert('No encontré ambos campos de fecha para editar.');
      }
      const newStart  = dateInputs[0].value;
      const newExpiry = dateInputs[1].value;

      const statusSelect = tr.querySelector('select.edit-status');
      if (!statusSelect) {
        return alert('No encontré el campo de estado para editar.');
      }
      const newStatus = statusSelect.value;

      // 3.5) Validar si el estado es "scheduled", la fecha inicio debe ser mayor a hoy
      if (newStatus === 'scheduled') {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalizar a medianoche
        const startDate = new Date(newStart);

        if (startDate <= today) {
          return alert('⚠️ Para el estado "scheduled", la fecha de inicio debe ser posterior a hoy.');
        }
      }

      // 4) Pedir motivo
      let reason;
      do {
        reason = prompt('Por favor indica la razón del cambio (mínimo 3 caracteres):');
        if (reason === null) return;  // canceló
      } while (!reason || reason.length < 3);

      // 5) Construir objeto changes con fechas UTC y loguear payload
        const startISO  = localToUTCISOString(newStart);
        const expiryISO = localToUTCISOString(newExpiry, true);
        const daysDiff  = Math.round((new Date(newExpiry) - new Date(newStart)) / (1000*60*60*24));

        console.log('DEBUG updateMembershipFRAPP payload:', {
          membershipId,
          changedById,
          reason,
          changes: {
            status: newStatus,
            start_date: startISO,
            expiry_date: expiryISO,
            expiry_days: daysDiff,
            cancellationReason: newStatus === 'expired' ? reason : undefined
          }
        });
      


      const changes = {
        status:            newStatus,
        start_date:        startISO,
        expiry_date:       expiryISO,
        expiry_days:       daysDiff,
        cancellationReason: newStatus === 'expired' ? reason : undefined
      };

      // logueamos el payload
      console.log('DEBUG updateMembershipFRAPP payload:', {
        membershipId,
        changedById,
        reason,
        changes
      });

      // 6) Llamar al servidor
      api.updateMembershipFRAPP(membershipId, changedById, reason, changes)
        .then(res => {
          console.log('DEBUG updateMembershipFRAPP response:', res);
          if (res.error) {
            console.log('DEBUG updateMembershipFRAPP details:', res.details);
            // construimos un mensaje legible con los detalles que manda el servidor
            const detailMsgs = Array.isArray(res.details)
              ? res.details.map(d => `${d.field || 'campo'}: ${d.message}`).join('\n')
              : (res.message || res.error);
            alert('❌ No se pudo actualizar la membresía:\n' + detailMsgs);
          } else {
            alert(res.message || 'Membresía actualizada exitosamente');
          }
          // refrescar tabla
          const uid = searchId.value.replace(/\D/g,'');
          api.fetchMembresiasFRAPP(uid).then(renderMembFRAPP);
        })
        .catch(err => {
          alert('❌ Error al actualizar: ' + err.message);
        });
    });



      const cancel = document.createElement('button');
      cancel.textContent = '❌';
      cancel.className = 'cancel-membership-btn';
      cancel.title = 'Cancelar edición';
      cancel.style.marginLeft = '8px';
      cancel.addEventListener('click', () => {
        tr.innerHTML = tr._origHTML;
        delete tr._actionsAttached;
        attachRowActions(tr.closest('div').id, options);
      });

      accTd.appendChild(save);
      accTd.appendChild(cancel);
    }

    // USER_EMAIL is already declared in home.ejs inline script
    // Mapea cada correo autorizado a su changedById
    const USER_IDS = {
      'daniel.cardona@sentiretaller.com': 53,
      'eliana.montilla@sentiretaller.com': 48,
      'david.cardona@sentiretaller.com': 43,
      'diego.pelaez@sentiretaller.com': 6,
      'yuliana.giraldo@sentiretaller.com': 63,
    };
    // Update USER_EMAIL from server (already initialized in home.ejs)
    document.getElementById('currentUser').textContent = USER_EMAIL;
    api.getUserEmail()
      .then(e => {
        // USER_EMAIL = e; // Commented out - already set in home.ejs
        document.getElementById('currentUser').textContent = e;
        // hint visual (mantengo el alert en el click para el mensaje):
        if (!ADMINS.includes(USER_EMAIL)) {
          batchAddBtn.title = '🚫 Sin permisos';
          batchAddBtn.classList.add('semi-disabled');
        } else {
          batchAddBtn.classList.remove('semi-disabled');
        }
      })
      .catch(err => {
        console.error('getUserEmail error', err);
      });

    // Lista de correos autorizados
    const ADMINS = [
      'daniel.cardona@sentiretaller.com',
      'juan.pelaez@sentiretaller.com',
      'eliana.montilla@sentiretaller.com',
      'pablo.bustamante@sentiretaller.com',
      'david.cardona@sentiretaller.com'
    ];

    // ===== Lote de membresías: estado y lógica =====
    let BATCH_DEFAULTS = { productHandle:'intensivo_upb_2025', startUTC:'', expiryUTC:'' };
    const batchState = new Map(); // uid -> {..., notFound:boolean}
    let   batchOrder = [];

    function parseCedulasInput(){
      const lines = batchCedulas.value
        .split(/\r?\n/).map(s=>s.replace(/[^\d]/g,'').trim()).filter(Boolean);
      batchOrder = Array.from(new Set(lines));
      batchOrder.forEach(uid=>{
        if(!batchState.has(uid)) batchState.set(uid,{
          email:'', phone:'', givenName:'', familyName:'',
          emailOk:false, nameOk:false, addStatus:'', notFound:false
        });
      });
      for (const k of Array.from(batchState.keys())) if(!batchOrder.includes(k)) batchState.delete(k);
      // (re)pinta placeholders en las listas
      const ulRes = document.getElementById('batchResultsList');
      const ulAdd = document.getElementById('batchAddList');
      ulRes.innerHTML = batchOrder.map((uid,i)=>`
        <li id="batchRes-${i}">
          <span class="left cid">${uid}</span>
          <span class="arrow">➡️</span>
          <span class="right email"></span>
        </li>`).join('');
      ulAdd.innerHTML = batchOrder.map((_,i)=>`
        <li id="batchAdd-${i}">
          <span class="left email"></span>
          <span class="arrow">➡️</span>
          <span class="right status"></span>
        </li>`).join('');
      return batchOrder;
    }

    function setResultRow(i, txt){
      const el = document.querySelector(`#batchRes-${i} .right`); if (el) el.textContent = txt || '';
    }
    function setAddRow(i, txt){
      const el = document.querySelector(`#batchAdd-${i} .right`); if (el) el.textContent = txt || '';
    }
    function setAddEmail(i, email){
      const el = document.querySelector(`#batchAdd-${i} .left`); if (el) el.textContent = email || '';
    }

    // Pausar/Reanudar validación
    batchPauseBtn.addEventListener('click', () => {
      batchPaused = !batchPaused;
      batchPauseBtn.textContent = batchPaused ? '▶️ Reanudar' : '⏸️ Pausar';
    });
    async function waitIfPaused(){ while (batchPaused) { await sleep(150); } }

    batchValidate.addEventListener('click', async () => {
      const uids = parseCedulasInput();
      if (!uids.length){ alert('Pega al menos una cédula en la primera columna.'); return; }
      batchValidate.disabled = true;
      batchPauseBtn.disabled = false;
      batchPaused = false;
      batchPauseBtn.textContent = '⏸️ Pausar';

      try{
        // PASO 1: Obtener todos los CRMs en UNA SOLA llamada batch
        console.log(`🚀 Consultando ${uids.length} cédulas en batch a Strapi CRM...`);
        let crmResults = {};
        try {
          crmResults = await api.legacy('fetchCrmStrapiBatch', uids);
          console.log('📦 Respuesta cruda de fetchCrmStrapiBatch:', crmResults);
          console.log('📦 Tipo de respuesta:', typeof crmResults);

          // Verificar que sea un objeto válido
          if (!crmResults || typeof crmResults !== 'object') {
            console.warn('⚠️ Respuesta no es un objeto válido, usando objeto vacío');
            crmResults = {};
          }

          console.log(`✅ Batch CRM completado. Encontrados: ${Object.keys(crmResults).length}/${uids.length}`);
        } catch(e) {
          console.error('❌ Error en fetchCrmStrapiBatch:', e);
          console.warn('⚠️ Continuando con objeto vacío. Las cédulas se buscarán individualmente en getCitizenServer.');
          crmResults = {};
        }

        // PASO 2A: Actualizar TODOS los datos disponibles de Strapi de inmediato
        console.log('⚡ Procesando datos del batch de Strapi...');
        for (let i=0; i<uids.length; i++){
          const uid = uids[i];
          const st = batchState.get(uid);

          // Si ya hay emailOk, skip
          if (st.emailOk) {
            setResultRow(i, st.email);
            continue;
          }

          // Obtener TODOS los datos del CRM desde el resultado del batch
          const crmData = crmResults[uid];
          console.log(`🔍 crmData para ${uid}:`, crmData);
          if (crmData) {
            // Actualizar todos los campos disponibles
            st.email      = crmData.correo || '';
            st.phone      = crmData.celular || '';
            st.givenName  = crmData.nombres || '';
            st.familyName = crmData.apellidos || '';
            st.emailOk    = Boolean(crmData.correo);
            st.nameOk     = Boolean(crmData.nombres || crmData.apellidos);
            st.notFound   = !st.emailOk && !st.nameOk;
            console.log(`✅ Datos asignados para ${uid}: email="${st.email}", emailOk=${st.emailOk}, nombres="${st.givenName}", apellidos="${st.familyName}"`);
            batchState.set(uid, st);

            // Renderizar email inmediatamente si existe
            if (st.emailOk) {
              setResultRow(i, st.email);
            } else if (st.nameOk) {
              setResultRow(i, `📝 ${st.givenName} ${st.familyName}`.trim());
            } else {
              setResultRow(i, '⏳ Buscando en otra base...');
            }
          } else {
            // No existe en Strapi
            st.phone   = '';
            st.email   = '';
            st.emailOk = false;
            st.notFound = true;
            batchState.set(uid, st);
            setResultRow(i, '⏳ Buscando en otra base...');
          }
        }
        console.log('✅ Datos de Strapi procesados instantáneamente');

        // PASO 2B: Fallback a getCitizenServer SOLO para cédulas con datos incompletos
        // Estrategia: Solo llamar si falta email O nombres
        const uidsNeedingFallback = uids.filter(uid => {
          const st = batchState.get(uid);
          // Necesita fallback si: NO tiene email O NO tiene nombres
          return !st.emailOk || !st.nameOk;
        });

        if (uidsNeedingFallback.length > 0) {
          console.log(`🔍 Fallback a getCitizenServer para ${uidsNeedingFallback.length} cédulas con datos incompletos...`);

          for (let uid of uidsNeedingFallback) {
            await waitIfPaused();
            const st = batchState.get(uid);
            const i = uids.indexOf(uid);

            // Intentar obtener datos faltantes de getCitizenServer
            try {
              const cit = await withRetry(() => api.getCitizenServer(uid), 3, 1000);

              // Solo sobrescribir si el campo está vacío (fallback inteligente)
              if (!st.email && cit?.correo) {
                st.email = cit.correo;
                st.emailOk = true;
              }
              if (!st.givenName && cit?.nombres) st.givenName = cit.nombres;
              if (!st.familyName && cit?.apellidos) st.familyName = cit.apellidos;

              // Actualizar flags
              st.nameOk = Boolean(st.givenName || st.familyName);

              console.log(`✅ Fallback exitoso para ${uid}: correo=${st.email}, nombres=${st.givenName}, apellidos=${st.familyName}`);
            } catch(e){
              console.warn(`⚠️ getCitizenServer error para ${uid}:`, e);
            }

            batchState.set(uid, st);

            // Renderizar resultado final
            if (st.emailOk) {
              setResultRow(i, st.email);
            } else if (st.nameOk) {
              setResultRow(i, `📝 ${st.givenName} ${st.familyName}`.trim());
            } else {
              const parts = ['❌ No encontrado (correo y celular)'];
              if (!st.nameOk) parts.push('❌ No encontrado (nombres y apellidos)');
              setResultRow(i, parts.join(' / '));
            }
          }
        } else {
          console.log('✅ Todos los datos completos desde Strapi. No es necesario llamar a getCitizenServer.');
        }
      } finally {
        batchValidate.disabled = false;
        batchPauseBtn.disabled = true;
        batchPaused = false;
        batchPauseBtn.textContent = '⏸️ Pausar';
      }
    });

    batchAddBtn.addEventListener('click', async () => {
      // 🔐 Sólo ADMINS
      if (!ADMINS.includes(USER_EMAIL)) {
        alert('🚫 Sin permisos.');
        return;
      }
      // Si ya validaste (y por tanto ya renderizaste las listas), NO vuelvas a
      // llamar parseCedulasInput() para no borrar la columna de emails.
      const idsToAdd = batchOrder.length ? [...batchOrder] : parseCedulasInput();
      if (!idsToAdd.length){ alert('No hay cédulas para procesar.'); return; }
      // validar que no haya ❌ en emails
      const hasMissing = idsToAdd.some(uid => {
        const st = batchState.get(uid) || {};
        console.log(`🔍 Validando ${uid}:`, { email: st.email, emailOk: st.emailOk, estado: st });
        return !st.emailOk;
      });
      if (hasMissing){
        console.error('❌ Hay cédulas sin email válido:', idsToAdd.map(uid => {
          const st = batchState.get(uid) || {};
          return { uid, email: st.email, emailOk: st.emailOk };
        }));
        alert('Primero debes depurar / actualizar las bases de datos para que existan todos los usuarios a los que vamos a agregar la membresía');
        return;
      }
      // Validar que se hayan llenado los campos del plan
      if (!batchProduct.value) {
        alert('⚠️ Debes seleccionar un plan');
        return;
      }
      if (!batchStart.value) {
        alert('⚠️ Debes ingresar la fecha de inicio');
        return;
      }
      if (!batchDuration.value) {
        alert('⚠️ Debes ingresar la duración en días');
        return;
      }

      batchAddBtn.disabled = true;
      batchPauseBtn.disabled = false;
      batchPaused = false;
      batchPauseBtn.textContent = '⏸️ Pausar';

      let todayCO = {year:0,month:0,day:0};
      try { todayCO = await api.legacy('getColombiaTodayParts'); } catch(e){ console.warn('getColombiaTodayParts', e); }

      // Obtener datos del plan seleccionado
      const selectedPlanId = parseInt(batchProduct.value);
      const selectedPlan = batchMembershipPlans.find(p => p.id === selectedPlanId);
      const planName = selectedPlan ? selectedPlan.name : 'Plan desconocido';
      const startDateStr = getMembershipStartDate(batchStart.value);
      const expiryDateStr = getMembershipExpiryDate(batchExpiry.value);

      try{
        for (let i=0; i<idsToAdd.length; i++){
          await waitIfPaused(); // Permitir pausar el proceso

          const uid = idsToAdd[i];
          const st = batchState.get(uid) || {};
          setAddEmail(i, st.email);

          // Helper para capitalizar nombres
          const capitalize = (str) => {
            if (!str) return '';
            return str.split(' ').map(word =>
              word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
            ).join(' ');
          };

          // Payload completo con todos los campos (INTENTO 1: crear usuario + membresía)
          const payload = {
            email: st.email,
            givenName: capitalize(st.givenName || ''),
            familyName: capitalize(st.familyName || ''),
            phone: st.phone || '',
            identityType: 'CC',
            identityDocument: uid,
            membershipPlanId: selectedPlanId,
            membershipStartDate: startDateStr,
            membershipEndDate: expiryDateStr
          };

          try{
            let res = await withRetry(()=>api.registerMembFRAPP(payload), 3, 1000);

            // Si el error indica que el usuario ya existe, hacer segundo intento
            if (res && res.error && /createMembershipIfUserExists/i.test(res.error)) {
              console.log(`Usuario existente detectado para ${uid}, agregando solo membresía...`);
              setAddRow(i, '⚠️ Usuario existente, agregando membresía...');

              // INTENTO 2: Solo agregar membresía a usuario existente
              const retryPayload = {
                email: st.email,
                membershipPlanId: selectedPlanId,
                membershipStartDate: startDateStr,
                membershipEndDate: expiryDateStr,
                createMembershipIfUserExists: true,
                allowDuplicateMemberships: false
              };

              res = await withRetry(()=>api.registerMembFRAPP(retryPayload), 3, 1000);
            }

            // Evaluar resultado final
            if (res && res.success === true){
              st.addStatus = '✅ Ok';
              setAddRow(i, st.addStatus);
              // anotar en Patrocinios
              try{
                await api.appendPatrocinioRecord({
                  year: todayCO.year, month: todayCO.month, day: todayCO.day,
                  uid: uid,
                  givenName: st.givenName || '',
                  familyName: st.familyName || '',
                  phone: st.phone || '',
                  email: st.email,
                  productHandle: planName,
                  eventObservation: `Lote masivo agregado por ${USER_EMAIL || ''}`
                });
              } catch(e){ console.warn('appendPatrocinioRecord error', uid, e); }
            } else {
              console.error('registerMembFRAPP error', uid, res);
              st.addStatus = '❌ Error';
              setAddRow(i, st.addStatus);
            }
          } catch(e){
            console.error('registerMembFRAPP exception', uid, e);
            st.addStatus = '❌ Error';
            setAddRow(i, st.addStatus);
          }
          batchState.set(uid, st);
       }
      } finally {
        batchAddBtn.disabled = false;
        batchPauseBtn.disabled = true;
        batchPaused = false;
        batchPauseBtn.textContent = '⏸️ Pausar';
      }
    });

    // Capitalizar helper
    function humanCapitalize(str) {
      return str
        .trim()
        .split(/\s+/)
        .map(w => w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }

    // Token global para invalidar callbacks de búsquedas anteriores
    if (typeof window.CURRENT_FETCH_SEQ === 'undefined') {
      window.CURRENT_FETCH_SEQ = 0;
    }

    // Refs del modal
    const addMembModal = document.getElementById('addMembModal');
    const addMembForm  = document.getElementById('addMembForm');
    const cancelAdd    = document.getElementById('cancelAddMemb');

    // Inputs del modal
    const inpEmail  = document.getElementById('modalEmail');
    const inpGiven  = document.getElementById('modalGiven');
    const inpFamily = document.getElementById('modalFamily');
    const inpPhone  = document.getElementById('modalPhone');
    const selHandle = document.getElementById('modalHandle');
    const inpStart  = document.getElementById('modalStart');
    const inpDuration = document.getElementById('modalDuration');
    const inpExpiry = document.getElementById('modalExpiry');
    const inpEvento = document.getElementById('modalEvento');

    // Variable global para almacenar los planes
    let membershipPlans = [];

    // Función para cargar los planes de membresía
    async function loadMembershipPlans() {
      try {
        const plans = await api.getActiveMembershipPlans();
        membershipPlans = plans;

        // Llenar el select con los planes
        selHandle.innerHTML = '<option value="" disabled selected>Seleccione un plan</option>';

        if (plans && plans.length > 0) {
          plans.forEach(plan => {
            const option = document.createElement('option');
            option.value = plan.id;
            option.textContent = plan.name;
            option.dataset.planId = plan.id;
            selHandle.appendChild(option);
          });
          console.log('✅ Planes de membresía cargados:', plans.length);
        } else {
          selHandle.innerHTML = '<option value="" disabled selected>No hay planes disponibles</option>';
          console.warn('⚠️ No se encontraron planes de membresía');
        }
      } catch (err) {
        console.error('❌ Error cargando planes:', err);
        selHandle.innerHTML = '<option value="" disabled selected>Error al cargar planes</option>';
        alert('❌ Error al cargar los planes de membresía. Por favor contacta al administrador.\n\nDetalle: ' + (err.message || err));
      }
    }

    // Listener para setear fecha fin automática según el plan seleccionado
    selHandle.addEventListener('change', () => {
      const selectedOption = selHandle.options[selHandle.selectedIndex];
      const planName = selectedOption ? selectedOption.text : '';

      // Si es Simulación especializada UdeA o Simulación UniValle 2026, fecha fin = 31/05/2026
      if (planName.includes('Simulación especializada UdeA') || planName.includes('Simulación UniValle 2026')) {
        inpExpiry.value = '2026-05-31';
        calcularDuracion(); // Recalcular duración basada en la nueva fecha fin
      }
    });


    const modalResponse = document.getElementById('modalResponse');
    const btnSubmit     = addMembForm.querySelector('button[type="submit"]');
    const btnCancel     = document.getElementById('cancelAddMemb');

    // Función para resetear modal
    function resetModal() {
      addMembForm.reset();
      [inpEmail, inpGiven, inpFamily, inpPhone,
      selHandle, inpStart, inpDuration, inpExpiry,
      btnSubmit, btnCancel
      ].forEach(el => {
        el.disabled = false;
        el.removeAttribute('readonly');
        el.readOnly = false; // Asegurar que readOnly también se elimine
      });

      // Limpiar y ocultar modalResponse
      modalResponse.innerHTML = '';
      modalResponse.style.display = 'none';

      // Asegurar que el formulario esté visible
      addMembForm.style.display = '';
    }

    // Función para mostrar respuesta API y botón continuar
    function showApiResponse(res) {
      addMembForm.style.display = 'none';
      modalResponse.innerHTML = '';
      modalResponse.style.display = 'block'; // Mostrar el div de respuesta
      const ok = res.success===true;
      if (ok) {
        // Limpiar el mensaje quitando la parte de "(X roles sincronizados)"
        let message = res.message || 'Operación exitosa';
        message = message.replace(/\s*\(\d+\s+roles?\s+sincronizados?\)\s*/gi, '');

        // Crear contenedor para mensaje y botón
        const messageText = document.createElement('div');
        messageText.textContent = '✅ ' + message;
        messageText.style.marginBottom = '16px'; // Espacio entre texto y botón
        modalResponse.appendChild(messageText);
      } else {
        modalResponse.textContent = '❌ ' + (res.error || 'Error desconocido');
      }

      const btn = document.createElement('button');
      btn.textContent = '✅ Continuar';
      btn.classList.add('continue-btn');
      btn.addEventListener('click', () => {

        // ——— 1) Si fue éxito, guardamos en la hoja de Patrocinios ———
        if (ok) {
          const today = new Date();
          // Obtener el nombre del plan seleccionado
          const selectedPlanName = selHandle.options[selHandle.selectedIndex].text;
          api.appendPatrocinioRecord({
            year:               today.getFullYear(),
            month:              today.getMonth() + 1,
            day:                today.getDate(),
            uid:                searchId.value.replace(/\D/g,''),
            givenName:          inpGiven.value,
            familyName:         inpFamily.value,
            phone:              inpPhone.value,
            email:              inpEmail.value,
            productHandle:      selectedPlanName,
            eventObservation:   inpEvento.value
          }).catch(err => console.error('Error al anotar patrocinio:', err));
        }

        // ——— 2) Cerramos modal y reseteamos completamente ———
        addMembModal.classList.add('hidden');
        resetModal(); // Resetear completamente el modal

        // ——— 3) Refrescamos la tabla "Plataforma nueva" ———
        api.fetchMembresiasFRAPP(searchId.value.replace(/\D/g,''))
          .then(renderMembFRAPP)
          .catch(err => console.error('Error recargando membresías:', err));

      });
      modalResponse.appendChild(btn);
    }


    // Botón "➕ Agregar plan
    addMembBtn.addEventListener('click', async () => {
      resetModal();

      const uid = searchId.value.replace(/\D/g,'').trim();
      if (!uid) return alert('❗ Debes ingresar un Nro ID antes.');
      if (!ADMINS.includes(USER_EMAIL)) return alert('🚫 Sin permisos.');

      // Cargar planes de membresía y esperar a que termine
      await loadMembershipPlans();

      // Prefill
      inpEmail.value  = correo.value.trim();
      inpGiven.value  = nombres.value.trim();
      inpFamily.value = apellidos.value.trim();
      inpPhone.value  = celular.value.trim().replace(/[^\d]/g,'');

      // 2) Solo‐lectura si venían con valor
      [inpEmail, inpGiven, inpFamily, inpPhone].forEach(el => {
        el.readOnly = !!el.value;
      });

      // 3) Fijar fecha inicio siempre como hoy
      inpStart.value = formatLocalDate(new Date());

      // Limpiar valores residuales
      inpExpiry.value = '';
      inpDuration.value = '';

      // 4) Mostrar modal
      addMembModal.classList.remove('hidden');
    });


    // Cerrar sin guardar
    cancelAdd.addEventListener('click', () => {
      addMembModal.classList.add('hidden');
      resetModal();
    });

    // Cerrar modal al hacer click en el backdrop (fuera del modal)
    addMembModal.addEventListener('click', (e) => {
      // Cerrar si el click fue en el backdrop o en el modal pero NO en el dialog
      if (e.target.classList.contains('modal-backdrop') || e.target === addMembModal) {
        addMembModal.classList.add('hidden');
        resetModal();
      }
    });

    // formatDate helper
    function formatDate(d) {
      let yyyy = d.getFullYear();
      let mm = String(d.getMonth()+1).padStart(2,'0');
      let dd = String(d.getDate()).padStart(2,'0');
      return `${yyyy}-${mm}-${dd}`;
    }

    const diferenciaEnDias = inclusiveDays;

    function sumarDias(d, n) {
      const x = new Date(d);
      x.setDate(x.getDate() + n);
      return x;
    }

    const ONE_DAY = 24 * 60 * 60 * 1000;
    function inclusiveDays(a, b) {
      const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
      const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
      return Math.floor((utcB - utcA) / ONE_DAY) + 1;
    }

    function parseLocalDate(str) {
      const [y, m, d] = str.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    // Nueva función para calcular fecha fin basada en duración
    function calcularFechaFin() {
      if (!inpStart.value || !inpDuration.value) {
        return;
      }

      const duration = parseInt(inpDuration.value);
      if (duration < 1 || isNaN(duration)) {
        return;
      }

      const start = parseLocalDate(inpStart.value);
      const end = sumarDias(start, duration);
      inpExpiry.value = formatLocalDate(end);
    }

    // Nueva función para calcular duración basada en fecha fin
    function calcularDuracion() {
      if (!inpStart.value || !inpExpiry.value) {
        return;
      }

      const start = parseLocalDate(inpStart.value);
      const end = parseLocalDate(inpExpiry.value);

      // Validar que fecha fin sea posterior a fecha inicio
      if (end <= start) {
        inpDuration.value = '';
        return;
      }

      // Calcular diferencia en días
      const diffTime = end - start;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      inpDuration.value = diffDays;
    }

    function updateDaysRemaining() {
      if (!currentFreeze.expiryIso) {
        daysRemaining.value = '';
        return;
      }
      // Parsear expiryIso ("YYYY-MM-DD") en local
      const [y, m, d] = currentFreeze.expiryIso.split('-').map(Number);
      const expDate = new Date(y, m - 1, d);

      // Hoy a medianoche local
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      // Resto en días completos
      const diff = Math.floor((expDate - today) / (1000 * 60 * 60 * 24));
      daysRemaining.value = diff > 0 ? diff : 0;
    }

    // Listeners para cálculo bidireccional (duración ↔ fecha fin)
    inpStart.addEventListener('change', () => {
      // Si hay duración, recalcular fecha fin
      if (inpDuration.value) {
        calcularFechaFin();
      }
      // Si hay fecha fin, recalcular duración
      else if (inpExpiry.value) {
        calcularDuracion();
      }
    });

    inpDuration.addEventListener('input', calcularFechaFin);
    inpExpiry.addEventListener('change', calcularDuracion);

    // Cada vez que cambie el Producto
    producto.addEventListener('input', calcularAnalisis);
    producto.addEventListener('change', calcularAnalisis);

    // Cada vez que cambie el nro de cuotas
    cuotas.addEventListener('change', calcularAnalisis);

    // Handle create link/agreement button click
    createLinkBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const isValid = await validateForm();
      if (isValid) {
        const numberOfInstallments = Number(cuotas.value) || 0;
        if (numberOfInstallments === 1) {
          // Process single payment (contado)
          await processSinglePayment();
        } else if (numberOfInstallments > 1) {
          // Process installment payment (financiada) - Crear Acuerdo
          await processInstallmentPayment();
        }
      }
    });

    // Función para procesar venta financiada (Crear Acuerdo)
    async function processInstallmentPayment() {
      console.log('🚀 Iniciando creación de acuerdo');

      // Solo daniel.cardona puede crear acuerdos de pago
      if (USER_EMAIL !== 'daniel.cardona@sentiretaller.com') {
        alert('⛔ Solo daniel.cardona@sentiretaller.com puede crear acuerdos de pago.');
        return;
      }

      try {
        // Validar que existe plan de pagos
        if (!planState || planState.length === 0) {
          alert('❌ Error: No se ha generado un plan de pagos válido.');
          return;
        }

        // Recopilar datos del formulario
        const formData = {
          nombres: nombres.value.trim(),
          apellidos: apellidos.value.trim(),
          cedula: searchId.value.replace(/\D/g,'').trim(),
          correo: correo.value.trim(),
          celular: celular.value.trim(),
          valor: valorInput.value.trim(),
          comercial: comercial.value.trim(),
          producto: producto.value.trim(),
          inicioTipo: inicioTipo.value,
          inicioFecha: inicio.value
        };

        // Preparar plan de pagos para el backend
        const planPagos = planState.map(cuota => ({
          fecha: cuota.date.toISOString(),
          valor: cuota.amount
        }));

        console.log('📋 Datos para crear acuerdo:', { formData, planPagos });

        // Deshabilitar botón durante el proceso
        createLinkBtn.disabled = true;
        createLinkBtn.classList.add('loading');
        createLinkBtn.innerHTML = '<span class="spinner"></span>Creando Acuerdo...';

        // Llamar a la función del backend
        const result = await api.crearAcuerdo(
              formData.nombres,
              formData.apellidos,
              formData.cedula,
              formData.correo,
              formData.celular,
              formData.valor,
              formData.comercial,
              planPagos,
              formData.producto,
              formData.inicioTipo,
              formData.inicioFecha
            );

        console.log('✅ Resultado del backend:', result);

        if (result.success) {
          alert(`✅ ¡Acuerdo creado exitosamente!\n\nArchivo: ${result.nombreArchivo}\nNúmero de acuerdo: ${result.nroAcuerdo}`);
          console.log('📄 Documento creado:', result.documentoUrl);

          // Mostrar resultado en la UI
          showAgreementSuccess(result);

        } else {
          console.log('❌ Error en la creación:', result);
          alert(`❌ Error al crear el acuerdo:\n${result.message}`);
        }

      } catch (error) {
        console.log('❌ Error en frontend:', error);
        alert('❌ Error de conexión al crear el acuerdo. Por favor intente nuevamente.');
      } finally {
        // Restaurar botón
        createLinkBtn.disabled = false;
        createLinkBtn.classList.remove('loading');
        updateCreateButtonText(Number(cuotas.value) || 1);
      }
    }

    // Función para mostrar el resultado del acuerdo creado con preview
    function showAgreementSuccess(result) {
      const linkResult = document.getElementById('linkResult');

      linkResult.innerHTML = `
        <div style="background: #f0f8f0; border: 2px solid #13bf81; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="color: #13bf81; font-size: 20px;">&#10004;</span>
            <h3 style="margin: 0; color: #13bf81; font-size: 16px;">Acuerdo creado exitosamente</h3>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <span class="label" style="min-width: 80px;">Archivo:</span>
            <span style="flex: 1; font-weight: 600;">${result.nombreArchivo}</span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span class="label" style="min-width: 80px;">Número:</span>
            <span style="flex: 1; font-weight: 600; color: #075183;">${result.nroAcuerdo}</span>
          </div>

          ${result.htmlPreview ? `
          <div style="margin-top: 12px;">
            <p style="font-weight: 600; margin-bottom: 8px; color: #333;">Vista previa del documento:</p>
            <iframe
              id="acuerdoPreviewFrame"
              style="width: 100%; height: 700px; border: 1px solid #ddd; border-radius: 4px; background: #fff;"
              sandbox="allow-same-origin"
            ></iframe>
          </div>
          ` : ''}
        </div>
      `;

      // Escribir el HTML en el iframe de forma segura
      if (result.htmlPreview) {
        const iframe = document.getElementById('acuerdoPreviewFrame');
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        iframeDoc.open();
        iframeDoc.write(result.htmlPreview);
        iframeDoc.close();
      }
    }

    // Handle buscar acuerdo button click
    const buscarAcuerdoBtn = document.getElementById('buscarAcuerdoBtn');
    buscarAcuerdoBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      const nroAcuerdo = document.getElementById('nroAcuerdo').value.trim();
      if (!nroAcuerdo) {
        alert('Por favor ingrese un número de acuerdo');
        return;
      }

      // Deshabilitar el botón mientras se hace la búsqueda
      buscarAcuerdoBtn.disabled = true;
      buscarAcuerdoBtn.innerHTML = '<span class="spinner"></span>Buscando...';

      // Llamada al API para consultar el acuerdo
      api.consultarAcuerdo(nroAcuerdo)
        .then((resultado) => {
          try {
            console.log('Respuesta del servidor:', resultado);

            if (!resultado.success) {
              // Mostrar mensaje de error específico
              if (resultado.error === 'NOT_FOUND') {
                alert('No se encontró ningún acuerdo con ese número');
              } else {
                alert(resultado.message || 'Error al consultar el acuerdo');
              }
              return;
            }

            // Validar que el número de documento del acuerdo coincida con la cédula actual
            const cedulaActual = document.getElementById('searchId').value.replace(/\D/g,'').trim();
            const dataAcuerdo = Array.isArray(resultado.data) ? resultado.data[0] : resultado.data;
            const numeroDocumentoAcuerdo = String(dataAcuerdo?.numero_documento || '').replace(/\D/g,'').trim();

            if (cedulaActual && numeroDocumentoAcuerdo && cedulaActual !== numeroDocumentoAcuerdo) {
              alert(`❌ El número de acuerdo no corresponde al estudiante actual.\n\nEstudiante actual: ${cedulaActual}\nAcuerdo corresponde a: ${numeroDocumentoAcuerdo}\n\nPor favor valide nuevamente el número de acuerdo.`);
              return;
            }

            // Poblar los campos con los datos obtenidos
            document.getElementById('productoAcuerdo').value = dataAcuerdo?.producto || '';
            document.getElementById('comercialAcuerdo').value = dataAcuerdo?.comercial || '';
            document.getElementById('fechaInicioAcuerdo').value = dataAcuerdo?.fechaInicio || '';

            // Actualizar campos de correo y celular con datos del acuerdo (campos siempre bloqueados)
            const correoConfianza = document.getElementById('correoConfianza');
            const celularConfianza = document.getElementById('celularConfianza');

            // Solo actualizar si el acuerdo tiene datos más recientes o diferentes
            if (dataAcuerdo?.correo) {
              correoConfianza.value = dataAcuerdo.correo;
              correoConfianza.title = 'Campo automático: datos del acuerdo registrado';
            }

            if (dataAcuerdo?.celular) {
              celularConfianza.value = dataAcuerdo.celular;
              celularConfianza.title = 'Campo automático: datos del acuerdo registrado';
            }

            // Asegurar que siempre estén de solo lectura
            correoConfianza.readOnly = true;
            celularConfianza.readOnly = true;

            const estadoAcuerdo = document.getElementById('estadoAcuerdo');
            const otorgarAccesoBtn = document.getElementById('otorgarAccesoBtn');
            const estadoValor = dataAcuerdo?.estado || '';

            estadoAcuerdo.value = estadoValor;

            // Aplicar estilo condicional al estado
            estadoAcuerdo.classList.remove('sin-firmar');
            if (estadoValor === 'sin_firmar') {
              estadoAcuerdo.classList.add('sin-firmar');
            }

            // Mostrar/ocultar botón según el estado
            if (estadoValor === 'firmado') {
              otorgarAccesoBtn.style.display = 'inline-block';
            } else {
              otorgarAccesoBtn.style.display = 'none';
            }

            console.log('Campos poblados correctamente con:', resultado.data);

          } finally {
            // Restaurar el botón
            buscarAcuerdoBtn.disabled = false;
            buscarAcuerdoBtn.innerHTML = '🔍 Buscar acuerdo';
          }
        })
        .catch((error) => {
          console.error('Error al buscar acuerdo:', error);
          alert('Error de conexión al buscar el acuerdo. Por favor intente nuevamente.');

          // Restaurar el botón
          buscarAcuerdoBtn.disabled = false;
          buscarAcuerdoBtn.innerHTML = '🔍 Buscar acuerdo';
        });
    });

    // Prevenir edición manual de campos automáticos (medida de seguridad adicional)
    const correoConfianza = document.getElementById('correoConfianza');
    const celularConfianza = document.getElementById('celularConfianza');

    // Bloquear eventos de edición
    [correoConfianza, celularConfianza].forEach(field => {
      field.addEventListener('keydown', (e) => e.preventDefault());
      field.addEventListener('keypress', (e) => e.preventDefault());
      field.addEventListener('input', (e) => e.preventDefault());
      field.addEventListener('paste', (e) => e.preventDefault());
      field.addEventListener('drop', (e) => e.preventDefault());
    });

    // Handle otorgar acceso en confianza button click
    const otorgarAccesoBtn = document.getElementById('otorgarAccesoBtn');
    otorgarAccesoBtn.addEventListener('click', async (e) => {
      e.preventDefault();

      // Limpiar mensaje de éxito anterior si existe
      const existingMessage = document.getElementById('membershipCreatedMessage');
      if (existingMessage) {
        existingMessage.remove();
      }

      try {
        const cedula = searchId.value.replace(/\D/g,'').trim();
        const nombres = document.getElementById('nombresConfianza').value.trim();
        const apellidos = document.getElementById('apellidosConfianza').value.trim();
        const correo = document.getElementById('correoConfianza').value.trim();
        const celular = document.getElementById('celularConfianza').value.trim();
        const producto = document.getElementById('productoAcuerdo').value.trim();
        const fechaInicio = document.getElementById('fechaInicioAcuerdo').value.trim();
        const nroAcuerdo = document.getElementById('nroAcuerdo').value.trim();
        const comercial = document.getElementById('comercialAcuerdo').value.trim();

        if (!cedula || !nombres || !apellidos || !correo || !celular || !producto || !fechaInicio) {
          alert('Por favor, complete todos los campos necesarios.');
          return;
        }

        if (!nroAcuerdo) {
          alert('Por favor, ingrese el número de acuerdo.');
          return;
        }

        if (!comercial) {
          alert('Por favor, busque el acuerdo para obtener la información del comercial. Use el botón "🔍 Buscar acuerdo".');
          return;
        }

        otorgarAccesoBtn.disabled = true;
        otorgarAccesoBtn.innerHTML = '⏳ Sincronizando CRM...';

        // 0. Crear o actualizar contacto en CRM (ActiveCampaign)
        try {
          console.log('📇 Sincronizando contacto en CRM...');
          const crmResult = await api.createOrUpdateCRMContact({
            correo: correo,
            nombres: nombres,
            apellidos: apellidos,
            celular: celular,
            cedula: cedula
          });
          console.log('📇 CRM sincronizado:', crmResult);
        } catch (crmError) {
          console.error('⚠️ Error sincronizando CRM (continuando proceso):', crmError);
          // No bloquear el proceso si falla CRM, solo registrar el error
        }

        otorgarAccesoBtn.innerHTML = '⏳ Procesando...';

        // 1. Obtener datos de membresías (usar cache o consultar)
        let memberships;

        console.log('currentMembershipsData:', currentMembershipsData);
        console.log('Cédula a procesar:', cedula);

        if (currentMembershipsData && currentMembershipsData.memberships) {
          // Verificar que la cédula coincida con los datos cargados (si está disponible)
          if (currentMembershipsData.user && currentMembershipsData.user.identityDocument) {
            const loadedCedula = String(currentMembershipsData.user.identityDocument).replace(/\D/g, '');
            if (loadedCedula === cedula) {
              console.log('Usando datos de membresías del cache');
              memberships = currentMembershipsData;
            } else {
              console.log('Cédula no coincide con cache, consultando servidor...');
              memberships = null;
            }
          } else {
            console.log('Usando datos de cache sin validación de cédula');
            memberships = currentMembershipsData;
          }
        }

        // Si no hay datos en cache o no coinciden, consultar el servidor
        if (!memberships) {
          console.log('Consultando membresías desde el servidor...');
          memberships = await api.fetchMembresiasFRAPP(cedula);

          if (!memberships) {
            throw new Error('No se pudo obtener respuesta del servidor de membresías');
          }

          if (memberships.error) {
            throw new Error('Error al obtener membresías: ' + memberships.error);
          }

          // Actualizar cache
          currentMembershipsData = memberships;
        }

        if (!memberships.memberships) {
          throw new Error('No se encontraron membresías en la respuesta del servidor');
        }

        // 2. Analizar membresías élite y encontrar la fecha de expiración más lejana
        let latestEliteExpiry = null;
        let eliteMembershipsFound = 0;

        console.log('Analizando membresías:', memberships.memberships);

        for (const membership of memberships.memberships || []) {
          let isElite = false;

          console.log('Analizando membresía:', membership);

          // Membresías "viejas" - verificar roles
          if (membership.membershipPlan === null || membership.membershipPlan === undefined) {
            if (membership.roles && membership.roles.toLowerCase() === 'elite') {
              isElite = true;
              console.log('Membresía élite vieja encontrada (roles)');
            }
          }

          // Membresías "nuevas" - verificar membershipPlan.name o product.name
          if (membership.membershipPlan && membership.membershipPlan.name) {
            const planName = membership.membershipPlan.name.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar acentos
            if (planName.includes('elite')) {
              isElite = true;
              console.log('Membresía élite nueva encontrada (membershipPlan):', membership.membershipPlan.name);
            }
          }
          // También verificar product.name para el formato actual
          else if (membership.product && membership.product.name) {
            const productName = membership.product.name.toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // quitar acentos
            if (productName.includes('elite')) {
              isElite = true;
              console.log('Membresía élite nueva encontrada (product):', membership.product.name);
            }
          }
          // Fallback: verificar roles directamente si no hay membershipPlan ni product
          else if (membership.roles && membership.roles.toLowerCase() === 'elite') {
            isElite = true;
            console.log('Membresía élite encontrada (roles fallback)');
          }

          if (isElite && membership.expiryDate) {
            // Solo considerar membresías élite con status "active" o "scheduled"
            const status = membership.status ? membership.status.toLowerCase() : '';
            if (status === 'active' || status === 'scheduled') {
              eliteMembershipsFound++;
              const expiryDate = new Date(membership.expiryDate);
              console.log('Fecha de expiración élite válida (status:', status, '):', expiryDate);
              if (!latestEliteExpiry || expiryDate > latestEliteExpiry) {
                latestEliteExpiry = expiryDate;
              }
            } else {
              console.log('Membresía élite ignorada por status:', status);
            }
          }
        }

        console.log(`Membresías élite activas/programadas encontradas: ${eliteMembershipsFound}, Última expiración: ${latestEliteExpiry}`);

        // 3. Validar que no haya traslape de fechas mayor a 1 día
        if (latestEliteExpiry) {
          // Convertir fechas a zona horaria de Colombia para comparación
          const fechaInicioDate = new Date(fechaInicio + 'T00:00:00');

          // Crear fecha de corte (1 día antes del vencimiento de membresía élite)
          const dayBeforeExpiry = new Date(latestEliteExpiry);
          dayBeforeExpiry.setDate(dayBeforeExpiry.getDate() - 1);

          console.log('Validación de fechas:');
          console.log('Fecha inicio acuerdo:', fechaInicioDate);
          console.log('Límite permitido (1 día antes del vencimiento élite):', dayBeforeExpiry);
          console.log('Fecha vencimiento élite:', latestEliteExpiry);

          if (fechaInicioDate < dayBeforeExpiry) {
            const formatDate = (date) => date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' });
            alert(`No es posible otorgar acceso en confianza. La fecha de inicio del acuerdo (${formatDate(fechaInicioDate)}) no puede ser anterior al ${formatDate(dayBeforeExpiry)} (1 día antes del vencimiento de la membresía élite actual: ${formatDate(latestEliteExpiry)}). Esto quitaría días de acceso al estudiante.`);
            return;
          }
        } else {
          console.log('No se encontraron membresías élite con status "active" o "scheduled". Procediendo sin validación de traslape.');
        }

        // 4. Determinar membershipPlanId y duración según el producto
        let membershipPlanId;
        let durationDays;

        if (producto.includes('9 meses')) {
          membershipPlanId = 3;
          durationDays = 288;
        } else if (producto.includes('6 meses')) {
          membershipPlanId = 4;
          durationDays = 188;
        } else {
          throw new Error('Tipo de producto no reconocido. Solo se permiten productos de 6 o 9 meses.');
        }

        // 5. Calcular fechas usando las funciones de formato de membresía
        // Verificar si la fecha de inicio es anterior a hoy (hasta máximo 3 días)
        let fechaInicioAjustada = fechaInicio;
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);
        const fechaInicioObj = parseLocalDate(fechaInicio);
        fechaInicioObj.setHours(0, 0, 0, 0);

        const diffMs = hoy.getTime() - fechaInicioObj.getTime();
        const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        console.log('Diferencia en días entre hoy y fecha inicio:', diffDias);

        // Si la fecha de inicio está en el pasado (hasta 3 días), ajustar a hoy
        if (diffDias > 0 && diffDias <= 3) {
          console.log(`⚠️ Fecha inicio está ${diffDias} día(s) en el pasado. Ajustando fechas...`);
          fechaInicioAjustada = formatLocalDate(hoy);
          console.log('Fecha inicio ajustada a hoy:', fechaInicioAjustada);
        } else if (diffDias > 3) {
          console.log(`❌ Fecha inicio está ${diffDias} días en el pasado (más de 3). No se ajusta, se dejará que FRAPP genere el error.`);
        }

        const membershipStartDate = getMembershipStartDate(fechaInicioAjustada);

        // Calcular fecha de fin sumando los días de duración (desde la fecha ajustada)
        const startDateObj = parseLocalDate(fechaInicioAjustada);
        startDateObj.setDate(startDateObj.getDate() + durationDays);
        const endDateString = formatLocalDate(startDateObj);
        const membershipEndDate = getMembershipExpiryDate(endDateString);

        console.log('Producto:', producto);
        console.log('MembershipPlanId:', membershipPlanId);
        console.log('Duración en días:', durationDays);
        console.log('Fecha inicio (original):', fechaInicio);
        console.log('Fecha inicio (ajustada):', fechaInicioAjustada);
        console.log('Fecha inicio (formateada):', membershipStartDate);
        console.log('Fecha fin (formateada):', membershipEndDate);

        // 6. Crear payload para registrar membresía
        const payload = {
          email: correo,
          givenName: nombres,
          familyName: apellidos,
          phone: celular,
          identityType: 'CC',
          identityDocument: cedula,
          membershipPlanId: membershipPlanId,
          membershipStartDate: membershipStartDate,
          membershipEndDate: membershipEndDate
        };

        // 7. Registrar la nueva membresía
        console.log('Payload para registro:', payload);

        const result = await new Promise((resolve, reject) => {
          api.registerMembFRAPP(payload)
            .then((result) => {
              console.log('Resultado del registro (raw):', result);
              console.log('Tipo de resultado:', typeof result);
              console.log('result.success:', result?.success);
              console.log('result.error:', result?.error);
              console.log('result.message:', result?.message);
              console.log('result.status:', result?.status);
              console.log('Resultado completo:', JSON.stringify(result, null, 2));
              resolve(result);
            })
            .catch((error) => {
              console.error('Error en registerMembFRAPP:', error);
              reject(error);
            });
        });

        if (result && result.success) {
          alert('✅ Acceso en confianza otorgado exitosamente!');

          // Mostrar URL de activación si está disponible
          const activationData = result.data?.activation || result.activation;
          if (activationData && activationData.activationUrl) {
            const urlActivacionSection = document.getElementById('urlActivacionSection');
            const urlActivacionInput = document.getElementById('urlActivacion');
            const copiarUrlBtn = document.getElementById('copiarUrlBtn');

            urlActivacionInput.value = activationData.activationUrl;
            urlActivacionSection.style.display = 'block';
            copiarUrlBtn.disabled = false;

            console.log('URL de activación generada:', activationData.activationUrl);
          } else {
            console.log('No se recibió URL de activación en la respuesta');
          }

          // No limpiar ningún campo después de otorgar acceso exitosamente

          // Refrescar membresías si estamos en la pestaña correcta
          const uid = searchId.value.replace(/\D/g,'').trim();
          if (uid) {
            api.fetchMembresiasFRAPP(uid)
              .then(renderMembFRAPP)
              .catch(err => console.error('Error recargando membresías:', err));
          }

          // Guardar registro en Google Sheets en paralelo
          const confianzaData = {
            nombres: nombres,
            apellidos: apellidos,
            cedula: cedula,
            celular: celular,
            correo: correo,
            producto: producto,
            comercial: comercial,
            nroAcuerdo: nroAcuerdo,
            fechaInicio: fechaInicio
          };

          api.saveConfianzaRecord(confianzaData)
            .then(result => console.log('Registro guardado en Sheets:', result))
            .catch(err => console.error('Error guardando en Sheets:', err));
        } else {
          console.log('ENTRANDO AL ELSE - result:', result);
          console.log('result.success:', result?.success);
          console.log('result.error:', result?.error);

          // Verificar si es error de usuario existente para intentar registro con usuario existente
          const errorText = result?.error ? result.error.toLowerCase() : '';
          console.log('Error text para análisis:', errorText);
          console.log('Includes mismo email:', errorText.includes('mismo email'));
          console.log('Includes el usuario ya existe:', errorText.includes('el usuario ya existe'));

          if (result?.error && result.error.includes('createMembershipIfUserExists')) {
            console.log('Usuario ya existe con el mismo email, intentando crear membresía...');

            // Crear nuevo payload para usuario existente
            const payloadExistingUser = {
              email: correo,
              membershipPlanId: membershipPlanId,
              membershipStartDate: membershipStartDate,
              membershipEndDate: membershipEndDate,
              createMembershipIfUserExists: true
            };

            console.log('Payload para usuario existente:', payloadExistingUser);

            // Intentar crear membresía para usuario existente
            const resultExisting = await new Promise((resolve, reject) => {
              api.registerMembFRAPP(payloadExistingUser)
                .then((result) => {
                  console.log('Resultado para usuario existente (raw):', result);
                  resolve(result);
                })
                .catch((error) => {
                  console.error('Error en registerMembFRAPP para usuario existente:', error);
                  reject(error);
                });
            });

            if (resultExisting && resultExisting.success) {
              // Crear elemento de mensaje de éxito después del botón
              const successMessage = document.createElement('div');
              successMessage.id = 'membershipCreatedMessage';
              successMessage.style.cssText = `
                margin-top: 15px;
                padding: 15px;
                background-color: #d4edda;
                border: 1px solid #c3e6cb;
                border-radius: 5px;
                color: #155724;
                cursor: pointer;
                transition: background-color 0.2s;
              `;
              successMessage.innerHTML = '✅ Membresía creada correctamente, no se genera URL de activación pues el(la) estudiante ya estaba creado(a) en FRapp, haz click aquí para consultar las membresías';

              // Agregar hover effect
              successMessage.addEventListener('mouseenter', () => {
                successMessage.style.backgroundColor = '#c7e7d0';
              });
              successMessage.addEventListener('mouseleave', () => {
                successMessage.style.backgroundColor = '#d4edda';
              });

              // Agregar evento click para navegar a membresías
              successMessage.addEventListener('click', () => {
                // Navegar a la sección de membresías (simular click en pestaña)
                document.querySelectorAll('#sidebar nav li').forEach((x) => x.classList.remove('active'));
                document.querySelector('#sidebar nav li[data-tab="membresias"]').classList.add('active');
                document.querySelectorAll('.pane').forEach((p) => p.classList.remove('active'));
                document.getElementById('membresias').classList.add('active');

                // Hacer refresh paralelo de las membresías
                const uid = searchId.value.replace(/\D/g,'').trim();
                if (uid) {
                  api.fetchMembresiasFRAPP(uid)
                    .then(renderMembFRAPP)
                    .catch(err => console.error('Error recargando membresías:', err));
                }
              });

              // Insertar mensaje después del botón
              const otorgarAccesoBtn = document.getElementById('otorgarAccesoBtn');
              otorgarAccesoBtn.parentNode.insertBefore(successMessage, otorgarAccesoBtn.nextSibling);

              // No limpiar ningún campo después de otorgar acceso exitosamente

              // Hacer refresh paralelo inmediato de las membresías sin esperar click
              const uid = searchId.value.replace(/\D/g,'').trim();
              if (uid) {
                api.fetchMembresiasFRAPP(uid)
                  .then(renderMembFRAPP)
                  .catch(err => console.error('Error recargando membresías:', err));
              }

              // Guardar registro en Google Sheets en paralelo
              const confianzaData = {
                nombres: nombres,
                apellidos: apellidos,
                cedula: cedula,
                celular: celular,
                correo: correo,
                producto: producto,
                comercial: comercial,
                nroAcuerdo: nroAcuerdo,
                fechaInicio: fechaInicio
              };

              api.saveConfianzaRecord(confianzaData)
                .then(result => console.log('Registro guardado en Sheets (usuario existente):', result))
                .catch(err => console.error('Error guardando en Sheets (usuario existente):', err));

              return; // Salir exitosamente
            } else {
              // Error en el segundo intento también
              let errorMessage = 'Error al crear membresía para usuario existente: ';
              if (resultExisting?.error) {
                errorMessage += resultExisting.error;
              } else {
                errorMessage += 'Respuesta inesperada del servidor';
              }
              console.log('Error en segundo intento:', errorMessage);
              throw new Error(errorMessage);
            }
          } else {
            // Error diferente al de "mismo email"
            let errorMessage = 'Error al registrar la membresía: ';

            if (result?.error) {
              errorMessage += result.error;
            } else if (result?.message) {
              errorMessage += result.message;
            } else if (result?.status) {
              errorMessage += `HTTP ${result.status}`;
            } else {
              errorMessage += 'Respuesta inesperada del servidor';
            }

            if (result?.status && result?.status !== 200) {
              errorMessage += ` (Status: ${result.status})`;
            }

            console.log('Error detallado:', errorMessage);
            throw new Error(errorMessage);
          }
        }

      } catch (error) {
        console.error('Error en otorgar acceso en confianza:', error);
        alert('❌ Error: ' + error.message);
      } finally {
        otorgarAccesoBtn.disabled = false;
        otorgarAccesoBtn.innerHTML = '🤝 Otorgar acceso en confianza';
      }
    });

    // Funcionalidad de copiar URL de activación al portapapeles
    const copiarUrlBtn = document.getElementById('copiarUrlBtn');
    copiarUrlBtn.addEventListener('click', async () => {
      const urlActivacionInput = document.getElementById('urlActivacion');
      const url = urlActivacionInput.value;

      if (!url) {
        alert('No hay URL para copiar');
        return;
      }

      try {
        await navigator.clipboard.writeText(url);

        // Cambiar temporalmente el texto del botón para mostrar confirmación
        const originalText = copiarUrlBtn.innerHTML;
        copiarUrlBtn.innerHTML = '✅ Copiado';
        copiarUrlBtn.style.backgroundColor = '#28a745';

        setTimeout(() => {
          copiarUrlBtn.innerHTML = originalText;
          copiarUrlBtn.style.backgroundColor = '';
        }, 2000);

        console.log('URL copiada al portapapeles:', url);
      } catch (error) {
        console.error('Error al copiar URL:', error);

        // Fallback para navegadores más antiguos
        try {
          urlActivacionInput.select();
          urlActivacionInput.setSelectionRange(0, 99999); // Para móviles
          document.execCommand('copy');

          const originalText = copiarUrlBtn.innerHTML;
          copiarUrlBtn.innerHTML = '✅ Copiado';
          copiarUrlBtn.style.backgroundColor = '#28a745';

          setTimeout(() => {
            copiarUrlBtn.innerHTML = originalText;
            copiarUrlBtn.style.backgroundColor = '';
          }, 2000);

          console.log('URL copiada al portapapeles (fallback):', url);
        } catch (fallbackError) {
          alert('No se pudo copiar automáticamente. Por favor, seleccione y copie manualmente la URL.');
          console.error('Error en fallback de copiado:', fallbackError);
        }
      }
    });

    // Validación y envío de formulario
    addMembForm.addEventListener('submit', e => {
      // forzar validación HTML5
      if (!addMembForm.reportValidity()) return;
      e.preventDefault();
      if (new Date(inpExpiry.value) <= new Date(inpStart.value)) {
        modalResponse.textContent = '❗ La fecha fin debe ser posterior a la de inicio.';
        return;
      }
      function normalizePhone(str) {
        return str.replace(/[()\s\-\.,;]/g, '');
      }

      inpPhone.value = normalizePhone(inpPhone.value);
      [inpEmail, inpGiven, inpFamily, inpPhone, selHandle, inpStart, inpDuration, inpExpiry, btnSubmit, btnCancel]
        .forEach(el => el.disabled = true);
      modalResponse.textContent = '⌛ Guardando…';
      modalResponse.style.display = 'block';
      const uid = searchId.value.replace(/\D/g,'').trim();

      // Obtener el plan seleccionado
      const selectedPlanId = parseInt(selHandle.value);

      // Payload del primer intento (crear usuario + membresía)
      const payload = {
        email: inpEmail.value,
        givenName: humanCapitalize(inpGiven.value),
        familyName: humanCapitalize(inpFamily.value),
        phone: inpPhone.value,
        identityType: 'CC',
        identityDocument: uid,
        membershipPlanId: selectedPlanId,
        membershipStartDate: getMembershipStartDate(inpStart.value),
        membershipEndDate: getMembershipExpiryDate(inpExpiry.value)
        // role: 'elite'  // Campo no usado actualmente, descomentar si cambia la lógica
      };

      console.log('DEBUG registerMembFRAPP - Primer intento payload:', payload);

      // Función para intentar el registro con reintentos
      function intentarRegistro(payloadToSend, attempt = 1, maxAttempts = 5) {
        console.log(`Intento ${attempt}/${maxAttempts}`);
        modalResponse.textContent = `⌛ Guardando… (intento ${attempt}/${maxAttempts})`;

        return new Promise((resolve, reject) => {
          api.registerMembFRAPP(payloadToSend)
            .then(resolve)
            .catch(reject);
        })
        .then(res => {
          console.log(`Intento ${attempt} - Respuesta:`, res);
          return res;
        })
        .catch(err => {
          console.error(`Intento ${attempt} - Error:`, err);
          if (attempt < maxAttempts) {
            console.log(`Esperando 1 segundo antes del reintento...`);
            return new Promise(resolve => setTimeout(resolve, 1000))
              .then(() => intentarRegistro(payloadToSend, attempt + 1, maxAttempts));
          }
          throw err;
        });
      }

      // Ejecutar primer intento
      intentarRegistro(payload)
        .then(res => {
          // Verificar si el error indica que el usuario ya existe
          if (res.error && /createMembershipIfUserExists/i.test(res.error)) {
            console.log('Usuario existente detectado, creando solo membresía...');
            modalResponse.innerHTML = '⚠️ Usuario existente: creando sólo la membresía…';

            // Payload del segundo intento (solo membresía)
            const retryPayload = {
              email: payload.email,
              membershipPlanId: payload.membershipPlanId,
              membershipStartDate: payload.membershipStartDate,
              membershipEndDate: payload.membershipEndDate,
              createMembershipIfUserExists: true,
              allowDuplicateMemberships: false
            };

            console.log('DEBUG registerMembFRAPP - Segundo intento payload:', retryPayload);

            // Intentar crear solo la membresía con reintentos
            return intentarRegistro(retryPayload);
          }

          // Si no hay error de usuario existente, retornar la respuesta
          return res;
        })
        .then(finalRes => {
          // Mostrar respuesta final
          showApiResponse(finalRes);

          // Refrescar tabla de membresías
          api.fetchMembresiasFRAPP(uid)
            .then(renderMembFRAPP)
            .catch(err => console.error('Error recargando membresías:', err));
        })
        .catch(err => {
          console.error('Error final después de todos los reintentos:', err);
          modalResponse.innerHTML = `<div style="color:#c00;">❌ Error: ${err.message || err.toString()}</div>`;
          modalResponse.style.display = 'block';
          [inpEmail, inpGiven, inpFamily, inpPhone, selHandle, inpStart, inpDuration, inpExpiry, btnSubmit, btnCancel]
            .forEach(el => el.disabled = false);
        });
      });

    // — variables globales para el freeze —
    let currentFreeze = {};
    const freezeModal         = document.getElementById('freezeModal');
    const freezeForm          = document.getElementById('freezeForm');
    const freezeReason        = document.getElementById('freezeReason');
    const freezeDate          = document.getElementById('freezeDate');
    const unfreezeDate        = document.getElementById('unfreezeDate');
    const daysRemaining       = document.getElementById('daysRemaining');
    const cancelFreeze        = document.getElementById('cancelFreeze');
    const freezeSuccessModal  = document.getElementById('freezeSuccessModal');
    const closeFreezeSuccess  = document.getElementById('closeFreezeSuccess');

    // Actualiza min de unfreeze cuando cambie freeze
    freezeDate.addEventListener('change', () => {
      unfreezeDate.min = freezeDate.value;
    });

    // Cerrar modal de cancel
    cancelFreeze.addEventListener('click', () => {
      freezeModal.classList.add('hidden');
    });

    // Submit del formulario de congelar
    freezeForm.addEventListener('submit', e => {
      e.preventDefault();
      const reason = freezeReason.value.trim();
      if (reason.length < 3) return alert('Debes ingresar un motivo (mínimo 3 caracteres).');

      const freezeIso   = localToUTCISOString(freezeDate.value);
      const unfreezeIso = localToUTCISOString(unfreezeDate.value, true);
      const days        = Number(daysRemaining.value);
      const membershipId = currentFreeze.id;
      const changedById = USER_IDS[USER_EMAIL];

      const changes = {
        status:                  'frozen',
        freeze_date:             freezeIso,
        unfreeze_date:           unfreezeIso,
        days_remaining_at_freeze: days
      };
     
      console.log('DEBUG freeze payload:', {
        membershipId,
        changedById,
        reason,
        changes
      });

      api.updateMembershipFRAPP(currentFreeze.id, changedById, reason, changes)
        .then(res => {
          console.log('DEBUG freeze response:', res);
          freezeModal.classList.add('hidden');
          freezeSuccessModal.classList.remove('hidden');
        })
        .catch(err => {
          console.error('DEBUG freeze error:', err);
          alert('❌ Error al congelar: ' + err.message);
        });
    });

    // Al aceptar el modal de éxito, refresca Plataforma nueva
    closeFreezeSuccess.addEventListener('click', () => {
      freezeSuccessModal.classList.add('hidden');
      const uid = searchId.value.replace(/\D/g,'');
      api.fetchMembresiasFRAPP(uid)
        .then(renderMembFRAPP)
        .catch(err => console.error(err));
    });

    // ——— Render de Links ———
    function renderLinks(data) {
      const cont = document.getElementById('linksContainer');
      cont.innerHTML = '';

      // 1) Controles (botón + aviso) - dentro de linksContainer
      const controls = document.createElement('div');
      controls.id = 'linksControls';
      controls.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:12px';
      cont.appendChild(controls);

      // 2) Botón 🔄
      const btn = document.createElement('button');
      const orig = '🔄 Actualizar links';
      btn.textContent = orig;
      btn.className   = 'refresh-btn';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.classList.add('loading');
        btn.innerHTML = `<span class="spinner"></span><span>Actualizando…</span>`;
        const uid = document.getElementById('searchId').value.replace(/\D/g,'');
        api.getLinksByIdentityDocument(uid)
          .then(newData => {
            renderLinks(newData);
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.textContent = orig;
          })
          .catch(err => {
            console.error('Error al refrescar links', err);
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.textContent = orig;
          });
      });
      controls.appendChild(btn);

      // 3) Verificar si hay datos
      if (!Array.isArray(data) || data.length === 0) {
        const msg = document.createElement('p');
        msg.textContent = 'No se encontraron links de pago.';
        cont.appendChild(msg);
        return;
      }

      // 4) Wrapper para la tabla (similar a acuerdosTableWrap)
      const tableWrap = document.createElement('div');
      tableWrap.id = 'linksTableWrap';
      cont.appendChild(tableWrap);

      // 5) Ordenar (más reciente expiryDate primero)
      data.sort((a,b)=> new Date(b.expiryDate) - new Date(a.expiryDate));

      // 6) Construir tabla con las columnas solicitadas
      let html = `
        <table style="width:100%;font-size:0.9em">
          <thead>
            <tr>
              <th>ID</th>
              <th>Comercial</th>
              <th>Tipo de ID</th>
              <th>Nro ID</th>
              <th>Nombres y Apellidos</th>
              <th>Correo</th>
              <th>Celular</th>
              <th>Producto</th>
              <th>Valor</th>
              <th>Fecha máxima</th>
              <th>Link</th>
              <th>ID Link</th>
              <th>Transacción</th>
              <th>Acuerdo de pago</th>
              <th>Inicio plataforma</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
      `;

      const hoy = new Date();
      data.forEach(item => {
        // extraer / combinar campos
        const comercial     = item.salesRep?.split(' ')[0]       || '';
        const tipoId        = item.identityType                  || '';
        const nroId         = item.identityDocument              || '';
        const fullName      = [item.givenName, item.familyName].filter(Boolean).join(' ');
        const correo        = item.email                         || '';
        const celular       = item.phone                         || '';
        const producto      = item.product                       || '';
        const valor         = Math.round(Number(item.amount)).toLocaleString('es-CO');
        const fechaMax = item.expiryDate
          ? new Date(item.expiryDate).toLocaleDateString('es-CO',{
              day:   'numeric',
              month: 'numeric',
              year:  'numeric'
            })
          : '';
        const linkHTML      = item.linkURL
                              ? `<a href="${item.linkURL}" target="_blank">Ver</a>`
                              : '';
        const idLink        = item.externalId                    || '';
        const acuerdoPago   = item.agreementId                   || '';
        const transaccion = item.invoiceId                     || '';
        const inicioPlat = item.accessDate
          ? new Date(item.accessDate).toLocaleDateString('es-CO',{
              day:   'numeric',
              month: 'numeric',
              year:  'numeric'
            })
          : '';

        // aplicar clase expired si venció
        const isExpired = item.expiryDate && new Date(item.expiryDate) < hoy;
        const linkId = item.id || '';

        html += `
          <tr${isExpired?' class="expired-link"':''}>
            <td><strong>${linkId}</strong></td>
            <td>${comercial}</td>
            <td>${tipoId}</td>
            <td>${nroId}</td>
            <td>${fullName}</td>
            <td>${correo}</td>
            <td>${celular}</td>
            <td>${producto}</td>
            <td>${valor}</td>
            <td>${fechaMax}</td>
            <td style="text-align:center">${linkHTML}</td>
            <td>${idLink}</td>
            <td>${transaccion}</td>
            <td>${acuerdoPago}</td>
            <td>${inicioPlat}</td>
            <td style="text-align:center">
              <button class="delete-link-btn" data-link-id="${linkId}" title="Eliminar link" style="background:none;border:none;cursor:pointer;font-size:1.2em;padding:4px 8px;">🗑️</button>
            </td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
      tableWrap.innerHTML = html;

      // 7) Event listener para botones de eliminar
      const deleteButtons = tableWrap.querySelectorAll('.delete-link-btn');
      deleteButtons.forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const linkId = e.target.getAttribute('data-link-id');

          // Verificar que el usuario sea daniel.cardona@sentiretaller.com
          if (USER_EMAIL !== 'daniel.cardona@sentiretaller.com') {
            alert('Solo daniel.cardona@sentiretaller.com puede eliminar links de pago.');
            return;
          }

          // Confirmar eliminación
          const confirmDelete = confirm(`¿Estás seguro de que quieres eliminar el link ID ${linkId}?`);
          if (!confirmDelete) return;

          try {
            // Deshabilitar botón mientras se procesa
            btn.disabled = true;
            btn.textContent = '⏳';

            // Llamar al endpoint DELETE
            const response = await fetch('/api/payment-link/' + linkId, {
              method: 'DELETE',
              headers: {
                'Content-Type': 'application/json'
              }
            });

            const result = await response.json();

            if (result.success) {
              alert('Link eliminado exitosamente');
              // Refrescar la tabla
              const uid = document.getElementById('searchId').value.replace(/\D/g,'');
              const newData = await api.getLinksByIdentityDocument(uid);
              renderLinks(newData);
            } else {
              throw new Error(result.error || 'Error al eliminar el link');
            }
          } catch (error) {
            console.error('Error eliminando link:', error);
            alert('Error al eliminar el link: ' + error.message);
            btn.disabled = false;
            btn.textContent = '🗑️';
          }
        });
      });
    }

    // ===== Modal de Editar Usuario FRAPP =====
    const editUserModal = document.getElementById('editUserModal');
    const editUserBtn = document.getElementById('editUserBtn');
    const editUserForm = document.getElementById('editUserForm');
    const cancelEditUser = document.getElementById('cancelEditUser');
    const editUserResponse = document.getElementById('editUserResponse');

    // Abrir modal al hacer click en botón ✏️
    if (editUserBtn) {
      editUserBtn.addEventListener('click', () => {
        if (!currentUserFRAPP) {
          alert('No hay datos de usuario disponibles');
          return;
        }

        // Cargar datos en el formulario
        document.getElementById('editUserId').value = currentUserFRAPP.id || '';
        document.getElementById('editUserEmail').value = currentUserFRAPP.email || '';
        document.getElementById('editUserGivenName').value = currentUserFRAPP.givenName || '';
        document.getElementById('editUserFamilyName').value = currentUserFRAPP.familyName || '';
        document.getElementById('editUserIdentityDocument').value = currentUserFRAPP.identityDocument || '';

        // Campos solo lectura
        document.getElementById('editUserPhone').value = currentUserFRAPP.phone || '';
        document.getElementById('editUserBirthdate').value = currentUserFRAPP.birthdate || '';
        document.getElementById('editUserGender').value = currentUserFRAPP.gender || '';
        document.getElementById('editUserIdentityType').value = currentUserFRAPP.identityType || '';
        document.getElementById('editUserTimezone').value = currentUserFRAPP.timezone || '';
        document.getElementById('editUserStatus').value = currentUserFRAPP.status || '';

        // Mostrar modal
        editUserModal.classList.remove('hidden');
        editUserResponse.style.display = 'none';
        editUserResponse.innerHTML = '';
      });
    }

    // Cerrar modal
    if (cancelEditUser) {
      cancelEditUser.addEventListener('click', () => {
        editUserModal.classList.add('hidden');
      });
    }

    // Cerrar modal al hacer click en el backdrop
    if (editUserModal) {
      editUserModal.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop') || e.target === editUserModal) {
          editUserModal.classList.add('hidden');
        }
      });
    }

    // Submit del formulario
    if (editUserForm) {
      editUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userId = document.getElementById('editUserId').value;
        const userData = {
          email: document.getElementById('editUserEmail').value.trim(),
          givenName: document.getElementById('editUserGivenName').value.trim(),
          familyName: document.getElementById('editUserFamilyName').value.trim(),
          identityDocument: document.getElementById('editUserIdentityDocument').value.trim()
        };

        console.log('Actualizando usuario:', userId, userData);

        // Deshabilitar form
        const inputs = editUserForm.querySelectorAll('input, button');
        inputs.forEach(inp => inp.disabled = true);

        editUserResponse.style.display = 'block';
        editUserResponse.innerHTML = '⌛ Actualizando usuario...';
        editUserResponse.style.color = '#333';

        try {
          const result = await api.updateUserFRAPP(userId, userData);

          if (result.success) {
            editUserResponse.innerHTML = '✅ Usuario actualizado correctamente';
            editUserResponse.style.color = '#28a745';

            // Recargar datos de FRAPP para reflejar cambios
            setTimeout(async () => {
              const uid = searchId.value.replace(/\D/g,'').trim();
              if (uid) {
                try {
                  const freshData = await api.fetchMembresiasFRAPP(uid);
                  renderMembFRAPP(freshData);
                  console.log('✅ Datos de FRAPP recargados');
                } catch (err) {
                  console.error('Error al recargar datos de FRAPP:', err);
                }
              }

              // Cerrar modal después de 2 segundos
              setTimeout(() => {
                editUserModal.classList.add('hidden');
                // Rehabilitar form
                inputs.forEach(inp => inp.disabled = false);
              }, 2000);
            }, 1000);

          } else {
            let errorMsg = '❌ Error: ' + (result.error || 'Error desconocido');

            if (result.validationErrors) {
              errorMsg += '\n\nErrores de validación:';
              for (const [field, errors] of Object.entries(result.validationErrors)) {
                errorMsg += `\n- ${field}: ${errors.join(', ')}`;
              }
            }

            editUserResponse.innerHTML = errorMsg.replace(/\n/g, '<br>');
            editUserResponse.style.color = '#dc3545';

            // Rehabilitar form para intentar de nuevo
            inputs.forEach(inp => inp.disabled = false);
          }
        } catch (error) {
          console.error('Error al actualizar usuario:', error);
          editUserResponse.innerHTML = '❌ Error de conexión: ' + error.message;
          editUserResponse.style.color = '#dc3545';

          // Rehabilitar form
          inputs.forEach(inp => inp.disabled = false);
        }
      });
    }

    // ===== Editar Celular =====
    const editCelularBtn = document.getElementById('editCelularBtn');
    const editCelularModal = document.getElementById('editCelularModal');
    const newCelularInput = document.getElementById('newCelularInput');
    const cancelEditCelular = document.getElementById('cancelEditCelular');
    const confirmEditCelular = document.getElementById('confirmEditCelular');
    const updateProgress = document.getElementById('updateProgress');

    // Usuarios autorizados para editar celular
    const AUTHORIZED_USERS = ['daniel.cardona@sentiretaller.com', 'eliana.montilla@sentiretaller.com'];

    // Mostrar/ocultar botón de edición según usuario y si hay celular
    function updateEditCelularButtonVisibility() {
      const currentUser = USER_EMAIL;
      const hasPermission = AUTHORIZED_USERS.includes(currentUser);
      const hasCelular = celular.value && celular.value.trim() !== '';

      if (hasPermission && hasCelular) {
        editCelularBtn.style.display = 'inline';
      } else {
        editCelularBtn.style.display = 'none';
      }
    }

    // Event listener para abrir modal
    editCelularBtn.addEventListener('click', () => {
      const currentUser = USER_EMAIL;
      if (!AUTHORIZED_USERS.includes(currentUser)) {
        alert('⛔ No tienes permisos para editar el celular. Solo daniel.cardona y eliana.montilla pueden realizar esta acción.');
        return;
      }

      // Prellenar con el celular actual
      newCelularInput.value = celular.value || '';
      updateProgress.style.display = 'none';
      editCelularModal.classList.remove('hidden');
    });

    // Cerrar modal
    cancelEditCelular.addEventListener('click', () => {
      editCelularModal.classList.add('hidden');
    });

    // Función de retry con delay
    async function retryWithDelay(fn, maxRetries = 5, delay = 1000) {
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await fn();
        } catch (error) {
          if (i === maxRetries - 1) throw error;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // Actualizar celular en CRM (ActiveCampaign) - vía backend
    async function updateCelularCRM(correo, nuevoCelular) {
      return await retryWithDelay(async () => {
        return await api.updateCelularCRM(correo, nuevoCelular);
      });
    }

    // Actualizar celular en Strapi Carteras - vía backend
    async function updateCelularStrapiCarteras(cedula, nuevoCelular) {
      return await retryWithDelay(async () => {
        return await api.updateCelularStrapiCarteras(cedula, nuevoCelular);
      });
    }

    // Actualizar celular en FR360 Payment Links - vía backend
    async function updateCelularFR360Links(cedula, nuevoCelular) {
      return await retryWithDelay(async () => {
        return await api.updateCelularFR360Links(cedula, nuevoCelular);
      });
    }

    // Confirmar actualización
    confirmEditCelular.addEventListener('click', async () => {
      const inputValue = newCelularInput.value.trim();

      if (!inputValue) {
        alert('Por favor ingresa un número de celular');
        return;
      }

      const nuevoCelular = normalizarCelular(inputValue);

      if (!nuevoCelular) {
        alert('❌ El número ingresado no es un celular colombiano válido.\nFormatos aceptados: 3XXXXXXXXX, 573XXXXXXXXX o +573XXXXXXXXX');
        return;
      }

      // Confirmación final
      const confirmacion = confirm(
        `¿Estás seguro de actualizar el celular a:\n\n${nuevoCelular}\n\nEsto actualizará el celular en CRM, Strapi Carteras y FR360 Links.`
      );

      if (!confirmacion) {
        return;
      }

      // Mostrar progreso
      updateProgress.style.display = 'block';
      confirmEditCelular.disabled = true;

      // Reset status
      document.getElementById('crmStatus').textContent = '⏳';
      document.getElementById('crmMessage').textContent = 'Actualizando...';
      document.getElementById('strapiStatus').textContent = '⏳';
      document.getElementById('strapiMessage').textContent = 'Esperando...';
      document.getElementById('fr360Status').textContent = '⏳';
      document.getElementById('fr360Message').textContent = 'Esperando...';

      const currentCedula = searchId.value;
      const currentCorreo = correo.value;

      // Track success/failure
      let crmSuccess = false;
      let strapiSuccess = false;
      let fr360Success = false;

      // 1. Actualizar CRM
      try {
        await updateCelularCRM(currentCorreo, nuevoCelular);
        document.getElementById('crmStatus').textContent = '✅';
        document.getElementById('crmMessage').textContent = 'Actualizado correctamente';
        crmSuccess = true;
      } catch (error) {
        document.getElementById('crmStatus').textContent = '⛔';
        document.getElementById('crmMessage').textContent = `Error: ${error.message}`;
      }

      // 2. Actualizar Strapi Carteras
      document.getElementById('strapiMessage').textContent = 'Actualizando...';
      try {
        await updateCelularStrapiCarteras(currentCedula, nuevoCelular);
        document.getElementById('strapiStatus').textContent = '✅';
        document.getElementById('strapiMessage').textContent = 'Actualizado correctamente';
        strapiSuccess = true;
      } catch (error) {
        document.getElementById('strapiStatus').textContent = '⛔';
        document.getElementById('strapiMessage').textContent = `Error: ${error.message}`;
      }

      // 3. Actualizar FR360 Links
      document.getElementById('fr360Message').textContent = 'Actualizando...';
      try {
        await updateCelularFR360Links(currentCedula, nuevoCelular);
        document.getElementById('fr360Status').textContent = '✅';
        document.getElementById('fr360Message').textContent = 'Actualizado correctamente';
        fr360Success = true;
      } catch (error) {
        document.getElementById('fr360Status').textContent = '⛔';
        document.getElementById('fr360Message').textContent = `Error: ${error.message}`;
      }

      // Determinar mensaje final basado en resultados
      const totalSuccess = [crmSuccess, strapiSuccess, fr360Success].filter(Boolean).length;
      const totalAttempts = 3;

      // Actualizar campo celular en el formulario solo si al menos una actualización fue exitosa
      if (totalSuccess > 0) {
        celular.value = nuevoCelular;
      }

      // Refrescar datos
      setTimeout(async () => {
        try {
          if (totalSuccess > 0) {
            await fetchAllData(currentCedula);
          }

          // Mensaje según resultados
          if (totalSuccess === totalAttempts) {
            alert('✅ Celular actualizado correctamente en todos los sistemas. Los datos han sido refrescados.');
          } else if (totalSuccess > 0) {
            alert(`⚠️ Actualización parcial: ${totalSuccess}/${totalAttempts} sistemas actualizados correctamente.\n\nRevisa los detalles en el modal para ver qué falló.`);
          } else {
            alert('❌ Error: No se pudo actualizar el celular en ningún sistema.\n\nRevisa los mensajes de error en el modal.');
          }

          // Solo cerrar modal si todas las actualizaciones fueron exitosas
          if (totalSuccess === totalAttempts) {
            editCelularModal.classList.add('hidden');
          }
        } catch (error) {
          console.error('Error refrescando datos:', error);
          alert('⚠️ Los cambios se guardaron, pero hubo un error al refrescar los datos.');
        } finally {
          confirmEditCelular.disabled = false;
        }
      }, 1000);
    });

    // Inicializar
    loadProductos();
