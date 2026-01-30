/**
 * Servicio de integración con AUCO (Firma Electrónica)
 *
 * Flujo:
 * 1. Obtener template HTML desde Supabase (document_templates)
 * 2. Reemplazar placeholders con datos del acuerdo
 * 3. Convertir HTML a PDF con Puppeteer
 * 4. Enviar PDF a AUCO API para firma electrónica
 */

const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Puppeteer: usar chromium en producción, puppeteer normal en desarrollo
const isProduction = process.env.NODE_ENV === 'production';
let puppeteer, chromium;
if (isProduction) {
  puppeteer = require('puppeteer-core');
  chromium = require('@sparticuz/chromium');
} else {
  puppeteer = require('puppeteer');
}

// Configuración
const AUCO_API_URL = process.env.AUCO_API_URL || 'https://api.auco.ai/v1.5';
const AUCO_API_TOKEN = process.env.AUCO_API_TOKEN;
const AUCO_SENDER_EMAIL = process.env.AUCO_SENDER_EMAIL || 'info@sentiretaller.com';

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Logo en base64 (se carga una vez al iniciar)
let logoBase64Cache = null;
function getLogoBase64() {
  if (logoBase64Cache) return logoBase64Cache;
  try {
    const logoPath = path.join(__dirname, '..', 'public', 'images', 'logo-futuros-residentes.jpg');
    const buffer = fs.readFileSync(logoPath);
    logoBase64Cache = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    return logoBase64Cache;
  } catch (error) {
    console.error('[AUCO] Error cargando logo:', error.message);
    return '';
  }
}

// Meses en español
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * Obtiene el template HTML desde Supabase
 * @param {string} slug - Identificador del template (ej: 'acuerdo-pago')
 * @returns {Promise<string>} HTML del template
 */
async function getTemplate(slug) {
  console.log(`[AUCO] Obteniendo template: ${slug}`);

  const { data, error } = await supabase
    .from('document_templates')
    .select('html_content')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    throw new Error(`Template "${slug}" no encontrado: ${error?.message || 'no data'}`);
  }

  return data.html_content;
}

/**
 * Genera el texto de la cláusula de ejecución
 * @param {string} inicioPlataforma - "Con primer pago" o una fecha
 * @returns {string} Texto de la cláusula
 */
function generarClausulaEjecucion(inicioPlataforma) {
  if (inicioPlataforma === 'Con primer pago') {
    return 'Futuros Residentes habilitará el acceso a la plataforma educativa al estudiante - deudor a partir del primer pago realizado a favor del acreedor, y para todos los efectos, el período durante el cual el estudiante tendrá derecho y podrá acceder a la plataforma se contará de la misma manera, es decir a partir del pago de la primera cuota.';
  }

  // Es una fecha específica (formato YYYY-MM-DD) — parsear directo para evitar bug timezone
  const [yyyy, mm, dd] = inicioPlataforma.split('-');
  return `Futuros Residentes habilitará el acceso a la plataforma educativa al estudiante - deudor a partir del día ${dd}/${mm}/${yyyy}, y para todos los efectos, el período durante el cual el estudiante tendrá derecho y podrá acceder a la plataforma se contará desde dicha fecha.`;
}

/**
 * Genera la tabla HTML del plan de pagos
 * @param {Array} cuotas - Array de { nro_cuota, valor, fecha_limite, link_pago }
 * @returns {string} HTML de la tabla
 */
function generarTablaPlanPagos(cuotas) {
  if (!cuotas || cuotas.length === 0) return '<p>Sin plan de pagos definido</p>';

  let html = `<table style="width:100%; border-collapse:collapse; margin:16px 0; font-size:11px;">
    <thead>
      <tr style="background:#00897B; color:#fff;">
        <th style="padding:8px; border:1px solid #ccc; text-align:center;">Cuota</th>
        <th style="padding:8px; border:1px solid #ccc; text-align:center;">Valor</th>
        <th style="padding:8px; border:1px solid #ccc; text-align:center;">Fecha límite</th>
        <th style="padding:8px; border:1px solid #ccc; text-align:center;">Link de pago</th>
      </tr>
    </thead>
    <tbody>`;

  cuotas.forEach(cuota => {
    const valor = Number(cuota.valor || cuota.valor_cuota || 0).toLocaleString('es-CO');
    const fecha = cuota.fecha_limite || '';
    const link = cuota.link_pago || '';
    html += `
      <tr>
        <td style="padding:6px 8px; border:1px solid #ccc; text-align:center;">${cuota.nro_cuota}</td>
        <td style="padding:6px 8px; border:1px solid #ccc; text-align:right;">$ ${valor}</td>
        <td style="padding:6px 8px; border:1px solid #ccc; text-align:center;">${fecha}</td>
        <td style="padding:6px 8px; border:1px solid #ccc; text-align:center;">${link ? `<a href="${link}">${link}</a>` : '-'}</td>
      </tr>`;
  });

  html += '</tbody></table>';
  return html;
}

