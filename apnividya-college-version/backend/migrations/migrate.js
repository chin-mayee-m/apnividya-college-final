require('dotenv').config();
const db = require('../src/config/db');
const migrations = [require('./001_init.js'), require('./002_proctoring.js'), require('./003_college_admin.js')];

async function migrate() {
  await db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  )`);
  const applied = new Set((await db.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  let ran = 0;
  for (const m of migrations) {
    if (applied.has(m.name)) { console.log(`• skip   ${m.name} (already applied)`); continue; }
    await db.transaction(async () => {
      await db.exec(m.sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES (?)', [m.name]);
    });
    console.log(`✓ apply  ${m.name}`); ran += 1;
  }
  console.log(ran === 0 ? 'Schema already up to date.' : `Applied ${ran} migration(s).`);
}
if (require.main === module) migrate().catch((err) => { console.error('[fatal] migration failed:', err); process.exit(1); });
module.exports = migrate;
