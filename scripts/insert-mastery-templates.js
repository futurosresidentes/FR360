/**
 * Script para insertar los templates FR Mastery en Supabase
 * Ejecutar con: node scripts/insert-mastery-templates.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function insertTemplates() {
  const templates = [
    {
      slug: 'acuerdo-frmastery',
      name: 'Acuerdo + Contrato FR Mastery',
      file: path.join(__dirname, '..', 'templates', 'acuerdo-contrato-fr-mastery.html')
    },
    {
      slug: 'contrato-frmastery',
      name: 'Contrato FR Mastery',
      file: path.join(__dirname, '..', 'templates', 'contrato-fr-mastery.html')
    }
  ];

  for (const tpl of templates) {
    const html = fs.readFileSync(tpl.file, 'utf-8');
    console.log(`Insertando "${tpl.name}" (${tpl.slug})... (${html.length} chars)`);

    const { data, error } = await supabase
      .from('document_templates')
      .upsert(
        { slug: tpl.slug, html_content: html },
        { onConflict: 'slug' }
      );

    if (error) {
      console.error(`  ❌ Error: ${error.message}`);
    } else {
      console.log(`  ✅ OK`);
    }
  }
}

insertTemplates().then(() => {
  console.log('\nDone!');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
