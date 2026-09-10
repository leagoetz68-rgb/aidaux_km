// Accès à la base de comptes partagée entre toutes les applis AID'Aux
// (mêmes tables `comptes` / `comptes_tokens` que auth.py côté Flask).
// Utilise AUTH_DATABASE_URL si définie, sinon retombe sur DATABASE_URL.

const { Pool } = require('pg');
const crypto = require('crypto');
const { hashPassword, verifyPassword } = require('./passwordHash');

let authPool;
let schemaReady = false;

// Emails autorisés à posséder un compte (mêmes que sur les autres applis).
// Surchageable via la variable d'environnement AUTH_ALLOWED_EMAILS (adresses
// séparées par des virgules).
const EMAILS_PAR_DEFAUT = [
  'magali.metz@aidaux.fr',
  'magalie.fux@aidaux.fr',
  'lea.goetz@aidaux.fr',
  'marie.mischel@aidaux.fr',
  'tatiana.suplon@aidaux.fr',
  'jennifer.soulliez@aidaux.fr',
];

function emailsAutorises() {
  const brut = (process.env.AUTH_ALLOWED_EMAILS || '').trim();
  if (brut) {
    return brut.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  }
  return EMAILS_PAR_DEFAUT.map(e => e.toLowerCase());
}

function emailAutorise(email) {
  return emailsAutorises().includes((email || '').trim().toLowerCase());
}

function getAuthPool() {
  if (!authPool) {
    const url = process.env.AUTH_DATABASE_URL || process.env.DATABASE_URL;
    if (!url) {
      throw new Error("Variable AUTH_DATABASE_URL (ou DATABASE_URL) manquante.");
    }
    authPool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  }
  return authPool;
}

async function ensureAuthSchema() {
  if (schemaReady) return;
  const pool = getAuthPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comptes (
      email             TEXT PRIMARY KEY,
      nom               TEXT,
      mot_de_passe_hash TEXT,
      cree_at           TIMESTAMP DEFAULT NOW(),
      maj_at            TIMESTAMP
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS comptes_tokens (
      token      TEXT PRIMARY KEY,
      email      TEXT NOT NULL,
      expire_at  TIMESTAMP NOT NULL,
      utilise_at TIMESTAMP
    )
  `);
  schemaReady = true;
}

async function verifyLogin(email, password) {
  await ensureAuthSchema();
  const pool = getAuthPool();
  const normEmail = (email || '').trim().toLowerCase();
  const { rows } = await pool.query(
    'SELECT mot_de_passe_hash FROM comptes WHERE email = $1',
    [normEmail]
  );
  if (!rows.length || !rows[0].mot_de_passe_hash) return false;
  return verifyPassword(rows[0].mot_de_passe_hash, password || '');
}

async function createResetToken(email) {
  await ensureAuthSchema();
  const pool = getAuthPool();
  const normEmail = (email || '').trim().toLowerCase();
  const token = crypto.randomBytes(32).toString('base64url');
  const expireAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h, comme les autres applis
  await pool.query(
    'INSERT INTO comptes_tokens (token, email, expire_at) VALUES ($1, $2, $3)',
    [token, normEmail, expireAt]
  );
  return token;
}

async function emailForToken(token) {
  await ensureAuthSchema();
  const pool = getAuthPool();
  const { rows } = await pool.query(
    'SELECT email, expire_at, utilise_at FROM comptes_tokens WHERE token = $1',
    [token]
  );
  if (!rows.length) return null;
  const row = rows[0];
  if (row.utilise_at) return null;
  if (new Date(row.expire_at) < new Date()) return null;
  return row.email;
}

async function setPassword(token, password) {
  const email = await emailForToken(token);
  if (!email) return null;
  const pool = getAuthPool();
  const hash = hashPassword(password);
  await pool.query(
    `INSERT INTO comptes (email, mot_de_passe_hash, maj_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (email)
     DO UPDATE SET mot_de_passe_hash = EXCLUDED.mot_de_passe_hash, maj_at = NOW()`,
    [email, hash]
  );
  await pool.query('UPDATE comptes_tokens SET utilise_at = NOW() WHERE token = $1', [token]);
  return email;
}

module.exports = {
  emailAutorise,
  verifyLogin,
  createResetToken,
  emailForToken,
  setPassword,
};
