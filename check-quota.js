require('dotenv').config();
const { google } = require('googleapis');

async function checkQuota() {
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

  console.log('📊 Verificando cuota de la Service Account...\n');

  const about = await drive.about.get({
    fields: 'storageQuota, user'
  });

  const quota = about.data.storageQuota;
  const user = about.data.user;

  console.log('Usuario:', user.emailAddress);
  console.log('Nombre:', user.displayName);
  console.log('\n📦 Cuota de almacenamiento:');
  console.log(`  Límite: ${quota.limit ? (parseInt(quota.limit) / 1024 / 1024 / 1024).toFixed(2) + ' GB' : 'Sin límite'}`);
  console.log(`  Usado: ${(parseInt(quota.usage) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  En Drive: ${(parseInt(quota.usageInDrive) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  En Papelera: ${(parseInt(quota.usageInDriveTrash) / 1024 / 1024).toFixed(2)} MB`);

  if (quota.limit) {
    const percentUsed = (parseInt(quota.usage) / parseInt(quota.limit) * 100).toFixed(1);
    console.log(`\n⚠️ Uso: ${percentUsed}%`);
  }
}

checkQuota().catch(console.error);
