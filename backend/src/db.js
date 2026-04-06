const { Pool } = require('pg');
const { config } = require('./config');

if (!config.databaseUrl) {
  console.warn('[backend] DATABASE_URL is empty, database calls will fail.');
}

const pool = new Pool({
  connectionString: config.databaseUrl || undefined,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, tx };
