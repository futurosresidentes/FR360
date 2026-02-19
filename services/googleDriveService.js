/**
 * Google Drive Service - Genera paz y salvos PDF
 * Usa Service Account para autenticación
 */

const { google } = require('googleapis');

// Configuración - se lee dinámicamente para asegurar que dotenv ya cargó
function getConfig() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';

  // Remover comillas si las tiene
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  // Convertir \n literales a saltos de línea reales
  privateKey = privateKey.replace(/\\n/g, '\n');

  return {
    email,
    privateKey,
    templateId: process.env.GOOGLE_PAZ_SALVO_TEMPLATE_ID,
    folderId: process.env.GOOGLE_PAZ_SALVO_FOLDER_ID
  };
}

// Meses en español
const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

/**
 * Obtiene cliente autenticado de Google
 */
async function getAuthClient(subject) {
  const config = getConfig();

  // Debug: verificar que las credenciales estén configuradas
  console.log('📄 [GoogleDrive] Service Account Email:', config.email);
  console.log('📄 [GoogleDrive] Private Key exists:', !!config.privateKey);
  console.log('📄 [GoogleDrive] Private Key length:', config.privateKey?.length);
  console.log('📄 [GoogleDrive] Template ID:', config.templateId);
  console.log('📄 [GoogleDrive] Folder ID:', config.folderId);
  if (subject) console.log('📄 [GoogleDrive] Impersonating:', subject);

  if (!config.email || !config.privateKey) {
    throw new Error('Credenciales de Google Service Account no configuradas');
  }

  if (subject) {
    // Usar JWT con impersonación (domain-wide delegation)
    const auth = new google.auth.JWT({
      email: config.email,
      key: config.privateKey,
      scopes: ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/documents'],
      subject: subject
    });
    await auth.authorize();
    return { auth, config };
  }

  // Usar GoogleAuth con credenciales explícitas (sin impersonación)
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.email,
      private_key: config.privateKey,
    },
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents'
    ]
  });

  const authClient = await auth.getClient();
  return { auth: authClient, config };
}

/**
 * Genera un paz y salvo PDF y lo sube a Google Drive
 * @param {Object} data - Datos del estudiante
 * @param {string} data.nombres - Nombres del estudiante
 * @param {string} data.apellidos - Apellidos del estudiante
 * @param {string} data.cedula - Número de cédula
 * @param {string} data.producto - Nombre del producto/curso
 * @param {string} data.acuerdo - Número de acuerdo
 * @returns {Promise<Object>} - { success, pdfUrl, pdfId, error }
 */