/**
 * Reemplaza los placeholders en el template HTML
 * @param {string} html - Template HTML con placeholders {{variable}}
 * @param {Object} data - Datos para reemplazar
 * @returns {string} HTML con datos reemplazados
 */
function reemplazarPlaceholders(html, data) {
  const now = new Date();
  const nowColombia = new Date(now.toLocaleString('en-US', { timeZone: 'America/Bogota' }));

  const montoFormateado = Number(data.monto || 0).toLocaleString('es-CO');

  const replacements = {
    '{{consecutivo}}': data.consecutivo || data.nroAcuerdo || '',
    '{{membresia}}': data.membresia || data.producto || '',
    '{{estudiante}}': `${data.nombres || ''} ${data.apellidos || ''}`.trim(),
    '{{ccestudiante}}': data.ccestudiante || data.cedula || '',
    '{{monto}}': montoFormateado,
    '{{plandepagos}}': generarTablaPlanPagos(data.cuotas),
    '{{ejecucion}}': generarClausulaEjecucion(data.inicioPlataforma || 'Con primer pago'),
    '{{dia}}': String(nowColombia.getDate()),
    '{{mes}}': MESES[nowColombia.getMonth()],
    '{{ano}}': String(nowColombia.getFullYear()),
    '{{comercial}}': data.comercial || '',
    '{{logo}}': getLogoBase64()
  };

  let resultado = html;
  for (const [placeholder, valor] of Object.entries(replacements)) {
    resultado = resultado.split(placeholder).join(valor);
  }

  return resultado;
}

/**
 * Convierte HTML a PDF usando Puppeteer con header/footer en todas las páginas
 * @param {string} html - HTML completo
 * @param {Object} options - Opciones adicionales
 * @param {string} options.headerTemplate - HTML del header
 * @param {string} options.footerTemplate - HTML del footer
 * @returns {Promise<Buffer>} PDF como buffer
 */
async function htmlToPDF(html, options = {}) {
  console.log('[AUCO] Convirtiendo HTML a PDF...');

  let browser;
  if (isProduction) {
    // Producción: usar @sparticuz/chromium
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless
    });
  } else {
    // Desarrollo: usar puppeteer normal
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfOptions = {
      format: 'Letter',
      printBackground: true,
      margin: { top: '38mm', bottom: '35mm', left: '20mm', right: '20mm' }
    };

    // Si hay header/footer templates, activarlos
    if (options.headerTemplate || options.footerTemplate) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.headerTemplate = options.headerTemplate || '<span></span>';
      pdfOptions.footerTemplate = options.footerTemplate || '<span></span>';
    }

    const pdfBuffer = await page.pdf(pdfOptions);

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Sube un documento PDF a AUCO para firma electrónica
 * @param {Object} data - Datos del documento y firmante
 * @param {Buffer} pdfBuffer - PDF como buffer
 * @returns {Promise<Object>} { documentId, success }
 */
