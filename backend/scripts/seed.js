const { query } = require('../src/db');
const { hashPassword } = require('../src/auth');

async function run() {
  const email = process.env.SEED_ADMIN_EMAIL || 'admin@wego.local';
  const pass = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const hash = await hashPassword(pass);
  await query(
    `insert into app_users(email, password_hash, role)
     values ($1, $2, 'admin')
     on conflict(email) do update set password_hash = excluded.password_hash, role='admin'`,
    [email, hash]
  );
  console.log(`[seed] admin ready: ${email}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] failed', err);
    process.exit(1);
  });
