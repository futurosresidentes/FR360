// tickets.js - Sistema de tickets integrado con ClickUp

(function() {
  'use strict';

  // Referencias a elementos del DOM
  const ticketBtn = document.getElementById('ticketBtn');
  const ticketModal = document.getElementById('ticketModal');
  const ticketForm = document.getElementById('ticketForm');
  const cancelTicket = document.getElementById('cancelTicket');
  const ticketResponse = document.getElementById('ticketResponse');
  const ticketDescription = document.getElementById('ticketDescription');
  const ticketCharCount = document.getElementById('ticketCharCount');

  if (!ticketBtn || !ticketModal || !ticketForm) {
    console.error('❌ Elementos del sistema de tickets no encontrados');
    return;
  }

  // Abrir modal al hacer click en botón
  ticketBtn.addEventListener('click', () => {
    ticketModal.classList.remove('hidden');
    ticketResponse.style.display = 'none';
    ticketResponse.innerHTML = '';
    ticketForm.reset();
    ticketCharCount.textContent = '0';
  });

  // Cerrar modal
  if (cancelTicket) {
    cancelTicket.addEventListener('click', () => {
      ticketModal.classList.add('hidden');
    });
  }

  // Cerrar modal al hacer click en el backdrop
  ticketModal.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop') || e.target === ticketModal) {
      ticketModal.classList.add('hidden');
    }
  });

  // Contador de caracteres
  if (ticketDescription && ticketCharCount) {
    ticketDescription.addEventListener('input', () => {
      ticketCharCount.textContent = ticketDescription.value.length;
    });
  }

  // Submit del formulario
  ticketForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('ticketTitle').value.trim();
    const type = document.getElementById('ticketType').value;
    const priority = document.getElementById('ticketPriority').value;
    const description = document.getElementById('ticketDescription').value.trim();

    // Validaciones
    if (!title || !type || !priority || !description) {
      showResponse('⚠️ Por favor completa todos los campos', 'warning');
      return;
    }

    // Capturar información del usuario y contexto
    const currentUserEmail = window.userEmail || 'usuario@unknown.com';
    const currentUserName = window.userName || 'Usuario';
    const pageUrl = window.location.href;

    // Construir datos del ticket
    const taskData = {
      name: `[${type}] ${title}`,
      description: description,
      priority: priority,
      type: type,
      createdBy: currentUserEmail,
      userName: currentUserName,
      pageUrl: pageUrl
    };

    console.log('📤 Enviando ticket:', taskData);

    // Deshabilitar form
    const inputs = ticketForm.querySelectorAll('input, select, textarea, button');
    inputs.forEach(inp => inp.disabled = true);

    showResponse('⌛ Creando ticket en ClickUp...', 'info');

    try {
      // Verificar que api está disponible
      if (typeof api === 'undefined') {
        throw new Error('API client no disponible');
      }

      const result = await api.createClickUpTask(taskData);

      if (result.success) {
        showResponse(`✅ Ticket creado exitosamente!<br><br>ID: ${result.taskId}<br><a href="${result.taskUrl}" target="_blank" style="color:#007bff;">Ver en ClickUp →</a>`, 'success');

        // Limpiar formulario después de 3 segundos y cerrar modal después de 5
        setTimeout(() => {
          ticketForm.reset();
          ticketCharCount.textContent = '0';
        }, 3000);

        setTimeout(() => {
          ticketModal.classList.add('hidden');
          inputs.forEach(inp => inp.disabled = false);
        }, 5000);

      } else {
        showResponse(`❌ Error al crear ticket: ${result.error || 'Error desconocido'}`, 'error');

        // Rehabilitar form para intentar de nuevo
        inputs.forEach(inp => inp.disabled = false);
      }
    } catch (error) {
      console.error('❌ Error al crear ticket:', error);
      showResponse(`❌ Error de conexión: ${error.message}`, 'error');

      // Rehabilitar form
      inputs.forEach(inp => inp.disabled = false);
    }
  });

  // Función auxiliar para mostrar mensajes
  function showResponse(message, type) {
    ticketResponse.innerHTML = message;
    ticketResponse.style.display = 'block';

    // Colores según tipo
    switch(type) {
      case 'success':
        ticketResponse.style.color = '#28a745';
        break;
      case 'error':
        ticketResponse.style.color = '#dc3545';
        break;
      case 'warning':
        ticketResponse.style.color = '#ffc107';
        break;
      case 'info':
      default:
        ticketResponse.style.color = '#333';
        break;
    }
  }

})();
