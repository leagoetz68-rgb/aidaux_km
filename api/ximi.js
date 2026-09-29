// Pont entre l'app km et l'API Ximi.
// GET /api/ximi?action=diag  -> lit la documentation Swagger de Ximi (Interventions, Agents, Mission)
//                               et montre la FORME des données (jamais de valeurs personnelles).
let ximi = null;
let erreurChargement = null;
try {
  ximi = require('../lib/ximi');
} catch (e) {
  // lib/ximi.js absent, mal nommé ou inversé avec api/ximi.js : on l'affiche au lieu de planter
  erreurChargement = e;
}

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
  if (erreurChargement || !ximi || typeof ximi.get !== 'function') {
    res.status(500).json({
      error: "Le fichier lib/ximi.js est introuvable ou incorrect (vérifiez qu'il est bien dans le dossier lib, " +
             "nommé ximi.js, et qu'il commence par « Client minimal pour l'API Ximi »).",
      detail: erreurChargement ? String(erreurChargement.message).slice(0, 300) : 'contenu inattendu',
    });
    return;
  }
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
