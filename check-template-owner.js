require('dotenv').config();
const { google } = require('googleapis');

async function checkOwner() {
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

  console.log('📋 Verificando propietario de la plantilla...\n');

  const fileInfo = await drive.files.get({
    fileId: templateId,
    fields: 'id, name, owners, sharingUser, capabilities, driveId'
  });

  console.log('Archivo:', fileInfo.data.name);
  console.log('ID:', fileInfo.data.id);
  console.log('Drive ID (si es compartida):', fileInfo.data.driveId || 'No es unidad compartida');
  console.log('\nPropietarios:');
  fileInfo.data.owners?.forEach(o => {
    console.log(`  - ${o.displayName} (${o.emailAddress})`);
  });
  console.log('\nCapacidades:');
  console.log('  Puede copiar:', fileInfo.data.capabilities?.canCopy);
  console.log('  Puede editar:', fileInfo.data.capabilities?.canEdit);
}

checkOwner().catch(console.error);
