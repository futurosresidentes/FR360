// Fix temporal para navegación de tabs
// Este archivo asegura que la navegación funcione incluso si hay errores en app.js

document.addEventListener('DOMContentLoaded', function() {
  // Sidebar tabs navigation
  const sidebarItems = document.querySelectorAll('#sidebar nav li');
  const panes = document.querySelectorAll('.pane');

  if (sidebarItems.length === 0) {
    console.error('❌ No se encontraron elementos del sidebar');
    return;
  }

  sidebarItems.forEach((li) => {
    li.addEventListener('click', function() {
      // Remover clase active de todos los tabs
      sidebarItems.forEach((x) => x.classList.remove('active'));

      // Agregar clase active al tab clickeado
      this.classList.add('active');

      // Remover clase active de todos los panes
      panes.forEach((p) => p.classList.remove('active'));

      // Agregar clase active al pane correspondiente
      const targetPane = document.getElementById(this.dataset.tab);
      if (targetPane) {
        targetPane.classList.add('active');
      } else {
        console.error(`❌ No se encontró pane: ${this.dataset.tab}`);
      }

      // Cerrar sidebar en móvil después de seleccionar una opción
      if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        if (sidebar && sidebar.classList.contains('active')) {
          sidebar.classList.remove('active');
          document.body.classList.remove('sidebar-open');
          document.body.style.top = '';
          // No restauramos scroll aquí porque el usuario va a cambiar de vista
        }
      }
    });
  });

  // Funcionalidad del menú hamburguesa para móvil
  const menuToggle = document.getElementById('menuToggle');
  const sidebar = document.getElementById('sidebar');

  if (menuToggle && sidebar) {
    let scrollPosition = 0;

    function openSidebar() {
      // Guardar posición actual del scroll
      scrollPosition = window.pageYOffset || document.documentElement.scrollTop;
      // Aplicar posición como top negativo para mantener la vista
      document.body.style.top = `-${scrollPosition}px`;
      document.body.classList.add('sidebar-open');
      sidebar.classList.add('active');
    }

    function closeSidebar() {
      sidebar.classList.remove('active');
      document.body.classList.remove('sidebar-open');
      // Restaurar scroll position
      document.body.style.top = '';
      window.scrollTo(0, scrollPosition);
    }

    // Toggle del menú al hacer click en el botón hamburguesa
    menuToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      if (sidebar.classList.contains('active')) {
        closeSidebar();
      } else {
        openSidebar();
      }
    });

    // Cerrar menú al hacer click en el overlay (usando el pseudo-elemento ::before)
    sidebar.addEventListener('click', function(e) {
      // Solo cerrar si el click fue en el overlay (el sidebar mismo, no en sus hijos)
      if (e.target === sidebar && sidebar.classList.contains('active')) {
        closeSidebar();
      }
    });

    // Cerrar menú al hacer click fuera del sidebar
    document.addEventListener('click', function(e) {
      if (sidebar.classList.contains('active') &&
          !sidebar.contains(e.target) &&
          e.target !== menuToggle) {
        closeSidebar();
      }
    });

    // Cerrar menú al presionar la tecla Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape' && sidebar.classList.contains('active')) {
        closeSidebar();
      }
    });
  }
});
