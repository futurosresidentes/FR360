#!/usr/bin/env node
/**
 * Script para verificar que todas las variables de entorno necesarias estén configuradas
 * Uso: node check-env.js
 */

require('dotenv').config();

const REQUIRED_VARS = {
  'Sesiones y Seguridad': [
    'SESSION_SECRET'
  ],
  'Google OAuth 2.0': [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_CALLBACK_URL'
  ],
  'Strapi CMS': [
    'STRAPI_BASE_URL',
    'STRAPI_TOKEN'
  ],
  'FR360 API': [
    'FR360_BASE_URL',
    'FR360_BEARER_TOKEN',
    'FR360_EPAYCO_TOKEN'
  ],
  'FRAPP API': [
    'FRAPP_BASE_URL',
    'FRAPP_API_KEY'
  ],
  'Callbell API': [
    'CALLBELL_BASE_URL',
    'CALLBELL_API_KEY'
  ],
  'Old Membership Platform': [
    'OLD_MEMB_BASE_URL',
    'OLD_MEMB_AUTH'
  ],
  'Usuarios Especiales': [
    'SPECIAL_USERS'
  ]
};

console.log('\n🔍 Verificando Variables de Entorno...\n');
console.log('='.repeat(60));

let allGood = true;
let missingVars = [];

for (const [category, vars] of Object.entries(REQUIRED_VARS)) {
  console.log(`\n📁 ${category}`);
  console.log('-'.repeat(60));

  vars.forEach(varName => {
    const value = process.env[varName];
    const hasValue = value && value.trim() !== '';
    const status = hasValue ? '✅' : '❌';

    if (!hasValue) {
      allGood = false;
      missingVars.push(varName);
    }

    // Mostrar preview del valor (primeros 30 caracteres)
    const preview = hasValue
      ? value.length > 30
        ? value.substring(0, 30) + '...'
        : value
      : 'NO CONFIGURADA';

    console.log(`  ${status} ${varName.padEnd(25)} = ${preview}`);
  });
}

console.log('\n' + '='.repeat(60));

if (allGood) {
  console.log('\n✅ ¡Todas las variables están configuradas correctamente!\n');
  process.exit(0);
} else {
  console.log('\n❌ Faltan las siguientes variables:\n');
  missingVars.forEach(v => console.log(`   • ${v}`));
  console.log('\n📖 Consulta RENDER_ENV_VARIABLES.md para más información.\n');
  process.exit(1);
}
