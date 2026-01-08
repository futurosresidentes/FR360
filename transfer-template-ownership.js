/**
 * Script para transferir la propiedad de la plantilla a la Service Account
 *
 * INSTRUCCIONES:
 * 1. Ve a Google Drive y abre la plantilla "Minuta Paz y salvo"
 * 2. Clic derecho > Compartir > Compartir
 * 3. Agrega: fr360-drive@fr360-auth.iam.gserviceaccount.com
 * 4. Dale permiso de "Editor"
 * 5. Luego ejecuta este script para que la Service Account haga una COPIA PROPIA
 *
 * La copia quedará en el Drive de la Service Account y podrá usarse sin límites de cuota.
 */

require('dotenv').config();
const { google } = require('googleapis');

async function transferTemplate() {
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

  console.log('📋 Copiando plantilla para que la Service Account sea propietaria...\n');
  console.log('Template ID original:', templateId);

  try {
    // Copiar la plantilla - la copia será propiedad de la Service Account
    const copyResponse = await drive.files.copy({
      fileId: templateId,
      requestBody: {
        name: 'Minuta Paz y salvo (Service Account)'
        // Sin parents = queda en el Drive de la Service Account
      }
    });

    const newTemplateId = copyResponse.data.id;
    console.log('\n✅ Plantilla copiada exitosamente!');
    console.log('\n🔑 NUEVO TEMPLATE ID:', newTemplateId);
    console.log('\n📝 Actualiza tu .env con:');
    console.log(`GOOGLE_PAZ_SALVO_TEMPLATE_ID=${newTemplateId}`);

    // Verificar propiedad
    const fileInfo = await drive.files.get({
      fileId: newTemplateId,
      fields: 'owners, name'
    });

    console.log('\n📄 Información del nuevo archivo:');
    console.log('Nombre:', fileInfo.data.name);
    console.log('Propietarios:', fileInfo.data.owners?.map(o => o.emailAddress).join(', '));

  } catch (error) {
    console.error('❌ Error:', error.message);

    if (error.message.includes('not found')) {
      console.log('\n💡 Asegúrate de que la plantilla esté compartida con:');
      console.log('   fr360-drive@fr360-auth.iam.gserviceaccount.com');
    }
  }
}

transferTemplate();
