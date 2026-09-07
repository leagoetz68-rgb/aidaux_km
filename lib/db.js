const { Pool } = require('pg');

let pool;

function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error("Variable d'environnement DATABASE_URL manquante");
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  }
  return pool;
}

let schemaReady = false;

async function ensureSchema(pool) {
  if (schemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS frais_km_trajets (
      id TEXT PRIMARY KEY,
      salarie TEXT NOT NULL,
      mois TEXT NOT NULL,
      date DATE NOT NULL,
      depart TEXT NOT NULL,
      arrivee TEXT NOT NULL,
      km NUMERIC NOT NULL
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_frais_km_salarie_mois
    ON frais_km_trajets (salarie, mois);
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS frais_km_settings (
      salarie TEXT PRIMARY KEY,
      domicile TEXT
    );
  `);
  schemaReady = true;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

module.exports = { getPool, ensureSchema, makeId };
