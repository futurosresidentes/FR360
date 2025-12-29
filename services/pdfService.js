/**
 * PDF Service - Genera paz y salvos PDF usando PDFKit + Supabase Storage
 * Alternativa a Google Drive para evitar problemas de cuota
 */

const PDFDocument = require('pdfkit');
const { createClient } = require('@supabase/supabase-js');

// Meses en español
const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// Inicializar Supabase
function getSupabase() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Credenciales de Supabase no configuradas');
  }

  return createClient(supabaseUrl, supabaseKey);
}

/**
 * Genera un PDF de paz y salvo
 * @param {Object} data - Datos del estudiante
 * @returns {Promise<Buffer>} - Buffer del PDF
 */
async function generarPDFBuffer(data) {
  const { nombres, apellidos, cedula, producto, acuerdo } = data;
  const path = require('path');
  const fs = require('fs');

  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 50, left: 72, right: 72 }
    });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Registrar fuentes Montserrat si existen
    const fontPath = path.join(__dirname, '../public/fonts');
    const montserratRegular = path.join(fontPath, 'Montserrat-Regular.ttf');
    const montserratBold = path.join(fontPath, 'Montserrat-Bold.ttf');

    let fontRegular = 'Helvetica';
    let fontBold = 'Helvetica-Bold';

    if (fs.existsSync(montserratRegular) && fs.existsSync(montserratBold)) {
      doc.registerFont('Montserrat', montserratRegular);
      doc.registerFont('Montserrat-Bold', montserratBold);
      fontRegular = 'Montserrat';
      fontBold = 'Montserrat-Bold';
    }

    // Fecha actual
    const today = new Date();
    const dia = today.getDate();
    const mes = MESES_ES[today.getMonth()];
    const año = today.getFullYear();

    // Nombre completo
    const nombreCompleto = `${nombres} ${apellidos}`;

    // Extraer curso (quitar "Pago anticipado" si existe)
    let curso = producto;
    if (curso.toLowerCase().includes('pago anticipado')) {
      curso = curso.split(' - Pago anticipado')[0].trim();
    }

    // === CONTENIDO DEL PDF ===
    const pageWidth = doc.page.width;
    const marginLeft = 72;
    const marginRight = 72;
    const contentWidth = pageWidth - marginLeft - marginRight;

    // Logo arriba a la derecha (si existe)
    let logoPath = path.join(__dirname, '../public/images/logo-futuros-residentes.png');
    if (!fs.existsSync(logoPath)) {
      logoPath = path.join(__dirname, '../public/images/logo-futuros-residentes.jpg');
    }
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, pageWidth - marginRight - 130, 35, { width: 130 });
    }

    // Fecha - alineada a la izquierda
    doc.fontSize(12)
       .font(fontRegular)
       .fillColor('#000000')
       .text(`Medellín, ${dia} de ${mes} del ${año}`, marginLeft, 90);

    doc.moveDown(2);

    // Título centrado - EN NEGRO
    doc.fontSize(14)
       .font(fontBold)
       .fillColor('#000000')
       .text('CERTIFICADO DE PAZ Y SALVO', { align: 'center' });

    doc.moveDown(1.5);

    // "A quien pueda interesar:"
    doc.fontSize(12)
       .font(fontRegular)
       .fillColor('#000000')
       .text('A quien pueda interesar:', { align: 'left' });

    doc.moveDown(1.5);

    // Cuerpo principal - texto justificado
    doc.font(fontRegular)
       .fontSize(12)
       .text(`Sentire Taller S.A.S. informa que el(la) estudiante `, { continued: true, align: 'justify', lineGap: 2 });
    doc.font(fontBold).text(nombreCompleto, { continued: true });
    doc.font(fontRegular).text(`, identificado(a) con cédula de ciudadanía No. `, { continued: true });
    doc.font(fontBold).text(cedula, { continued: true });
    doc.font(fontRegular).text(`, quien adquirió el curso `, { continued: true });
    doc.font(fontBold).text(curso, { continued: true });
    doc.font(fontRegular).text(` mediante el acuerdo de pagos No. `, { continued: true });
    doc.font(fontBold).text(acuerdo, { continued: true });
    doc.font(fontRegular).text(`, se encuentra a paz y salvo con nuestra entidad.`, { align: 'justify', lineGap: 2 });

    doc.moveDown(1.5);

    // Nota importante - tamaño 11
    doc.fontSize(11)
       .font(fontBold)
       .text('*Importante: ', { continued: true, align: 'justify', lineGap: 2 });
    doc.font(fontRegular)
       .text('Esta certificación de paz y salvo solo hace referencia a los productos mencionados anteriormente, si desea verificar o conocer el historial crediticio de la persona deberá realizarlo por los medios correspondientes para ello.', { align: 'justify', lineGap: 2 });

    doc.moveDown(1.5);

    // Fecha de expedición
    doc.fontSize(12)
       .font(fontRegular)
       .text(`Lo anterior se expide a solicitud del interesado el día ${dia} de ${mes} del ${año}.`, { align: 'justify' });

    doc.moveDown(0.5);

    // Firma (imagen si existe)
    const firmaPath = path.join(__dirname, '../public/images/firma-representante.png');
    if (fs.existsSync(firmaPath)) {
      doc.image(firmaPath, marginLeft, doc.y, { width: 120 });
      doc.moveDown(3.5);
    }

    // Línea de firma
    doc.fontSize(10)
       .font(fontRegular)
       .text('__________________________________');

    // Datos del firmante
    doc.font(fontBold).fontSize(10).text('Juan Esteban Peláez Gómez');
    doc.font(fontRegular).fontSize(10).text('C.C. 1037581110');
    doc.font(fontBold).fontSize(10).text('REPRESENTANTE LEGAL');
    doc.font(fontBold).fontSize(10).text('SENTIRE TALLER S.A.S.');

    // Pie de página - posición fija al final
    doc.fontSize(9)
       .font(fontRegular)
       .fillColor('#666666')
       .text('Sentire Taller SAS - NIT: 900.993.829-3', marginLeft, 700, { align: 'center', width: contentWidth });
    doc.text('Correo electrónico: info@cursofuturosresidentes.com', { align: 'center', width: contentWidth });
    doc.text('Medellín, Antioquia.', { align: 'center', width: contentWidth });

    doc.end();
  });
}

