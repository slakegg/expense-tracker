const fs = require('fs');
const { SUPABASE_URL, SUPABASE_ANON_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Задайте SUPABASE_URL и SUPABASE_ANON_KEY');
  process.exit(1);
}
fs.writeFileSync('js/config.js',
  `export const SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};\n` +
  `export const SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};\n`);