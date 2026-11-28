'use strict';
const { Pool, types } = require('pg');

types.setTypeParser(1114, (str) => str.replace(' ', 'T') + 'Z');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});
pool.on('error', (err) => console.error('Idle PostgreSQL client error:', err.message));

const httpError = (status, message) => Object.assign(new Error(message), { status });

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const logActivity = (userId, action, docId, result, db = pool) =>
  db.query(
    'INSERT INTO ActivityLogEntry (user_id, action_type, document_id, result) VALUES ($1, $2, $3, $4)',
    [userId, action, docId || null, result]
  );

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS DocumentType (
      id SERIAL PRIMARY KEY, name TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ DEFAULT now());
    CREATE TABLE IF NOT EXISTS EventFolder (
      id SERIAL PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE, deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (category, name));
    CREATE TABLE IF NOT EXISTS SubFolder (
      id SERIAL PRIMARY KEY, category TEXT NOT NULL, event_name TEXT NOT NULL, name TEXT NOT NULL,
      is_deleted BOOLEAN NOT NULL DEFAULT FALSE, deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT now(), UNIQUE (category, event_name, name));
    ALTER TABLE DocumentType ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE DocumentType ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
    ALTER TABLE EventFolder ADD COLUMN IF NOT EXISTS deleted_with_type BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE Document ADD COLUMN IF NOT EXISTS deleted_with_type BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE Document ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'General';`);

  // Strictly two top-level departments: Secretariat and Fiscal
  await pool.query(`DELETE FROM DocumentType WHERE name NOT IN ('Secretariat', 'Fiscal')`);
  await pool.query(`INSERT INTO DocumentType (name) VALUES ('Secretariat'), ('Fiscal') ON CONFLICT (name) DO UPDATE SET is_deleted = FALSE, deleted_at = NULL`);
}

module.exports = { pool, tx, logActivity, ensureSchema, httpError };