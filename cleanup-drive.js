require('dotenv').config();
const { google } = require('googleapis');

async function cleanupDrive() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: email,
      private_key: privateKey,
    },
    scopes: ['https://www.googleapis.com/auth/drive']
  });

  const authClient = await auth.getClient();
  const drive = google.drive({ version: 'v3', auth: authClient });

  console.log('🔍 Buscando archivos en el Drive de la Service Account...\n');

  // Listar todos los archivos
  const response = await drive.files.list({
    pageSize: 100,
    fields: 'files(id, name, mimeType, size, createdTime)',
    q: "trashed = false"
  });

  const files = response.data.files || [];
  console.log(`Encontrados ${files.length} archivos:\n`);

  let totalSize = 0;
  for (const file of files) {
    const size = parseInt(file.size) || 0;
    totalSize += size;
    console.log(`- ${file.name}`);
    console.log(`  ID: ${file.id}`);
    console.log(`  Tipo: ${file.mimeType}`);
    console.log(`  Tamaño: ${(size / 1024).toFixed(2)} KB`);
    console.log(`  Creado: ${file.createdTime}\n`);
  }

  console.log(`\nTamaño total: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);

  if (files.length === 0) {
    console.log('No hay archivos para eliminar.');
    return;
  }

  // Verificar si hay argumento --force para eliminar sin preguntar
  const forceDelete = process.argv.includes('--force');

  if (forceDelete) {
    console.log('\n🗑️ Modo --force: Eliminando archivos automáticamente...\n');

    for (const file of files) {
      try {
        await drive.files.delete({ fileId: file.id });
        console.log(`✅ Eliminado: ${file.name}`);
      } catch (error) {
        console.log(`❌ Error eliminando ${file.name}: ${error.message}`);
      }
    }

    // También vaciar la papelera
    console.log('\n🗑️ Vaciando papelera...');
    try {
      await drive.files.emptyTrash();
      console.log('✅ Papelera vaciada');
    } catch (error) {
      console.log(`❌ Error vaciando papelera: ${error.message}`);
    }

    console.log('\n✅ Limpieza completada!');
    return;
  }

  // Preguntar si eliminar (modo interactivo)
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('\n¿Eliminar TODOS estos archivos? (si/no): ', async (answer) => {
    if (answer.toLowerCase() === 'si') {
      console.log('\n🗑️ Eliminando archivos...\n');

      for (const file of files) {
        try {
          await drive.files.delete({ fileId: file.id });
          console.log(`✅ Eliminado: ${file.name}`);
        } catch (error) {
          console.log(`❌ Error eliminando ${file.name}: ${error.message}`);
        }
      }

      // También vaciar la papelera
      console.log('\n🗑️ Vaciando papelera...');
      try {
        await drive.files.emptyTrash();
        console.log('✅ Papelera vaciada');
      } catch (error) {
        console.log(`❌ Error vaciando papelera: ${error.message}`);
      }

      console.log('\n✅ Limpieza completada!');
    } else {
      console.log('Operación cancelada.');
    }

    rl.close();
  });
}

cleanupDrive().catch(console.error);
