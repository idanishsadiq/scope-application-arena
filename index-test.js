// Simple static sanity checks used during development.
const fs = require('fs');
for (const f of ['index.html','app.js','content.js','styles.css','config.js','README.md','supabase/schema.sql']) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${f}`);
}
const js = fs.readFileSync('app.js','utf8');
if (!js.includes('host_action') || !js.includes('submit_vote')) throw new Error('Core RPC integration missing');
const sql = fs.readFileSync('supabase/schema.sql','utf8');
for (const token of ['staff_profiles','question_bank','games','game_rounds','round_keys','game_players','votes','game_results','host_action','submit_vote']) {
  if (!sql.includes(token)) throw new Error(`SQL missing ${token}`);
}
console.log('SCOPE Application Arena v2 static checks passed.');
