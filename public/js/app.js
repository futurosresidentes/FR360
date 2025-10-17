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

    // Referencias del callbell
    const callbellIcon = document.getElementById('callbellIcon');

    // ===== Descuentos / precio dinámico =====
    let currentDiscountPct = 0; // 0, 15, 25 …

    // ===== Datos de membresías actuales =====
    let currentMembershipsData = null; // Para almacenar las membresías del usuario actual

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

    // Nueva función para fecha inicio: si es hoy usa hora actual, si es futuro usa 00:00:00 UTC
    function getMembershipStartDate(dateInput) {
      const selectedDate = parseLocalDate(dateInput);
      const today = new Date();

      // Comparar solo las fechas (año, mes, día) sin horas
      const selectedDateOnly = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

      if (selectedDateOnly.getTime() === todayOnly.getTime()) {
        // Es hoy: usar hora actual en formato ISO sin milisegundos
        return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      } else {
        // Es fecha futura: usar 00:00:00 UTC
        return toUTCDateTimeString(selectedDate, false);
      }
    }

    // Nueva función para fecha fin: primero establecer 23:59:59 local, luego convertir a UTC
    function getMembershipExpiryDate(dateInput) {
      const selectedDate = parseLocalDate(dateInput);
      // Establecer 23:59:59 en hora LOCAL (sin milisegundos)
      selectedDate.setHours(23, 59, 59, 0);
      // Ahora convertir a UTC sin milisegundos
      return selectedDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
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
      [cuotasRow, inicioRow, fechaMaxRow, rowLinkBtn, planPagosContainer].forEach((e) =>
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
      lastFactRows = [];
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
      if (header) header.innerHTML = '<h3 style="margin-top: 20px; color: #075183;">Plataforma nueva</h3>';
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

    // Trigger search (acepta cédula o correo)
    // Acepta force=true para refrescar aunque sea la misma cédula/correo
    function triggerSearch(force = false) {
      if (window.SEARCH_LOCK) return;
      const raw = String(searchId.value || '').trim();

      // Limpiar mensaje de éxito anterior si existe
      const existingMessage = document.getElementById('membershipCreatedMessage');
      if (existingMessage) {
        existingMessage.remove();
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
      // Si es correo, no normalizar ni auto-buscar aquí
      if (isEmail(raw)) return;
      // Normalizar si es cédula
      searchId.value = raw.replace(/[.,\s]/g, '');
      const uid = searchId.value.replace(/\D/g,'').trim();
      if (uid.length < 7) return; // no auto-buscar si es muy corto
      if (uid !== lastUid) triggerSearch();
    });

    // ——— Actualiza rango min/max según producto elegido y cuotas ———
    function updatePriceRange() {
      const name = producto.value.trim();
      const meta = productMeta.get(name);

      // Usuarios especiales que pueden omitir las restricciones Min/Max
      const specialUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com'];
      const isSpecialUser = specialUsers.includes(USER_EMAIL);

      // si no hay meta, limpiamos límites
      if (!meta) {
        valorInput.placeholder = '';
        valorInput.min = '';
        valorInput.max = '';
        valorInput.readOnly = false;
        return;
      }
      // precio publicado en Strapi → tope máximo
      const max = (typeof meta.precio === 'number' && !isNaN(meta.precio)) ? meta.precio : null;
      // aplica descuento si corresponde
      const min = (max != null) ? Math.round(max * (1 - (currentDiscountPct || 0) / 100)) : null;

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
        rowLinkBtn.classList.add('hidden');
        planPagosContainer.classList.add('hidden');
        return;
      }
      // Si max_financiacion es null ⇒ NO mostrar el campo "Nro de cuotas"
      const mf = (Object.prototype.hasOwnProperty.call(meta, 'max_financiacion') ? meta.max_financiacion : null);
      if (mf == null) {
        cuotasRow.classList.add('hidden');
        cuotas.innerHTML = '<option value="" disabled selected>Selecciona la cantidad de cuotas</option>';
        planPagosContainer.classList.add('hidden');
      } else {
        // Mostrar selector 1..mf (si mf=0, forzamos 1 = contado)
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
      const specialUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com'];
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

      // sin datos
      if (!Array.isArray(data) || data.length === 0) {
        c.innerHTML = '<p>No hay ventas para mostrar.</p>';
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
        html += `<tr${rowClass}>` +
          `<td>${fecha}</td>` +
          `<td>${transaccion}</td>` +
          `<td>${comercial}</td>` +
          `<td>${producto}</td>` +
          `<td>${recaudo}</td>` +
          `<td>${fechaIni}</td>` +
          `<td>${paz}</td>` +
          `<td>${acuerdo}</td>` +
          `<td>${marca}</td>` +
          `<td>${subcat}</td>` +
          `<td>${categoria}</td>` +
        `</tr>`;
      });

      html += '</tbody></table>';
      const tableWrapper = document.createElement('div');
      tableWrapper.innerHTML = html;
      c.appendChild(tableWrapper);

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
      // Verifica si una cuota está vencida comparando fecha límite con hoy
      function checkIfOverdue(tr) {
        const estadoActual = (tr.dataset.estadoPago || '').toLowerCase();

        // Solo recalcular si está "al_dia" (no tocar "pagado" ni "en_mora" ya establecidos)
        if (estadoActual !== 'al_dia') return;

        const fechaLimite = tr.dataset.fechaLimite; // formato "YYYY-MM-DD"
        if (!fechaLimite || fechaLimite === '1970-01-01') return;

        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0); // Normalizar a medianoche

        const limite = new Date(fechaLimite + 'T00:00:00');

        // Si la fecha límite ya pasó, cambiar a "En mora"
        if (limite < hoy) {
          tr.dataset.estadoPago = 'en_mora';
          const cE = tr.querySelector('.estado-cell');
          if (cE) cE.textContent = 'En mora';
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

        // Si no tiene links de pago, verificar si ya tiene estado
        const est = (tr.dataset.estadoPago || '').toLowerCase();
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

        const payload = {
          documentId:      tr.dataset.documentId,
          id_pago:         tr.dataset.idPago || '',
          id_pago_mora:    tr.dataset.idPagoMora || '',
          fecha_limite:    tr.dataset.fechaLimite || '',
          valor_cuota:     tr.dataset.valorCuota ? Number(tr.dataset.valorCuota) : 0,
          nro_acuerdo:     tr.dataset.nroAcuerdo || '',
          producto_nombre: tr.dataset.productoNombre || '',
          cuota_nro:       tr.dataset.cuotaNro || '',
          // NUEVO: Enviar los datos ya calculados desde Ventas
          estado_pago_calculado: estadoPagoActual,
          fecha_pago_calculada: fechaPagoActual,
          valor_pagado_calculado: valorPagadoActual ? Number(valorPagadoActual) : null
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
        const ventas = findVentasFor(acc, base, cuota, total);
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
        });

        // handler provisional del botón
        tableDiv.querySelectorAll('.ps-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            alert('La expedición del paz y salvo aún no está disponible.');
          });
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
      const specialUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com'];
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
      const requiredFields = [
        { id: 'searchId', name: 'Cédula' },
        { id: 'nombres', name: 'Nombres' },
        { id: 'apellidos', name: 'Apellidos' },
        { id: 'correo', name: 'Correo' },
        { id: 'celular', name: 'Celular' },
        { id: 'producto', name: 'Producto' },
        { id: 'cuotas', name: 'Nro de cuotas' },
        { id: 'valor', name: 'Valor' },
        { id: 'inicio', name: 'Inicio plataforma' },
        { id: 'fechaMax', name: 'Fecha máxima' },
        { id: 'comercial', name: 'Comercial' }
      ];

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
          inicioFecha: inicio.value
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


      // 2) Tipo de compra: solo exact match sobre la lista de productos “élite”
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

      // 5) Recalcular rango/placeholder según descuento (sin bloquear)
      const pct  = parseInt(desc, 10) || 0;
      currentDiscountPct = pct;
      const maxV = Number(valorInput.max) || 0;
      const minV = Math.round(maxV * (1 - pct / 100));

      // Usuarios especiales que pueden omitir las restricciones Min/Max
      const specialUsers = ['daniel.cardona@sentiretaller.com', 'alex.lopez@sentiretaller.com'];
      const isSpecialUser = specialUsers.includes(USER_EMAIL);

      if (isSpecialUser) {
        // Para usuarios especiales: solo mostrar placeholder pero sin restricciones
        valorInput.min = '';
        valorInput.max = '';
        valorInput.placeholder = `Min $${minV.toLocaleString('es-CO')} – Max $${maxV.toLocaleString('es-CO')}`;
        valorInput.readOnly = false;
      } else {
        // Para usuarios normales: aplicar restricciones
        valorInput.min = String(minV);
        valorInput.placeholder = `Min $${minV.toLocaleString('es-CO')} – Max $${maxV.toLocaleString('es-CO')}`;
        valorInput.readOnly = (minV === maxV);
        if (minV === maxV) valorInput.value = maxV.toLocaleString('es-CO');
      }

      // mantener coherente si cambia producto/cuotas luego
      updatePriceRange();
      if (!isSpecialUser && minV === maxV && maxV) {
        valorInput.value    = maxV.toLocaleString('es-CO');
        valorInput.readOnly = true;
      } else if (!isSpecialUser) {
        valorInput.readOnly = false;
      }
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
      const statusLine = u?.status ? `<div>Estado: ${u.status}</div>` : '';
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
        const edit = document.createElement('span');
          edit.textContent = '✏️';
          edit.style.cursor = 'pointer';
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

        // —🥶 Congelar— solo si permitimos freeze Y el <tr> tiene clase “active”
        if (enableFreeze && tr.classList.contains('active')) {
          const freeze = document.createElement('span');
          freeze.textContent = '🥶';
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
      save.textContent = '✅';
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
      'janeth.cardona@sentiretaller.com',
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
          if (crmData) {
            // Actualizar todos los campos disponibles
            st.email      = crmData.correo || '';
            st.phone      = crmData.celular || '';
            st.givenName  = crmData.nombres || '';
            st.familyName = crmData.apellidos || '';
            st.emailOk    = Boolean(crmData.correo);
            st.nameOk     = Boolean(crmData.nombres || crmData.apellidos);
            st.notFound   = !st.emailOk && !st.nameOk;
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
              if (!st.givenName && cit?.nombres) st.givenName = cit.nombres;
              if (!st.familyName && cit?.apellidos) st.familyName = cit.apellidos;

              // Actualizar flags
              st.nameOk = Boolean(st.givenName || st.familyName);

              console.log(`✅ Fallback exitoso para ${uid}: nombres=${st.givenName}, apellidos=${st.familyName}`);
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
        return !st.emailOk;
      });
      if (hasMissing){
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
      // 1) Si había membresía activa, pregunta confirmación
      if (activeMembershipFRAPP) {
        const fin = new Date(activeMembershipFRAPP.expiryDate)
          .toLocaleDateString('es-CO');
        if (!confirm(
          `El estudiante ya tiene una membresía activa hasta ${fin}.\n¿Deseas continuar?`
        )) return;
      }

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

      // 3) Calcular y fijar fecha inicio (1 día después de la activa, o hoy)
      const startDate = activeMembershipFRAPP
        ? (() => {
            const [expiryISO] = activeMembershipFRAPP.expiryDate.split('T');
            const [y,m,d]     = expiryISO.split('-').map(Number);
            return sumarDias(new Date(y, m-1, d), 1);
          })()
        : new Date();

      inpStart.value = formatLocalDate(startDate);

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

    // Función para mostrar el resultado del acuerdo creado
    function showAgreementSuccess(result) {
      const linkResult = document.getElementById('linkResult');

      linkResult.innerHTML = `
        <div style="background: #f0f8f0; border: 2px solid #13bf81; border-radius: 8px; padding: 16px; margin-top: 16px;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <span style="color: #13bf81; font-size: 20px;">✅</span>
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

          <div style="display: flex; gap: 8px;">
            <button
              onclick="window.open('${result.documentoUrl}', '_blank')"
              style="background: #075183; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;"
            >
              📄 Abrir Documento
            </button>
            <button
              onclick="copyToClipboard('${result.documentoUrl}')"
              style="background: #13bf81; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 14px;"
            >
              📋 Copiar Link
            </button>
          </div>
        </div>
      `;
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

        // 4. Obtener handle del producto
        console.log('Obteniendo handle para producto:', producto);

        const productHandle = await new Promise((resolve, reject) => {
          api.getProductHandleFromFRAPP(producto)
            .then((result) => {
              console.log('Resultado raw del servidor:', result);
              console.log('Tipo de resultado:', typeof result);
              console.log('Resultado es null?', result === null);
              console.log('Resultado es undefined?', result === undefined);
              console.log('Resultado convertido a string:', String(result));
              resolve(result);
            })
            .catch((error) => {
              console.error('Error del servidor:', error);
              reject(error);
            });
        });

        console.log('Handle procesado:', productHandle);

        if (!productHandle || productHandle === 'null' || productHandle === null) {
          throw new Error(`No se pudo obtener el handle para el producto: ${producto}. Respuesta del servidor: ${productHandle} (tipo: ${typeof productHandle})`);
        }

        console.log('Handle válido encontrado:', productHandle);

        // 5. Calcular fecha de expiración según el producto
        const startDate = new Date(fechaInicio + 'T00:00:00');
        let expiryDate;

        if (producto.includes('9 meses')) {
          expiryDate = new Date(startDate);
          expiryDate.setDate(expiryDate.getDate() + 288);
        } else if (producto.includes('6 meses')) {
          expiryDate = new Date(startDate);
          expiryDate.setDate(expiryDate.getDate() + 188);
        } else {
          throw new Error('Tipo de producto no reconocido. Solo se permiten productos de 6 o 9 meses.');
        }

        // 6. Crear payload para registrar membresía
        const payload = {
          email: correo,
          givenName: nombres,
          familyName: apellidos,
          phone: celular,
          identityType: 'CC',
          identityDocument: cedula,
          role: 'elite',
          productHandle: productHandle,
          membershipStartDate: startDate.toISOString().replace('T', ' ').substring(0, 19),
          membershipExpiryDate: expiryDate.toISOString().replace('T', ' ').substring(0, 19)
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
              productHandle: productHandle,
              role: 'elite',
              membershipStartDate: startDate.toISOString().replace('T', ' ').substring(0, 19),
              membershipExpiryDate: expiryDate.toISOString().replace('T', ' ').substring(0, 19),
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
        google.script
          .run
          .withSuccessHandler(newData => {
            renderLinks(newData);
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.textContent = orig;
          })
          .withFailureHandler(err => {
            console.error('Error al refrescar links', err);
            btn.disabled = false;
            btn.classList.remove('loading');
            btn.textContent = orig;
          })
          .getLinksByIdentityDocument(uid);
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
        html += `
          <tr${isExpired?' class="expired-link"':''}>
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
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
      tableWrap.innerHTML = html;
    }


    // Inicializar
    loadProductos();
