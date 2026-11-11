import pg from 'pg';

const { Pool } = pg;

export function createDb({ host, port, database, user, password }) {
  const pool = new Pool({ host, port, database, user, password, connectionTimeoutMillis: 5000 });

  async function init() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS items (
        id         SERIAL      PRIMARY KEY,
        name       TEXT        NOT NULL,
        quantity   INTEGER     NOT NULL CHECK (quantity >= 0),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async function listItems() {
    const { rows } = await pool.query(
      'SELECT id, name, quantity, created_at FROM items ORDER BY created_at DESC'
    );
    return rows;
  }

  async function ping() {
    await pool.query('SELECT 1');
  }

  async function close() {
    await pool.end();
  }

  return { init, listItems, ping, close };
}
