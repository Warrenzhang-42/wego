const fs = require('fs');
const path = require('path');
const { query } = require('../src/db');

async function run() {
  const dir = path.resolve(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    process.stdout.write(`[migrate] ${file} ... `);
    await query(sql);
    process.stdout.write('ok\n');
  }
}

run()
  .then(() => {
    console.log('[migrate] done');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[migrate] failed', err);
    process.exit(1);
  });
