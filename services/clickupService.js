const axios = require('axios');

// ClickUp API configuration
const CLICKUP_API_TOKEN = process.env.CLICKUP_API_TOKEN;
const CLICKUP_LIST_ID = process.env.CLICKUP_LIST_ID || '901109054265';
const CLICKUP_BASE_URL = 'https://api.clickup.com/api/v2';

// Validate required environment variables
if (!CLICKUP_API_TOKEN) {
  console.error('❌ Missing required CLICKUP_API_TOKEN environment variable');
}

console.log('🎫 ClickUp Service initialized');
console.log('  - List ID:', CLICKUP_LIST_ID);
console.log('  - Token:', CLICKUP_API_TOKEN ? '✅ Configured' : '❌ Missing');

/**
 * Create a task in ClickUp
 * @param {Object} taskData - Task data
 * @param {string} taskData.name - Task title (required)
 * @param {string} taskData.description - Task description
 * @param {string} taskData.priority - Priority: 1=urgent, 2=high, 3=normal, 4=low
 * @param {string} taskData.type - Mejora, Cambio, Nueva función, Bug
 * @param {string} taskData.createdBy - User email who created the ticket
 * @param {string} taskData.userName - User name who created the ticket
 * @param {string} taskData.pageUrl - URL where ticket was created from
 * @returns {Promise<Object>} Result object with created task
 */
async function createTask(taskData) {
  const url = `${CLICKUP_BASE_URL}/list/${CLICKUP_LIST_ID}/task`;

  // Map priority text to ClickUp priority values
  const priorityMap = {
    'urgente': 1,
    'alta': 2,
    'media': 3,
    'baja': 4
  };

  const priority = priorityMap[taskData.priority?.toLowerCase()] || 3;

  // Build task description with metadata
  let description = '';

  if (taskData.description) {
    description += `${taskData.description}\n\n`;
  }

  description += `---\n`;
  description += `**Creado por:** ${taskData.userName || 'Usuario'} (${taskData.createdBy || 'email no disponible'})\n`;
  description += `**Tipo:** ${taskData.type || 'No especificado'}\n`;

  if (taskData.pageUrl) {
    description += `**Página:** ${taskData.pageUrl}\n`;
  }

  description += `**Fecha:** ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}\n`;

  // Build task payload
  const payload = {
    name: taskData.name,
    description: description,
    priority: priority,
    tags: [taskData.type || 'Ticket']
  };

  console.log('=== CREANDO TAREA EN CLICKUP ===');
  console.log('URL:', url);
  console.log('Payload:', JSON.stringify(payload, null, 2));

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': CLICKUP_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Tarea creada en ClickUp');
    console.log('Task ID:', response.data.id);
    console.log('Task URL:', response.data.url);

    return {
      success: true,
      taskId: response.data.id,
      taskUrl: response.data.url,
      data: response.data
    };
  } catch (error) {
    console.error('❌ Error al crear tarea en ClickUp:', error.message);

    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Error data:', error.response.data);

      return {
        success: false,
        status: error.response.status,
        error: error.response.data?.err || error.response.data?.message || 'Error desconocido',
        details: error.response.data
      };
    }

    return {
      success: false,
      error: error.message || 'Error de conexión'
    };
  }
}

module.exports = {
  createTask
};
