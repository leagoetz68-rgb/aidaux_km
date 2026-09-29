// Km effectués pour le compte d'un bénéficiaire.
// Une "feuille" = un salarié + un mois + un bénéficiaire. Le bénéficiaire (ou son
// représentant) signe la feuille en fin de mois ; une fois signée, elle est
// verrouillée : plus d'ajout ni de suppression de trajet, sauf déverrouillage
// par la direction (connectée).
//
// GET    ?salarie=&mois=              -> trajets + signatures du salarié pour le mois
// GET    ?mois=&token=                -> (direction) toutes les feuilles du mois
// POST   { action:'add', ... }        -> ajoute un trajet (et son retour si demandé)
// POST   { action:'sign', ... }       -> enregistre la signature et verrouille la feuille
// POST   { action:'unlock', token, salarie, mois, beneficiaire } -> (direction) retire la signature
// DELETE ?id=                         -> supprime un trajet (refusé si la feuille est signée)

const { getPool, ensureSchema, makeId } = require('../lib/db');
const { verifyToken } = require('../lib/sessionToken');

const MAX_SIGNATURE_LENGTH = 400000; // ~300 Ko d'image, largement suffisant

function clean(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}

function tokenEmail(token) {
  try { return verifyToken(token); } catch (e) { return null; }
}

async function getSignature(pool, salarie, mois, beneficiaire) {
  const { rows } = await pool.query(
    `SELECT signataire, signe_le FROM frais_km_benef_signatures
     WHERE salarie = $1 AND mois = $2 AND beneficiaire = $3`,
    [salarie, mois, beneficiaire]
  );
  return rows[0] || null;
}

module.exports = async (req, res) => {
  let pool;
  try {
    pool = getPool();
    await ensureSchema(pool);
  } catch (e) {
    res.status(500).json({ error: 'Erreur base de données : ' + e.message });
    return;
  }

  try {
    // ---------- Lecture ----------
    if (req.method === 'GET') {
      const mois = clean(req.query.mois);
      const salarie = clean(req.query.salarie);
      const token = req.query.token;

      if (!mois) { res.status(400).json({ error: 'Paramètre mois requis' }); return; }

      let where, params;
      if (token) {
        // Vue direction : toutes les feuilles du mois
        if (!tokenEmail(token)) { res.status(401).json({ error: 'Session invalide ou expirée' }); return; }
        where = 'mois = $1'; params = [mois];
      } else {
        if (!salarie) { res.status(400).json({ error: 'Paramètre salarie requis' }); return; }
        where = 'salarie = $1 AND mois = $2'; params = [salarie, mois];
      }

      const trajets = await pool.query(
        `SELECT id, salarie, beneficiaire, date::text AS date, depart, arrivee, km::float AS km
         FROM frais_km_benef_trajets WHERE ${where}
         ORDER BY salarie, beneficiaire, date, id`,
        params
      );
      const signatures = await pool.query(
        `SELECT salarie, beneficiaire, signataire, signature, km_total::float AS km_total,
                nb_trajets, signe_le
         FROM frais_km_benef_signatures WHERE ${where}`,
        params
      );
      res.status(200).json({ trajets: trajets.rows, signatures: signatures.rows });
      return;
    }

    // ---------- Suppression d'un trajet ----------
    if (req.method === 'DELETE') {
      const id = req.query.id;
      if (!id) { res.status(400).json({ error: 'Paramètre id requis' }); return; }
      const { rows } = await pool.query(
        'SELECT salarie, mois, beneficiaire FROM frais_km_benef_trajets WHERE id = $1', [id]
      );
      if (!rows[0]) { res.status(200).json({ ok: true }); return; }
      const t = rows[0];
      if (await getSignature(pool, t.salarie, t.mois, t.beneficiaire)) {
        res.status(409).json({ error: 'Cette feuille est déjà signée par le bénéficiaire, elle ne peut plus être modifiée.' });
        return;
      }
      await pool.query('DELETE FROM frais_km_benef_trajets WHERE id = $1', [id]);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }

    const body = req.body || {};
    const action = body.action;
    const salarie = clean(body.salarie);
    const mois = clean(body.mois);
    const beneficiaire = clean(body.beneficiaire);

    if (!salarie || !/^\d{4}-\d{2}$/.test(mois) || !beneficiaire) {
      res.status(400).json({ error: 'Salarié, mois et bénéficiaire sont requis' });
      return;
    }

    // ---------- Ajout d'un trajet ----------
    if (action === 'add') {
      const date = clean(body.date);
      const depart = clean(body.depart);
      const arrivee = clean(body.arrivee);
      const km = Number(body.km);
      if (!date || !depart || !arrivee || isNaN(km) || km <= 0) {
        res.status(400).json({ error: 'Champs manquants ou invalides' });
        return;
      }
      if (date.slice(0, 7) !== mois) {
        res.status(400).json({ error: 'La date du trajet doit être dans le mois concerné' });
        return;
      }
      if (await getSignature(pool, salarie, mois, beneficiaire)) {
        res.status(409).json({ error: 'La feuille de ce bénéficiaire est déjà signée pour ce mois.' });
        return;
      }
      const legs = [{ depart, arrivee }];
      if (body.retour) legs.push({ depart: arrivee, arrivee: depart });
      for (const leg of legs) {
        await pool.query(
          `INSERT INTO frais_km_benef_trajets (id, salarie, mois, beneficiaire, date, depart, arrivee, km)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [makeId(), salarie, mois, beneficiaire, date, leg.depart, leg.arrivee, km]
        );
      }
      res.status(201).json({ inserted: legs.length });
      return;
    }

    // ---------- Signature du bénéficiaire ----------
    if (action === 'sign') {
      const signataire = clean(body.signataire);
      const signature = String(body.signature || '');
      if (!signataire) { res.status(400).json({ error: 'Nom du signataire requis' }); return; }
      if (!signature.startsWith('data:image/png;base64,') || signature.length > MAX_SIGNATURE_LENGTH) {
        res.status(400).json({ error: 'Signature invalide' });
        return;
      }
      if (await getSignature(pool, salarie, mois, beneficiaire)) {
        res.status(409).json({ error: 'Cette feuille est déjà signée.' });
        return;
      }
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n, COALESCE(SUM(km),0)::float AS km
         FROM frais_km_benef_trajets WHERE salarie = $1 AND mois = $2 AND beneficiaire = $3`,
        [salarie, mois, beneficiaire]
      );
      if (!rows[0] || rows[0].n === 0) {
        res.status(400).json({ error: 'Aucun trajet à signer pour ce bénéficiaire.' });
        return;
      }
      await pool.query(
        `INSERT INTO frais_km_benef_signatures
           (salarie, mois, beneficiaire, signataire, signature, km_total, nb_trajets)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [salarie, mois, beneficiaire, signataire, signature, Math.round(rows[0].km * 10) / 10, rows[0].n]
      );
      res.status(201).json({ ok: true });
      return;
    }

    // ---------- Déverrouillage (direction) ----------
    if (action === 'unlock') {
      if (!tokenEmail(body.token)) { res.status(401).json({ error: 'Session invalide ou expirée' }); return; }
      await pool.query(
        'DELETE FROM frais_km_benef_signatures WHERE salarie = $1 AND mois = $2 AND beneficiaire = $3',
        [salarie, mois, beneficiaire]
      );
      res.status(200).json({ ok: true });
      return;
    }

    res.status(400).json({ error: 'Action inconnue' });
  } catch (e) {
    console.error('api/beneficiaires', e);
    res.status(500).json({ error: 'Erreur serveur : ' + e.message });
  }
};
