// Suggestions d'adresses pour l'autocomplétion (Base Adresse Nationale).
const { searchAddresses } = require("../lib/geo");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }
  const q = String(req.query.q || "");
  if (q.trim().length < 3) {
    res.status(200).json([]);
    return;
  }
  try {
    const results = await searchAddresses(q, { limit: 6, autocomplete: true });
    // Les communes seules ne servent à rien pour un calcul de km précis.
    const useful = results.filter(r => r.type === "housenumber" || r.type === "street");
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(useful);
  } catch (e) {
    console.error("Erreur autocomplétion:", e.message);
    res.status(502).json({ error: e.message });
  }
};