/**
 * Sube el PDF a Supabase Storage y retorna la URL pública
 * @param {Buffer} pdfBuffer - Buffer del PDF
 * @param {string} fileName - Nombre del archivo
 * @returns {Promise<string>} - URL pública del PDF
 */
async function subirPDFaSupabase(pdfBuffer, fileName) {
  const supabase = getSupabase();
  const bucketName = 'paz-y-salvos';

  // Asegurar que el bucket existe
  const { data: buckets } = await supabase.storage.listBuckets();
  const bucketExists = buckets?.some(b => b.name === bucketName);

  if (!bucketExists) {
    console.log('📦 Creando bucket paz-y-salvos...');
    const { error: createError } = await supabase.storage.createBucket(bucketName, {
      public: true,
      fileSizeLimit: 10485760 // 10MB
    });
    if (createError && !createError.message.includes('already exists')) {
      throw new Error(`Error creando bucket: ${createError.message}`);
    }
  }

  // Subir el archivo
  const filePath = `${Date.now()}-${fileName}.pdf`;

  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(filePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (error) {
    throw new Error(`Error subiendo PDF: ${error.message}`);
  }

  // Obtener URL pública
  const { data: publicUrl } = supabase.storage
    .from(bucketName)
    .getPublicUrl(filePath);

  return publicUrl.publicUrl;
}

/**
 * Genera un paz y salvo PDF y lo sube a Supabase
 * @param {Object} data - Datos del estudiante
 * @returns {Promise<Object>} - { success, pdfUrl, error }
 */
async function generarPazYSalvo(data) {
  const { nombres, apellidos, cedula, producto, acuerdo } = data;

  console.log('📄 [PDFService] Generando paz y salvo para:', { nombres, apellidos, cedula, acuerdo });

  try {
    // 1. Generar el PDF en memoria
    console.log('📄 [PDFService] Generando PDF...');
    const pdfBuffer = await generarPDFBuffer(data);
    console.log('📄 [PDFService] PDF generado, tamaño:', pdfBuffer.length, 'bytes');

    // 2. Subir a Supabase Storage
    const fileName = `paz-y-salvo-${cedula}-${acuerdo}`.replace(/[^a-zA-Z0-9-]/g, '-');
    console.log('📄 [PDFService] Subiendo a Supabase...');
    const pdfUrl = await subirPDFaSupabase(pdfBuffer, fileName);

    console.log('✅ [PDFService] Paz y salvo generado exitosamente:', pdfUrl);

    return {
      success: true,
      pdfUrl,
      fileName: `${fileName}.pdf`
    };

  } catch (error) {
    console.error('❌ [PDFService] Error generando paz y salvo:', error.message);
    console.error('❌ [PDFService] Stack:', error.stack);

    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Envía el paz y salvo por Callbell (WhatsApp)
 * @param {Object} data - Datos para enviar
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
    content: { text: `Hola ${primerNombre}, aquí está tu paz y salvo del acuerdo ${acuerdo}` },
    template_uuid: templateUuid,
    template_values: [primerNombre, String(acuerdo), pdfUrl],
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
    callbellSent: callbellResult.success,
    callbellError: callbellResult.error
  };
}

module.exports = {
  generarPazYSalvo,
  enviarPazYSalvoPorCallbell,
  generarYEnviarPazYSalvo
};
