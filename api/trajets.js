const { getPool, ensureSchema, makeId } = require('../lib/db');

module.exports = async (req, res) => {
  let pool;
  try {
    pool = getPool();
    await ensureSchema(pool);
  } catch (e) {
    res.status(500).json({ error: 'Erreur base de données : ' + e.message });
    return;
  }

  if (req.method === 'GET') {
    const { salarie, mois } = req.query;
    if (!salarie || !mois) {
      res.status(400).json({ error: 'Paramètres salarie et mois requis' });
      return;
    }
    try {
      const { rows } = await pool.query(
        `SELECT id, date::text as date, depart, arrivee, km::float as km
         FROM frais_km_trajets
         WHERE salarie = $1 AND mois = $2
         ORDER BY date ASC`,
        [salarie, mois]
      );
      res.status(200).json(rows);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const { salarie, mois, date, depart, arrivee, km, retour } = req.body || {};
    const kmNum = Number(km);
    if (!salarie || !mois || !date || !depart || !arrivee || isNaN(kmNum) || kmNum <= 0) {
      res.status(400).json({ error: 'Champs manquants ou invalides' });
      return;
    }
    const rowsToInsert = [{ id: makeId(), depart, arrivee, km: kmNum }];
    if (retour) {
      rowsToInsert.push({ id: makeId(), depart: arrivee, arrivee: depart, km: kmNum });
    }
    try {
      for (const r of rowsToInsert) {
        await pool.query(
          `INSERT INTO frais_km_trajets (id, salarie, mois, date, depart, arrivee, km)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [r.id, salarie, mois, date, r.depart, r.arrivee, r.km]
        );
      }
      res.status(201).json({ inserted: rowsToInsert.length });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'DELETE') {
    const { salarie, mois } = req.query;
    if (!salarie || !mois) {
      res.status(400).json({ error: 'Paramètres salarie et mois requis pour réinitialiser le mois' });
      return;
    }
    try {
      await pool.query('DELETE FROM frais_km_trajets WHERE salarie = $1 AND mois = $2', [salarie, mois]);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
};
