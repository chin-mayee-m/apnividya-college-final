const { Pool, types } = require('pg');
const { AsyncLocalStorage } = require('async_hooks');
require('dotenv').config();

// Keep PostgreSQL aggregate values numerically compatible with the original SQLite code.
types.setTypeParser(20, (value) => Number(value));
types.setTypeParser(1700, (value) => Number(value));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required. Example: postgresql://postgres:password@localhost:5432/apnividya');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  max: Number(process.env.DB_POOL_MAX || 10),
});

const txStorage = new AsyncLocalStorage();

function convertPlaceholders(sql) {
  let out = '';
  let index = 0;
  let quote = null;
  let dollarTag = null;
  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    if (dollarTag) {
      if (sql.startsWith(dollarTag, i)) {
        out += dollarTag;
        i += dollarTag.length - 1;
        dollarTag = null;
      } else out += c;
      continue;
    }
    if (quote) {
      out += c;
      if (c === quote) {
        if (sql[i + 1] === quote) { out += sql[++i]; }
        else quote = null;
      }
      continue;
    }
    if (c === "'" || c === '"') { quote = c; out += c; continue; }
    if (c === '$' && sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$/)) {
      const m = sql.slice(i).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$/)[0];
      dollarTag = m; out += m; i += m.length - 1; continue;
    }
    if (c === '?') { out += `$${++index}`; continue; }
    out += c;
  }
  return out;
}

function normalise(params = []) {
  return params.map((p) => {
    if (p === undefined) return null;
    if (p !== null && typeof p === 'object' && !(p instanceof Date) && !Buffer.isBuffer(p)) {
      return JSON.stringify(p);
    }
    return p;
  });
}

function pgSql(sql) {
  return convertPlaceholders(String(sql).replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP'));
}

async function query(sql, params = []) {
  let text = pgSql(sql);
  const trimmed = text.trim();
  const isInsert = /^INSERT\s+/i.test(trimmed);
  if (/^INSERT\s+OR\s+IGNORE\s+/i.test(trimmed)) {
    text = text.replace(/^INSERT\s+OR\s+IGNORE\s+/i, 'INSERT ');
    if (!/\bON\s+CONFLICT\b/i.test(text)) text += ' ON CONFLICT DO NOTHING';
  }
  // Existing application code expects lastInsertRowid after INSERTs.
  // PostgreSQL returns it through RETURNING id without changing the public API.
  if (isInsert && !/\bRETURNING\b/i.test(text) && !/INSERT\s+INTO\s+schema_migrations/i.test(text)) {
    text += ' RETURNING id';
  }

  const client = txStorage.getStore() || pool;
  const result = await client.query(text, normalise(params));
  return {
    rows: result.rows,
    rowCount: result.rowCount,
    lastInsertRowid: result.rows?.[0]?.id ?? null,
  };
}

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await txStorage.run(client, fn);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    throw err;
  } finally {
    client.release();
  }
}

async function exec(sql) {
  const client = txStorage.getStore() || pool;
  return client.query(pgSql(sql));
}

async function reset() {
  await exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
}

module.exports = {
  query,
  transaction,
  exec,
  reset,
  pool,
  raw: { close: async () => pool.end() },
};
