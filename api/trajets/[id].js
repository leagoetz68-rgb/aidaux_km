const { getPool, ensureSchema } = require('../../lib/db');

module.exports = async (req, res) => {
  if (req.method !== 'DELETE') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  const { id } = req.query;
  try {
    const pool = getPool();
    await ensureSchema(pool);
    await pool.query('DELETE FROM frais_km_trajets WHERE id = $1', [id]);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
