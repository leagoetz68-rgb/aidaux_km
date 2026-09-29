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

// Comme forme(), mais affiche les valeurs des champs de date / d'identifiant (pas de données personnelles)
function formeAvecDates(obj, prof = 0) {
  if (Array.isArray(obj)) return obj.length ? [formeAvecDates(obj[0], prof + 1)] : 'liste vide';
  if (obj && typeof obj === 'object') {
    if (prof > 3) return 'objet';
    const o = {};
    Object.keys(obj).sort().forEach(k => {
      const v = obj[k];
      o[k] = (/date|start|end|time|begin|from|day|status|^id$|id$/i.test(k) && (typeof v !== 'object' || v === null))
        ? v : formeAvecDates(v, prof + 1);
    });
    return o;
  }
  return forme(obj);
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

// ---------------------------------------------------------------------------
// Trajets du mois calculés depuis le planning Ximi
// GET /api/ximi?action=trajets&salarie=Nom Prénom&mois=YYYY-MM[&domicile=...&dlon=&dlat=]
// Pour chaque jour travaillé : domicile -> 1re intervention, dernière intervention -> domicile.
// ---------------------------------------------------------------------------
const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function libelleAdresse(a) {
  if (!a) return '';
  let rue = String(a.Street1 || '').trim();
  const cp = String(a.Zip || '').trim(), ville = String(a.City || '').trim();
  if (cp && rue.includes(cp)) rue = rue.slice(0, rue.indexOf(cp)).replace(/[\s,-]+$/, '');
  return rue + ((cp || ville) ? ' - ' + [cp, ville].filter(Boolean).join(' ') : '');
}
function coordsAdresse(a) {
  if (!a) return null;
  const lat = Number(a.Latitude), lon = Number(a.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null;
  return { lon, lat, label: libelleAdresse(a), warning: null };
}
const idDe = (x, ...cles) => { for (const c of cles) { const v = c.split('.').reduce((o, k) => (o || {})[k], x); if (v) return v; } return null; };

// Formats de filtre possibles pour /api/interventions/all : la documentation indique
// « request.filter.start », mais on essaie plusieurs écritures et on garde la première
// qui renvoie des interventions (mémorisée pour les appels suivants).
let formatRetenu = null;
const frDate = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
const FORMATS = [
  { nom: 'request.filter (ISO Z)', p: (d, f) => ({ 'request.filter.start': d + 'T00:00:00Z', 'request.filter.end': f + 'T00:00:00Z' }) },
  { nom: 'request.filter (ISO +02:00)', p: (d, f) => ({ 'request.filter.start': d + 'T00:00:00+02:00', 'request.filter.end': f + 'T00:00:00+02:00' }) },
  { nom: 'request.filter (JJ/MM/AAAA)', p: (d, f) => ({ 'request.filter.start': frDate(d), 'request.filter.end': frDate(f) }) },
  { nom: 'request.filter + statut tous', p: (d, f) => ({ 'request.filter.start': d, 'request.filter.end': f, 'request.filter.status': '' }) },
  { nom: 'request.filter (dates)', p: (d, f) => ({ 'request.filter.start': d, 'request.filter.end': f }) },
  { nom: 'request.filter (date+heure)', p: (d, f) => ({ 'request.filter.start': d + 'T00:00:00', 'request.filter.end': f + 'T00:00:00' }) },
  { nom: 'filter', p: (d, f) => ({ 'filter.start': d, 'filter.end': f }) },
  { nom: 'Filter majuscules', p: (d, f) => ({ 'Filter.Start': d, 'Filter.End': f }) },
  { nom: 'start/end', p: (d, f) => ({ start: d, end: f }) },
  { nom: 'startDate/endDate', p: (d, f) => ({ startDate: d, endDate: f }) },
  { nom: 'request.filter + entité 444', p: (d, f) => ({ 'request.filter.start': d, 'request.filter.end': f, 'request.filter.agencyId': 444 }) },
  { nom: 'request.filter + entité 690', p: (d, f) => ({ 'request.filter.start': d, 'request.filter.end': f, 'request.filter.agencyId': 690 }) },
];
const PAGES = [
  (o, t) => ({ 'request.offset': o, 'request.top': t, 'request.computeHasMoreRows': 'true' }),
  (o, t) => ({ Offset: o, Top: t, ComputeHasMoreRows: 'true' }),
];
const listeDe = (data) => Array.isArray(data) ? data : ((data && data.Results) || []);
const debutDe = (it) => String(it.Start || it.PlannedStart || it.StartDate || it.Begin || it.BeginDate ||
  it.From || it.Date || it.Day || (it.Schedule || {}).Start || '');
let essais = [];
let echantillon = null;

async function choisirFormat(debut, fin) {
  if (formatRetenu) return formatRetenu;
  for (const f of FORMATS) {
    for (const pg of PAGES) {
      try {
        const data = await ximi.get('api/interventions/all', { ...f.p(debut, fin), ...pg(0, 50) });
        const page = listeDe(data);
        if (page.length && !echantillon) echantillon = page[0];
        const dansLePeriode = page.filter(it => { const d = debutDe(it).slice(0, 10); return d >= debut && d < fin; });
        essais.push({ format: f.nom, pagination: PAGES.indexOf(pg), resultats: page.length, dans_la_periode: dansLePeriode.length });
        if (dansLePeriode.length) { formatRetenu = { f, pg }; return formatRetenu; }
      } catch (e) {
        essais.push({ format: f.nom, pagination: PAGES.indexOf(pg), erreur: String(e.message).slice(0, 120) });
      }
    }
  }
  return null;
}

// Récupère TOUTES les pages d'une recherche : Ximi peut limiter la taille des pages
// (ex. 50 lignes même si on en demande 500). On lit le nombre total (Hitcount),
// puis on charge les pages restantes par lots en parallèle.
let pagesPerdues = 0;
const pause = (ms) => new Promise(r => setTimeout(r, ms));
// Une page, avec jusqu'à 3 nouveaux essais si Ximi ne répond pas (surcharge, limite de débit...)
async function pageAvecEssais(filtres, offset, taille) {
  for (let essai = 0; essai < 4; essai++) {
    try {
      return listeDe(await ximi.get('api/interventions/all', { ...filtres, 'request.offset': offset, 'request.top': taille }));
    } catch (e) {
      await pause(600 * (essai + 1));
    }
  }
  pagesPerdues++;
  return [];
}

async function toutesLesPages(filtres) {
  const TAILLE = 500, MAX_LIGNES = 30000;
  let premiere = null;
  for (let essai = 0; essai < 4 && !premiere; essai++) {
    try {
      premiere = await ximi.get('api/interventions/all', {
        ...filtres, 'request.offset': 0, 'request.top': TAILLE,
        'request.computeHitCount': 'true', 'request.computeHasMoreRows': 'true',
      });
    } catch (e) {
      if (essai === 3) throw new Error('Ximi ne répond pas pour le moment, réessayez dans une minute (' + String(e.message).slice(0, 120) + ')');
      await pause(800 * (essai + 1));
    }
  }
  const res = [...listeDe(premiere)];
  const pas = res.length;                       // taille réelle d'une page
  if (!pas || Array.isArray(premiere)) return res;
  const total = Number(premiere.Hitcount) || 0;
  if (total > pas) {
    const offsets = [];
    for (let o = pas; o < Math.min(total, MAX_LIGNES); o += pas) offsets.push(o);
    for (let i = 0; i < offsets.length; i += 4) {
      const lots = await Promise.all(offsets.slice(i, i + 4).map(o => pageAvecEssais(filtres, o, TAILLE)));
      lots.forEach(l => res.push(...l));
    }
  } else if (premiere.HasMoreRows) {
    // pas de total connu : on avance page par page tant qu'il en reste
    let offset = pas;
    for (let i = 0; i < 600 && offset < MAX_LIGNES; i++) {
      const data = await ximi.get('api/interventions/all', {
        ...filtres, 'request.offset': offset, 'request.top': TAILLE, 'request.computeHasMoreRows': 'true' });
      const page = listeDe(data);
      res.push(...page);
      if (!data.HasMoreRows || !page.length) break;
      offset += page.length;
    }
  }
  const vus = new Set();
  return res.filter(it => { const k = it.Id; if (k == null) return true; if (vus.has(k)) return false; vus.add(k); return true; });
}

// Stratégie principale : recherche texte (request.search) sur le nom de l'intervenant,
// toutes dates confondues, puis tri local par intervenant et par mois.
let strategie = '';
async function interventionsParRecherche(agent, debutMois, finMois) {
  const termes = [...new Set([
    String(agent.LastName || '').trim(),
    `${agent.FirstName || ''} ${agent.LastName || ''}`.trim(),
    `${agent.LastName || ''} ${agent.FirstName || ''}`.trim(),
  ].filter(Boolean))];
  for (const terme of termes) {
    const res = await toutesLesPages({ 'request.search': terme });
    const siennes = res.filter(it => String(((it.Agent || {}).Id) || it.AgentId || '') === String(agent.Id));
    const duMois = siennes.filter(it => { const d = debutDe(it).slice(0, 10); return d >= debutMois && d < finMois; });
    essais.push({ format: `recherche « ${terme} »`, resultats: res.length, de_l_intervenant: siennes.length,
      dans_la_periode: duMois.length, jours: new Set(duMois.map(it => debutDe(it).slice(0, 10))).size });
    if (duMois.length) { strategie = `recherche « ${terme} »`; return duMois; }
    if (!echantillon && res.length) echantillon = res[0];
  }
  return [];
}

async function interventionsDuMois(mois, agent) {
  const [y, m] = mois.split('-').map(Number);
  const debutM = `${mois}-01`;
  const finM = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  essais = [];
  pagesPerdues = 0;
  if (agent) {
    const parRecherche = await interventionsParRecherche(agent, debutM, finM);
    if (parRecherche.length) return parRecherche;
  }
  const nbJours = new Date(y, m, 0).getDate();
  const debutMois = `${mois}-01`;
  const finMois = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const choix = await choisirFormat(debutMois, finMois);
  if (!choix) return [];
  const bornes = [];
  for (let d = 1; d <= nbJours; d += 7) {
    bornes.push([new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10),
                 new Date(Date.UTC(y, m - 1, Math.min(d + 7, nbJours + 1))).toISOString().slice(0, 10)]);
  }
  const morceaux = await Promise.all(bornes.map(async ([debut, fin]) => {
    const res = [];
    let offset = 0;
    for (let i = 0; i < 30; i++) {
      const data = await ximi.get('api/interventions/all', { ...choix.f.p(debut, fin), ...choix.pg(offset, 500) });
      const page = listeDe(data);
      res.push(...page);
      if (Array.isArray(data) || !data.HasMoreRows || !page.length) break;
      offset += page.length;
    }
    return res;
  }));
  const vus = new Set();
  return morceaux.flat()
    .filter(it => { const d = debutDe(it).slice(0, 10); return d >= debutMois && d < finMois; }) // filtre de sécurité
    .filter(it => { const k = it.Id || JSON.stringify(it); if (vus.has(k)) return false; vus.add(k); return true; });
}

async function trajets(q) {
  const { geocodeStrict, routeDistanceKm } = require('../lib/geo');
  const salarie = String(q.salarie || '').trim();
  const mois = String(q.mois || '').trim();
  if (!salarie || !/^\d{4}-\d{2}$/.test(mois)) throw new Error('Paramètres salarie et mois (AAAA-MM) requis');

  // 1) L'intervenant dans Ximi
  const agents = await ximi.getAll('api/agents');
  const cle = sansAccents(salarie);
  const mots = cle.split(' ').filter(Boolean);
  const trouves = agents.filter(a => {
    const n1 = sansAccents(`${a.FirstName || ''} ${a.LastName || ''}`);
    const n2 = sansAccents(`${a.LastName || ''} ${a.FirstName || ''}`);
    if (n1 === cle || n2 === cle) return true;
    return mots.length && mots.every(w => n1.split(' ').includes(w));
  });
  if (!trouves.length) return { erreur: `Aucun intervenant « ${salarie} » trouvé dans Ximi. Écrivez le nom comme dans Ximi (ex. Prénom Nom).` };
  if (trouves.length > 1) {
    return { erreur: 'Plusieurs intervenants correspondent, précisez le prénom et le nom : ' +
      trouves.slice(0, 6).map(a => `${a.FirstName || ''} ${a.LastName || ''}`.trim()).join(', ') };
  }
  const agent = trouves[0];

  // 2) Domicile : adresse Ximi de l'intervenant, sinon celle saisie dans l'app
  let domicile = coordsAdresse(agent.Address);
  if (!domicile) {
    try { const detail = await ximi.get(`api/agents/${agent.Id}`); domicile = coordsAdresse(detail.Address); } catch (e) { /* ignoré */ }
  }
  if (!domicile && q.domicile) {
    const x = Number(q.dlon), y = Number(q.dlat);
    domicile = Number.isFinite(x) && Number.isFinite(y) ? { lon: x, lat: y, label: q.domicile, warning: null }
      : await geocodeStrict(q.domicile);
  }
  if (!domicile) return { erreur: "Adresse du domicile introuvable (ni dans Ximi, ni dans l'app) : renseignez-la dans « Adresse du domicile »." };

  // 3) Interventions du mois de cet intervenant (hors annulées)
  const toutes = await interventionsDuMois(mois, agent);
  const estSienne = (it) => {
    const ids = [idDe(it, 'AgentId', 'Agent.Id', 'ResourceId', 'Resource.Id')]
      .concat((it.AgentIds || []), (it.Agents || []).map(a => a && (a.Id || a.AgentId)));
    return ids.some(x => x != null && String(x) === String(agent.Id));
  };
  const siennes = toutes.filter(estSienne)
    .filter(it => !/cancel|annul|-100/i.test(String(it.Status ?? '')));

  // 4) Par jour : 1re et dernière intervention
  const parJour = {};
  siennes.forEach(it => {
    const debut = debutDe(it);
    if (!debut) return;
    const jour = String(debut).slice(0, 10);
    (parJour[jour] = parJour[jour] || []).push(it);
  });
  const cacheClients = {};
  async function adresseIntervention(it) {
    const directe = coordsAdresse(it.StartAddress || it.Address || it.InterventionAddress || (it.Client || {}).Address);
    if (directe) return directe;
    const cid = idDe(it, 'ClientId', 'Client.Id');
    if (!cid) return null;
    if (!(cid in cacheClients)) {
      try { cacheClients[cid] = coordsAdresse((await ximi.get(`api/clients/${cid}`)).Address); } catch (e) { cacheClients[cid] = null; }
    }
    return cacheClients[cid];
  }

  const jours = Object.keys(parJour).sort();
  const legs = [], avertissements = [];
  for (const jour of jours) {
    const liste = parJour[jour].sort((a, b) => debutDe(a).localeCompare(debutDe(b)));
    const [premier, dernier] = [liste[0], liste[liste.length - 1]];
    const [aPremier, aDernier] = await Promise.all([adresseIntervention(premier), adresseIntervention(dernier)]);
    if (!aPremier || !aDernier) { avertissements.push(`${jour} : adresse client introuvable dans Ximi`); continue; }
    legs.push({ date: jour, from: domicile, to: aPremier, sens: 'aller' });
    legs.push({ date: jour, from: aDernier, to: domicile, sens: 'retour' });
  }

  // 5) Kilomètres (même calcul que le bouton « Calculer »), 4 à la fois
  const resultat = [];
  for (let i = 0; i < legs.length; i += 4) {
    const lot = await Promise.all(legs.slice(i, i + 4).map(async l => {
      try {
        const { km } = await routeDistanceKm(l.from, l.to);
        return { date: l.date, sens: l.sens, depart: l.from.label, arrivee: l.to.label, km: Math.round(km * 10) / 10 };
      } catch (e) {
        avertissements.push(`${l.date} (${l.sens}) : distance non calculée`);
        return null;
      }
    }));
    resultat.push(...lot.filter(Boolean));
  }
  if (pagesPerdues) avertissements.unshift(`Ximi n'a pas répondu pour une partie du planning (${pagesPerdues} paquet(s)) : certains jours peuvent manquer, relancez l'import dans une minute.`);
  const retour = {
    intervenant: `${agent.FirstName || ''} ${agent.LastName || ''}`.trim(),
    domicile: domicile.label, nb_interventions: siennes.length, trajets: resultat, avertissements,
  };
  if (q.debug) retour.debug = {
    total_interventions_mois: toutes.length,
    format_retenu: strategie || (formatRetenu ? formatRetenu.f.nom : 'aucun'),
    essais,
    exemple_intervention: (toutes[0] || echantillon) ? formeAvecDates(toutes[0] || echantillon) : null,
  };
  return retour;
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
    if (req.query.action === 'trajets') {
      res.status(200).json(await trajets(req.query));
      return;
    }
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
