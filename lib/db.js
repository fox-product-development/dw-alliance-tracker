const { Pool } = require("pg");

let pool;

if (!globalThis._dwPool) {
  globalThis._dwPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });
}

pool = globalThis._dwPool;

async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

module.exports = { query };
