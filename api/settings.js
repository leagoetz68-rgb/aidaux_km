const { getPool, ensureSchema } = require('../lib/db');

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
    const { salarie } = req.query;
    if (!salarie) {
      res.status(400).json({ error: 'Paramètre salarie requis' });
      return;
    }
    try {
      const { rows } = await pool.query(
        'SELECT salarie, domicile FROM frais_km_settings WHERE salarie = $1',
        [salarie]
      );
      res.status(200).json(rows[0] || null);
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method === 'POST') {
    const { salarie, domicile } = req.body || {};
    if (!salarie) {
      res.status(400).json({ error: 'Nom du salarié requis' });
      return;
    }
    try {
      await pool.query(
        `INSERT INTO frais_km_settings (salarie, domicile) VALUES ($1, $2)
         ON CONFLICT (salarie) DO UPDATE SET domicile = EXCLUDED.domicile`,
        [salarie, domicile || '']
      );
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  res.status(405).json({ error: 'Méthode non autorisée' });
};
