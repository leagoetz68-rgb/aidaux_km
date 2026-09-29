// Client minimal pour l'API Ximi (Xelya) — même connexion que l'app Aid'Aux Prospects.
// Variables d'environnement Vercel (à copier depuis le projet aidaux-prospect) :
//   XIMI_API_KEY_ID   -> identifiant de clé fourni par Xelya
//   XIMI_PRIVATE_KEY  -> clé privée PEM complète (BEGIN ... END)
//   XIMI_BASE_URL     -> optionnel, défaut https://api.ximi.xelya.io/Ximi3
//   XIMI_CLEARANCE    -> optionnel
const crypto = require('crypto');

const BASE_URL = (process.env.XIMI_BASE_URL || 'https://api.ximi.xelya.io/Ximi3').replace(/\/+$/, '');
let cache = { token: null, exp: 0 };

function b64url(obj) {
  return Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');
}

function apiKey() {
  const now = Math.floor(Date.now() / 1000);
  if (cache.token && cache.exp - now > 60) return cache.token;
  if (!process.env.XIMI_API_KEY_ID || !process.env.XIMI_PRIVATE_KEY) {
    throw new Error('Variables XIMI_API_KEY_ID / XIMI_PRIVATE_KEY manquantes sur Vercel');
  }
  const payload = { sub: process.env.XIMI_API_KEY_ID, exp: now + 15 * 60 };
  if (process.env.XIMI_CLEARANCE) payload.clearance = Number(process.env.XIMI_CLEARANCE);
  const entete = b64url({ alg: 'RS512', typ: 'JWT' });
  const corps = b64url(payload);
  const cle = process.env.XIMI_PRIVATE_KEY.replace(/\\n/g, '\n').trim();
  const signature = crypto.createSign('RSA-SHA512').update(`${entete}.${corps}`).sign(cle).toString('base64url');
  cache = { token: `${entete}.${corps}.${signature}`, exp: payload.exp };
  return cache.token;
}

async function requete(methode, chemin, { params, corps, timeout = 20000 } = {}) {
  const url = new URL(`${BASE_URL}/${String(chemin).replace(/^\/+/, '')}`);
  Object.entries(params || {}).forEach(([k, v]) => { if (v !== undefined && v !== null) url.searchParams.set(k, v); });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, {
      method: methode,
      headers: { 'Content-Type': 'application/json', 'Api-Key': apiKey() },
      body: corps ? JSON.stringify(corps) : undefined,
      signal: ctrl.signal,
    });
    const texte = await r.text();
    if (!r.ok) throw new Error(`${r.status} ${r.statusText} - réponse Ximi : ${texte.slice(0, 400)}`);
    return texte ? JSON.parse(texte) : {};
  } finally {
    clearTimeout(t);
  }
}

const get = (chemin, params) => requete('GET', chemin, { params });

// Toutes les pages d'une liste (Offset / Top / HasMoreRows)
async function getAll(chemin, params = {}, taille = 500) {
  const res = [];
  let offset = 0;
  for (let i = 0; i < 40; i++) {
    const data = await get(chemin, { ...params, Offset: offset, Top: taille, ComputeHasMoreRows: 'true' });
    const page = Array.isArray(data) ? data : (data.Results || []);
    res.push(...page);
    if (Array.isArray(data) || !data.HasMoreRows || !page.length) break;
    offset += page.length;
  }
  return res;
}

module.exports = { BASE_URL, apiKey, get, getAll, requete };
