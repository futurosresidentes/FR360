/**
 * Descarga la plantilla y la sube al Drive de la Service Account
 * para que sea propietaria y no haya problemas de cuota.
 */
require('dotenv').config();
const { google } = require('googleapis');

async function uploadTemplate() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';

  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  const templateId = process.env.GOOGLE_PAZ_SALVO_TEMPLATE_ID;

  console.log('📥 Descargando plantilla como documento de Google...\n');

  // Exportar el documento como DOCX
  const exportResponse = await drive.files.export({
    fileId: templateId,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }, {
    responseType: 'stream'
  });

  // Recoger los datos del stream
  const chunks = [];
  for await (const chunk of exportResponse.data) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  console.log('📤 Subiendo al Drive de la Service Account...\n');

  // Subir como nuevo documento de Google
  const { Readable } = require('stream');
  const uploadResponse = await drive.files.create({
    requestBody: {
      name: 'Minuta Paz y salvo (SA Owner)',
      mimeType: 'application/vnd.google-apps.document'  // Convertir a Google Doc
    },
    media: {
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      body: Readable.from(buffer)
    },
    fields: 'id, name, owners'
  });

  const newId = uploadResponse.data.id;
  console.log('✅ Plantilla subida exitosamente!');
  console.log('\n🔑 NUEVO TEMPLATE ID:', newId);
  console.log('\n📝 Actualiza tu .env con:');
  console.log(`GOOGLE_PAZ_SALVO_TEMPLATE_ID=${newId}`);

  // Verificar propietario
  const fileInfo = await drive.files.get({
    fileId: newId,
    fields: 'owners'
  });
  console.log('\nPropietario:', fileInfo.data.owners?.[0]?.emailAddress);
}

uploadTemplate().catch(console.error);