async function uploadToAuco(data, pdfBuffer) {
  console.log('[AUCO] Subiendo documento a AUCO...');

  if (!AUCO_API_TOKEN) {
    throw new Error('AUCO_API_TOKEN no configurado');
  }

  const base64File = pdfBuffer.toString('base64');

  const primeraCuotaFormateada = Number(data.primeraCuota || 0).toLocaleString('es-CO');
  const primeraFecha = data.primeraFecha || '';

  const payload = {
    name: `Acuerdo de pago nro. ${data.nroAcuerdo}. Membresía ${data.producto}`,
    subject: '💙 Aquí comienza a materializarse tu sueño',
    message: `Te invitamos a leer y aceptar mediante tu firma el siguiente acuerdo de pago.<br><br>Recuerda también que podrás realizar el pago de tu primera cuota por valor de $${primeraCuotaFormateada} hasta el ${primeraFecha} en el link: ${data.primerLink || ''}`,
    remember: 24,
    signProfile: [
      {
        order: 0,
        name: `${data.nombres} ${data.apellidos}`.trim(),
        email: data.correo,
        phone: String(data.celular || ''),
        label: true
      }
    ],
    options: {
      whatsapp: false
    },
    file: base64File,
    email: AUCO_SENDER_EMAIL
  };

  const response = await fetch(`${AUCO_API_URL}/ext/document/upload`, {
    method: 'POST',
    headers: {
      'Authorization': AUCO_API_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();

  if (!response.ok) {
    console.error('[AUCO] Error respuesta:', responseData);
    throw new Error(`AUCO API error ${response.status}: ${JSON.stringify(responseData)}`);
  }

  const documentId = responseData.document;
  console.log(`[AUCO] ✅ Documento subido. ID: ${documentId}`);

  return {
    success: true,
    documentId,
    responseData
  };
}

/**
 * Flujo completo: Template → PDF → AUCO
 * @param {Object} data - Todos los datos del acuerdo
 * @param {string} data.nombres - Nombres del estudiante
 * @param {string} data.apellidos - Apellidos del estudiante
 * @param {string} data.cedula - Cédula del estudiante
 * @param {string} data.correo - Correo del estudiante
 * @param {string} data.celular - Celular del estudiante
 * @param {string} data.nroAcuerdo - Número del acuerdo
 * @param {string} data.producto - Nombre del producto/membresía
 * @param {number} data.monto - Valor total del acuerdo
 * @param {Array} data.cuotas - Plan de pagos [{nro_cuota, valor, fecha_limite, link_pago}]
 * @param {string} data.inicioPlataforma - "Con primer pago" o fecha
 * @param {string} data.comercial - Nombre del comercial
 * @param {string} data.primerLink - Link de pago de la primera cuota
 * @param {number} data.primeraCuota - Valor de la primera cuota
 * @param {string} data.primeraFecha - Fecha límite de la primera cuota (dd/mm/yyyy)
 * @returns {Promise<Object>} { success, documentId }
 */
async function generarYSubirAcuerdo(data) {
  console.log(`[AUCO] 📄 Generando acuerdo para ${data.nombres} ${data.apellidos} - Acuerdo ${data.nroAcuerdo}`);

  try {
    // 1. Obtener template
    const templateHtml = await getTemplate('acuerdo-pago');

    // 2. Reemplazar placeholders
    let htmlFinal = reemplazarPlaceholders(templateHtml, {
      ...data,
      consecutivo: data.nroAcuerdo,
      membresia: data.producto,
      ccestudiante: data.cedula
    });

    // 3. Inyectar fuente Montserrat y estilos globales
    const montserratStyles = `
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap');
        * { font-family: 'Montserrat', sans-serif !important; }
        .signature-container { min-height: 150px; padding: 25px 0; font-size: 28px; }
      </style>
    `;
    // Inyectar después de <head> o al inicio si no existe
    if (htmlFinal.includes('<head>')) {
      htmlFinal = htmlFinal.replace('<head>', '<head>' + montserratStyles);
    } else if (htmlFinal.includes('<html>')) {
      htmlFinal = htmlFinal.replace('<html>', '<html><head>' + montserratStyles + '</head>');
    } else {
      htmlFinal = montserratStyles + htmlFinal;
    }

    // 4. Envolver el placeholder de firma en un contenedor más grande con fuente 28px
    htmlFinal = htmlFinal.replace(
      '{{signature:0}}',
      '<div class="signature-container" style="min-height: 150px; padding: 25px 0; font-size: 28px;">{{signature:0}}</div>'
    );

    // 5. Limpiar placeholder de firma para el preview
    const htmlPreview = htmlFinal.replace(
      /<div class="signature-container"[^>]*>{{signature:0}}<\/div>/,
      '<div class="signature-container" style="min-height: 150px; padding: 25px 0; font-size: 28px; border-bottom: 1px solid #999;"><em style="color:#999;">[Firma electrónica pendiente]</em></div>'
    );

    // 6. Crear templates de header y footer para todas las páginas
    const logoBase64 = getLogoBase64();

    const headerTemplate = `
      <div style="width: 100%; padding: 10px 40px; box-sizing: border-box;">
        <img src="${logoBase64}" style="height: 45px; display: block; margin: 0 auto;" />
      </div>
    `;

    const footerTemplate = `
      <div style="width: 100%; text-align: center; font-size: 9px; font-family: 'Montserrat', Arial, sans-serif; color: #666; padding: 15px 40px; box-sizing: border-box; border-top: 1px solid #ddd;">
        <div style="margin-bottom: 3px;"><strong>Sentire Taller SAS</strong> · NIT 900.983.829-3</div>
        <div style="margin-bottom: 3px;">Correo electrónico: info@cursosfuturosresidentes.com</div>
        <div>Medellín, Antioquia.</div>
      </div>
    `;

    // 7. Convertir a PDF con header/footer en todas las páginas
    const pdfBuffer = await htmlToPDF(htmlFinal, { headerTemplate, footerTemplate });
    console.log(`[AUCO] PDF generado: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);

    // 8. Subir a AUCO
    const resultado = await uploadToAuco(data, pdfBuffer);

    console.log(`[AUCO] ✅ Proceso completo. Document ID: ${resultado.documentId}`);
    return {
      ...resultado,
      htmlPreview
    };

  } catch (error) {
    console.error(`[AUCO] ❌ Error:`, error.message);
    throw error;
  }
}

module.exports = {
  getTemplate,
  generarClausulaEjecucion,
  generarTablaPlanPagos,
  reemplazarPlaceholders,
  htmlToPDF,
  uploadToAuco,
  generarYSubirAcuerdo
};
