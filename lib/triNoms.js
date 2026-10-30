// Tri des salariés par NOM DE FAMILLE.
// Les salariés tapent leur nom librement (« Alain Maurice », « Cadoni Laura »,
// « Laura Neuburger »…), donc on ne sait pas quel mot est le nom de famille.
// On s'appuie sur la liste de la pré-paie (même base), où les noms sont
// toujours écrits « NOM Prénom » : on retrouve le salarié par ses mots, et on
// trie selon l'ordre de la pré-paie.

let cache = { at: 0, refs: [] };

function mots(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

async function chargerReferences(pool) {
  if (Date.now() - cache.at < 10 * 60 * 1000) return cache.refs;
  let refs = [];
  try {
    const { rows } = await pool.query(
      `SELECT DISTINCT elem->>'nom' AS nom
         FROM prepaie_sheets, jsonb_array_elements(data) elem
        WHERE coalesce(elem->>'nom', '') <> ''`
    );
    refs = rows.map(r => mots(r.nom)).filter(m => m.length);
  } catch (e) {
    refs = []; // pas de pré-paie dans cette base : tri simple
  }
  cache = { at: Date.now(), refs };
  return refs;
}

// Clé de tri « nom prénom » pour un nom tapé librement.
function cleTri(nom, refs) {
  const w = mots(nom);
  if (!w.length) return '';
  // 1. salarié de la pré-paie qui contient tous les mots tapés
  const complets = refs.filter(r => w.every(x => r.includes(x)));
  if (complets.length) {
    complets.sort((a, b) => a.length - b.length);
    return complets[0].join(' ');
  }
  // 2. sinon : un des mots tapés est un nom de famille connu (faute de frappe sur le prénom)
  const noms = new Set(refs.map(r => r[0]));
  const nomFamille = w.find(x => noms.has(x));
  if (nomFamille) return [nomFamille].concat(w.filter(x => x !== nomFamille)).join(' ');
  // 3. inconnu : tel que tapé
  return w.join(' ');
}

async function ajouterClesTri(pool, liste) {
  const refs = await chargerReferences(pool);
  liste.forEach(item => { item.cleTri = cleTri(item.salarie, refs); });
  liste.sort((a, b) => a.cleTri.localeCompare(b.cleTri, 'fr') || a.salarie.localeCompare(b.salarie, 'fr'));
  return liste;
}

module.exports = { ajouterClesTri, cleTri, mots };
