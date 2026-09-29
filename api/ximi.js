// Pont entre l'app km et l'API Ximi.
// GET /api/ximi?action=diag  -> lit la documentation Swagger de Ximi (Interventions, Agents, Mission)
//                               et montre la FORME des données (jamais de valeurs personnelles).
const ximi = require('../lib/ximi');

function forme(obj, prof = 0) {
  if (Array.isArray(obj)) return obj.length ? [forme(obj[0], prof + 1)] : 'liste vide';
  if (obj && typeof obj === 'object') {
    if (prof > 3) return 'objet';
    const o = {};
    Object.keys(obj).sort().forEach(k => { o[k] = forme(obj[k], prof + 1); });
    return o;
  }
  if (obj === null || obj === undefined) return 'vide';
  if (typeof obj === 'number' || typeof obj === 'boolean') return typeof obj;
  return String(obj).trim() ? 'texte' : 'texte vide';
}

async function diag() {
  const res = { documentation: null, operations: {}, modeles: {}, exemples: {} };
  let spec = null;
  for (const doc of ['swagger/docs/V1', 'swagger/docs/v1']) {
    try {
      spec = await ximi.get(doc);
      if (spec && spec.paths) { res.documentation = doc; break; }
    } catch (e) { res.documentation_erreur = String(e.message).slice(0, 200); }
  }
  if (spec && spec.paths) {
    const defs = spec.definitions || {};
    const utiles = new Set();
    Object.entries(spec.paths).forEach(([chemin, ops]) => {
      if (!/intervention|agent|mission|planning|schedule/i.test(chemin)) return;
      Object.entries(ops).forEach(([methode, op]) => {
        const params = (op.parameters || []).map(p => ({
          nom: p.name, ou: p.in, type: p.type || (p.schema && (p.schema.$ref || p.schema.type)) || '',
          obligatoire: !!p.required, description: (p.description || '').slice(0, 120),
        }));
        const rep = ((op.responses || {})['200'] || {}).schema || {};
        const ref = rep.$ref || (rep.items && rep.items.$ref) || '';
        if (ref) utiles.add(ref.split('/').pop());
        res.operations[`${methode.toUpperCase()} ${chemin}`] = {
          resume: (op.summary || '').slice(0, 150), parametres: params, reponse: ref.split('/').pop() || rep.type || '',
        };
      });
    });
    // modèles de réponse (+ modèles imbriqués, 2 niveaux)
    const aVoir = [...utiles];
    for (let i = 0; i < aVoir.length && i < 40; i++) {
      const nom = aVoir[i];
      const d = defs[nom];
      if (!d) continue;
      res.modeles[nom] = {};
      Object.entries(d.properties || {}).forEach(([k, v]) => {
        const r = v.$ref || (v.items && v.items.$ref);
        res.modeles[nom][k] = r ? r.split('/').pop() : (v.type || '') + (v.format ? ` (${v.format})` : '');
        if (r) { const n = r.split('/').pop(); if (!aVoir.includes(n)) aVoir.push(n); }
      });
    }
  }
  // Petit essai réel : forme d'une intervention et d'un agent (sans valeurs)
  for (const chemin of ['api/interventions', 'api/agents']) {
    try {
      const d = await ximi.get(chemin, { Top: 1 });
      res.exemples[chemin] = forme(d);
    } catch (e) { res.exemples[chemin] = String(e.message).slice(0, 250); }
  }
  return res;
}

module.exports = async (req, res) => {
  try {
    if ((req.query.action || 'diag') === 'diag') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify(await diag(), null, 2));
      return;
    }
    res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e).slice(0, 400) });
  }
};

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
