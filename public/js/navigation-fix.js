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
    });
  });
});
