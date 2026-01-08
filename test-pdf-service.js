require('dotenv').config();
const pdfService = require('./services/pdfService');

async function test() {
  console.log('🧪 Probando generación de PDF con Supabase...\n');

  const testData = {
    nombres: 'Angie Estefania',
    apellidos: 'Hidalgo Delgado',
    cedula: '1004255662',
    producto: 'Élite - 9 meses - Pago anticipado',
    acuerdo: '25080637515306'
  };

  const result = await pdfService.generarPazYSalvo(testData);

  console.log('\n📋 Resultado:');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✅ ¡PDF generado exitosamente!');
    console.log('🔗 URL:', result.pdfUrl);
  } else {
    console.log('\n❌ Error:', result.error);
  }
}

test();
