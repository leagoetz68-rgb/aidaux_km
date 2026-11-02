const { getPool, ensureSchema } = require('../lib/db');
const { verifyToken } = require('../lib/sessionToken');
const { ajouterClesTri } = require('../lib/triNoms');

function calcForfait(km) {
  if (km <= 20.99) return 2;
  if (km <= 40.99) return 4;
  return 6;
}

// Message lisible même quand l'erreur n'a pas de texte (ex. connexion BDD refusée)
function describeError(e) {
  if (!e) return 'inconnue';
  const parts = [];
  if (e.message) parts.push(e.message);
  if (e.code) parts.push('code ' + e.code);
  if (Array.isArray(e.errors)) {
    e.errors.forEach(sub => parts.push((sub.code || '') + ' ' + (sub.message || '')));
  }
  return parts.join(' — ') || String(e) || 'inconnue';
}

// DELETE ?mois=&salarie=&token= -> (direction) supprime tout le mois d'un salarié :
// trajets domicile, trajets bénéficiaires et signatures. Les autres mois ne sont pas touchés.
async function supprimerSalarieMois(req, res) {
  const { mois, salarie, token } = req.query;
  let email;
  try { email = verifyToken(token); } catch (e) { email = null; }
  if (!email) { res.status(401).json({ error: 'Session invalide ou expirée' }); return; }
  if (!mois || !salarie) { res.status(400).json({ error: 'Paramètres mois et salarie requis' }); return; }

  const pool = getPool();
  await ensureSchema(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const t = await client.query('DELETE FROM frais_km_trajets WHERE salarie = $1 AND mois = $2', [salarie, mois]);
    const b = await client.query('DELETE FROM frais_km_benef_trajets WHERE salarie = $1 AND mois = $2', [salarie, mois]);
    await client.query('DELETE FROM frais_km_benef_signatures WHERE salarie = $1 AND mois = $2', [salarie, mois]);
    await client.query('COMMIT');
    console.log(`Suppression ${salarie} / ${mois} par ${email} : ${t.rowCount} trajets, ${b.rowCount} trajets bénéf.`);
    res.status(200).json({ ok: true, trajets: t.rowCount, trajetsBenef: b.rowCount });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('api/salaries DELETE', e);
    res.status(500).json({ error: 'Erreur serveur : ' + describeError(e) });
  } finally {
    client.release();
  }
}

module.exports = async (req, res) => {
  if (req.method === 'DELETE') {
    try { await supprimerSalarieMois(req, res); }
    catch (e) { res.status(500).json({ error: 'Erreur serveur : ' + describeError(e) }); }
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const { mois, token } = req.query;

  let email;
  try {
    email = verifyToken(token);
  } catch (e) {
    email = null;
  }
  if (!email) {
    res.status(401).json({ error: 'Session invalide ou expirée' });
    return;
  }
  if (!mois) {
    res.status(400).json({ error: 'Paramètre mois requis' });
    return;
  }

  try {
    const pool = getPool();
    await ensureSchema(pool);
    const { rows } = await pool.query(
      `SELECT salarie, date::text as date, km::float as km
       FROM frais_km_trajets
       WHERE mois = $1
       ORDER BY salarie, date`,
      [mois]
    );

    const bySalarie = {};
    rows.forEach(r => {
      if (!bySalarie[r.salarie]) bySalarie[r.salarie] = {};
      const dayMap = bySalarie[r.salarie];
      dayMap[r.date] = (dayMap[r.date] || 0) + Number(r.km);
    });

    const result = Object.keys(bySalarie).sort((a, b) => a.localeCompare(b)).map(salarie => {
      const days = bySalarie[salarie];
      let totalKm = 0;
      let totalForfait = 0;
      Object.values(days).forEach(dayKm => {
        totalKm += dayKm;
        totalForfait += calcForfait(dayKm);
      });
      return {
        salarie,
        jours: Object.keys(days).length,
        km: Math.round(totalKm * 10) / 10,
        forfait: Math.round(totalForfait * 100) / 100,
      };
    });

    await ajouterClesTri(pool, result); // ordre alphabétique des noms de famille
    res.status(200).json(result);
  } catch (e) {
    console.error('api/salaries', e);
    res.status(500).json({ error: 'Erreur serveur : ' + describeError(e) });
  }
};