async function generarPazYSalvo(data) {
  const { nombres, apellidos, cedula, producto, acuerdo } = data;

  console.log('📄 [GoogleDrive] Generando paz y salvo para:', { nombres, apellidos, cedula, acuerdo });

  let newDocId = null;

  try {
    const { auth, config } = await getAuthClient();
    console.log('📄 [GoogleDrive] Cliente autorizado correctamente');

    const drive = google.drive({ version: 'v3', auth });
    const docs = google.docs({ version: 'v1', auth });

    // 1. Copiar la plantilla al Drive de la Service Account (sin parents para evitar problemas de cuota)
    const fileName = `Paz y salvo ${nombres} ${apellidos} ${cedula} ${acuerdo}`;
    console.log('📄 [GoogleDrive] Copiando plantilla...');

    const copyResponse = await drive.files.copy({
      fileId: config.templateId,
      requestBody: {
        name: fileName
        // NO especificamos parents para que quede en el Drive de la Service Account
      }
    });

    newDocId = copyResponse.data.id;
    console.log('📄 [GoogleDrive] Documento copiado con ID:', newDocId);

    // 2. Reemplazar variables en el documento
    const today = new Date();
    const dia = today.getDate();
    const mes = MESES_ES[today.getMonth()];
    const año = today.getFullYear();
    const nombreCompleto = `${nombres} ${apellidos}`;

    // Extraer el curso base del producto (quitar "Pago anticipado" si existe)
    let curso = producto;
    if (curso.toLowerCase().includes('pago anticipado')) {
      // Extraer la parte antes de " - Pago anticipado"
      curso = curso.split(' - Pago anticipado')[0].trim();
    }

    console.log('📄 [GoogleDrive] Reemplazando variables...');

    const requests = [
      { replaceAllText: { containsText: { text: '#dia', matchCase: false }, replaceText: String(dia) } },
      { replaceAllText: { containsText: { text: '#mes', matchCase: false }, replaceText: mes } },
      { replaceAllText: { containsText: { text: '#año', matchCase: false }, replaceText: String(año) } },
      { replaceAllText: { containsText: { text: '#nombres', matchCase: false }, replaceText: nombreCompleto } },
      { replaceAllText: { containsText: { text: '#cedula', matchCase: false }, replaceText: String(cedula) } },
      { replaceAllText: { containsText: { text: '#curso', matchCase: false }, replaceText: curso } },
      { replaceAllText: { containsText: { text: '#acuerdo', matchCase: false }, replaceText: String(acuerdo) } }
    ];

    await docs.documents.batchUpdate({
      documentId: newDocId,
      requestBody: { requests }
    });

    console.log('📄 [GoogleDrive] Variables reemplazadas');

    // 3. Hacer el documento público para que se pueda descargar como PDF
    console.log('📄 [GoogleDrive] Haciendo documento público...');

    await drive.permissions.create({
      fileId: newDocId,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    // 4. Generar URL de descarga como PDF (export de Google Docs a PDF)
    const pdfUrl = `https://docs.google.com/document/d/${newDocId}/export?format=pdf`;

    console.log('✅ [GoogleDrive] Paz y salvo generado exitosamente:', pdfUrl);

    // 5. Programar eliminación del documento después de 5 minutos para liberar espacio
    // El link de export seguirá funcionando por un tiempo en caché
    setTimeout(async () => {
      try {
        await drive.files.delete({ fileId: newDocId });
        console.log('🗑️ [GoogleDrive] Documento temporal eliminado:', newDocId);
      } catch (err) {
        console.log('⚠️ [GoogleDrive] No se pudo eliminar documento temporal:', err.message);
      }
    }, 5 * 60 * 1000); // 5 minutos

    return {
      success: true,
      pdfUrl,
      pdfId: newDocId,
      fileName
    };

  } catch (error) {
    console.error('❌ [GoogleDrive] Error generando paz y salvo:', error.message);
    console.error('❌ [GoogleDrive] Stack:', error.stack);

    // Intentar eliminar el documento si se creó pero falló después
    if (newDocId) {
      try {
        const { auth } = await getAuthClient();
        const drive = google.drive({ version: 'v3', auth });
        await drive.files.delete({ fileId: newDocId });
        console.log('🗑️ [GoogleDrive] Documento fallido eliminado:', newDocId);
      } catch (cleanupErr) {
        console.log('⚠️ [GoogleDrive] No se pudo limpiar documento fallido:', cleanupErr.message);
      }
    }

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Envía el paz y salvo por Callbell (WhatsApp)
 * @param {Object} data - Datos para enviar
 * @param {string} data.celular - Número de celular
 * @param {string} data.primerNombre - Primer nombre del estudiante
 * @param {string} data.acuerdo - Número de acuerdo
 * @param {string} data.pdfUrl - URL del PDF
 * @returns {Promise<Object>} - Resultado del envío
 */
async function enviarPazYSalvoPorCallbell(data) {
  const { celular, primerNombre, acuerdo, pdfUrl } = data;

  console.log('📱 [Callbell] Enviando paz y salvo por WhatsApp a:', celular);

  // Normalizar celular colombiano
  let celularNormalizado = String(celular).replace(/\D/g, '');
  if (/^3\d{9}$/.test(celularNormalizado)) {
    celularNormalizado = '57' + celularNormalizado;
  } else if (celularNormalizado.startsWith('+')) {
    celularNormalizado = celularNormalizado.substring(1);
  }

  const templateUuid = process.env.CALLBELL_PAZ_SALVO_TEMPLATE_UUID;
  const apiKey = process.env.CALLBELL_API_KEY;

  const payload = {
    to: celularNormalizado,
    from: 'whatsapp',
    type: 'text',
    content: { text: 'Paz' },
    template_values: [primerNombre, String(acuerdo), pdfUrl],
    template_uuid: templateUuid,
    optin_contact: true
  };

  try {
    const response = await fetch('https://api.callbell.eu/v1/messages/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();

    if (response.ok) {
      console.log('✅ [Callbell] Paz y salvo enviado exitosamente');
      return { success: true, data: responseData };
    } else {
      console.error('❌ [Callbell] Error:', responseData);
      return { success: false, error: responseData };
    }

  } catch (error) {
    console.error('❌ [Callbell] Error de conexión:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Genera y envía paz y salvo completo
 * @param {Object} data - Todos los datos necesarios
 * @returns {Promise<Object>} - Resultado completo
 */
async function generarYEnviarPazYSalvo(data) {
  const { nombres, apellidos, cedula, producto, acuerdo, celular } = data;

  // 1. Generar el PDF
  const pdfResult = await generarPazYSalvo({
    nombres,
    apellidos,
    cedula,
    producto,
    acuerdo
  });

  if (!pdfResult.success) {
    return {
      success: false,
      step: 'pdf_generation',
      error: pdfResult.error
    };
  }

  // 2. Enviar por Callbell
  const primerNombre = nombres.split(' ')[0];
  const callbellResult = await enviarPazYSalvoPorCallbell({
    celular,
    primerNombre,
    acuerdo,
    pdfUrl: pdfResult.pdfUrl
  });

  return {
    success: callbellResult.success,
    pdfUrl: pdfResult.pdfUrl,
    pdfId: pdfResult.pdfId,
    callbellSent: callbellResult.success,
    callbellError: callbellResult.error
  };
}

/**
 * Sube un archivo a Google Drive
 * @param {Object} data - Datos del archivo
 * @param {string} data.folderId - ID de la carpeta destino
 * @param {string} data.fileName - Nombre del archivo
 * @param {string} data.mimeType - Tipo MIME del archivo
 * @param {string} data.base64Content - Contenido del archivo en base64
 * @returns {Promise<Object>} - { success, id, webViewLink, webContentLink, error }
 */
async function subirArchivo(data) {
  const { folderId, fileName, mimeType, base64Content, impersonateEmail } = data;

  console.log('📤 [GoogleDrive] Subiendo archivo:', fileName);
  console.log('📤 [GoogleDrive] Carpeta destino:', folderId);
  console.log('📤 [GoogleDrive] Tipo MIME:', mimeType);
  console.log('📤 [GoogleDrive] Tamaño base64:', base64Content?.length || 0, 'caracteres');

  if (!folderId || !fileName || !mimeType || !base64Content) {
    console.error('❌ [GoogleDrive] Faltan parámetros:', { folderId: !!folderId, fileName: !!fileName, mimeType: !!mimeType, base64Content: !!base64Content });
    return {
      success: false,
      error: 'Faltan parámetros requeridos para subir archivo'
    };
  }

  try {
    const { auth } = await getAuthClient(impersonateEmail || null);
    console.log('📤 [GoogleDrive] Cliente autenticado correctamente', impersonateEmail ? `(impersonando: ${impersonateEmail})` : '');

    const drive = google.drive({ version: 'v3', auth });

    // Convertir base64 a buffer
    const buffer = Buffer.from(base64Content, 'base64');
    console.log('📤 [GoogleDrive] Buffer creado, tamaño:', buffer.length, 'bytes');

    // Crear el archivo en Drive
    console.log('📤 [GoogleDrive] Creando archivo en Drive...');
    let response;
    try {
      response = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId]
        },
        media: {
          mimeType: mimeType,
          body: require('stream').Readable.from(buffer)
        },
        fields: 'id, webViewLink, webContentLink',
        supportsAllDrives: true
      });
    } catch (folderError) {
      console.warn('⚠️ [GoogleDrive] Error subiendo a carpeta específica, intentando sin carpeta:', folderError.message);
      // Intentar sin especificar carpeta (quedará en el Drive de la Service Account)
      const bufferRetry = Buffer.from(base64Content, 'base64');
      response = await drive.files.create({
        requestBody: {
          name: fileName
        },
        media: {
          mimeType: mimeType,
          body: require('stream').Readable.from(bufferRetry)
        },
        fields: 'id, webViewLink, webContentLink',
        supportsAllDrives: true
      });
    }

    console.log('📤 [GoogleDrive] Archivo creado con ID:', response.data.id);

    // Hacer el archivo público para compartir
    console.log('📤 [GoogleDrive] Configurando permisos públicos...');
    await drive.permissions.create({
      fileId: response.data.id,
      supportsAllDrives: true,
      requestBody: {
        role: 'reader',
        type: 'anyone'
      }
    });

    console.log('✅ [GoogleDrive] Archivo subido exitosamente:', response.data.id);
    console.log('✅ [GoogleDrive] webViewLink:', response.data.webViewLink);
    console.log('✅ [GoogleDrive] webContentLink:', response.data.webContentLink);

    return {
      success: true,
      id: response.data.id,
      webViewLink: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`,
      webContentLink: response.data.webContentLink
    };

  } catch (error) {
    console.error('❌ [GoogleDrive] Error subiendo archivo:', error.message);
    console.error('❌ [GoogleDrive] Error completo:', error);
    if (error.response) {
      console.error('❌ [GoogleDrive] Response status:', error.response.status);
      console.error('❌ [GoogleDrive] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Subir archivo a Google Drive usando el token OAuth del usuario logueado
 * Usa REST API directamente con axios para evitar problemas de proyecto de googleapis
 * @param {Object} data - { folderId, fileName, mimeType, base64Content, userAccessToken }
 * @returns {Promise<Object>} - { success, id, webViewLink, error }
 */
async function subirArchivoConUserToken(data) {
  const { folderId, fileName, mimeType, base64Content, userAccessToken } = data;

  console.log('📤 [GoogleDrive] Subiendo archivo con token de usuario (REST):', fileName);

  if (!userAccessToken) {
    return { success: false, error: 'No hay token de usuario disponible. Cierre sesión y vuelva a iniciar.' };
  }

  try {
    const axios = require('axios');
    const buffer = Buffer.from(base64Content, 'base64');

    // Construir multipart body manualmente para Google Drive API v3
    const boundary = 'fr360_upload_boundary';
    const metadata = JSON.stringify({
      name: fileName,
      parents: [folderId]
    });

    // Crear el body multipart/related
    const multipartBody = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n`),
      Buffer.from(base64Content),
      Buffer.from(`\r\n--${boundary}--`)
    ]);

    console.log('📤 [GoogleDrive] Enviando archivo a Drive API... (tamaño:', buffer.length, 'bytes)');

    const uploadResponse = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink,webContentLink',
      multipartBody,
      {
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
          'Content-Length': multipartBody.length
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );

    const fileId = uploadResponse.data.id;
    console.log('📤 [GoogleDrive] Archivo creado con ID:', fileId);

    // Hacer público con REST API directamente
    await axios.post(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true`,
      { role: 'reader', type: 'anyone' },
      {
        headers: {
          'Authorization': `Bearer ${userAccessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const webViewLink = uploadResponse.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    console.log('✅ [GoogleDrive] Archivo subido exitosamente:', webViewLink);

    return {
      success: true,
      id: fileId,
      webViewLink
    };
  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message;
    console.error('❌ [GoogleDrive] Error subiendo con token de usuario:', errMsg);
    if (error.response?.data) {
      console.error('❌ [GoogleDrive] Response data:', JSON.stringify(error.response.data, null, 2));
    }
    return { success: false, error: errMsg };
  }
}

module.exports = {
  generarPazYSalvo,
  enviarPazYSalvoPorCallbell,
  generarYEnviarPazYSalvo,
  subirArchivo,
  subirArchivoConUserToken
};
