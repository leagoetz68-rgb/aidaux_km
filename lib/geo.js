
// Plafond mensuel des calculs Google (Routes API).
// Google offre 10 000 calculs gratuits par mois (remis à zéro le 1er du mois
// à minuit, heure du Pacifique). On compte chaque appel dans la base et on
// s'arrête à GOOGLE_MONTHLY_LIMIT (9 999 par défaut) : au-delà, le calcul
// passe automatiquement par l'IGN (gratuit) jusqu'au mois suivant.

const { getPool } = require("./db");

const LIMIT = Number(process.env.GOOGLE_MONTHLY_LIMIT) > 0
  ? Math.floor(Number(process.env.GOOGLE_MONTHLY_LIMIT))
  : 9999;

// Mois en cours selon l'heure du Pacifique (comme la facturation Google).
function moisGoogle() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  return `${y}-${m}`;
}

let tableReady = false;
async function ensureTable(pool) {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS frais_km_google_usage (
      mois TEXT PRIMARY KEY,
      nb INTEGER NOT NULL DEFAULT 0
    );
  `);
  tableReady = true;
}

// Réserve un calcul Google. Renvoie true si on est sous le plafond (le
// compteur est alors incrémenté), false si le plafond est atteint.
// Opération atomique : même avec plusieurs calculs simultanés, on ne peut
// pas dépasser le plafond. En cas de souci de base, on refuse Google par
// prudence (pas de risque de facturation).
async function reserverAppelGoogle() {
  try {
    const pool = getPool();
    await ensureTable(pool);
    const mois = moisGoogle();
    await pool.query(
      `INSERT INTO frais_km_google_usage (mois, nb) VALUES ($1, 0)
       ON CONFLICT (mois) DO NOTHING`,
      [mois]
    );
    const { rows } = await pool.query(
      `UPDATE frais_km_google_usage SET nb = nb + 1
       WHERE mois = $1 AND nb < $2
       RETURNING nb`,
      [mois, LIMIT]
    );
    return rows.length > 0;
  } catch (e) {
    console.error("Compteur Google indisponible, repli sur l'IGN :", e.message);
    return false;
  }
}

module.exports = { reserverAppelGoogle, moisGoogle, LIMIT };
