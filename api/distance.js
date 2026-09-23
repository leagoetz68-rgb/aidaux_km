// Calcule la distance routière (km) entre deux adresses.
// Le front envoie de préférence les coordonnées de l'adresse choisie dans
// les suggestions (dlon/dlat, alon/alat) ; sinon on géocode le texte côté
// serveur, en refusant les correspondances vagues ou incertaines.

const { geocodeStrict, routeDistanceKm } = require("../lib/geo");

function coordsFromQuery(lon, lat, label) {
  const x = Number(lon), y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  // Garde-fou : on reste en France métropolitaine.
  if (x < -5.5 || x > 10 || y < 41 || y > 51.5) return null;
  return { lon: x, lat: y, label, warning: null };
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const { depart, arrivee, dlon, dlat, alon, alat } = req.query;
  if (!depart || !arrivee) {
    res.status(400).json({ error: "Paramètres depart et arrivee requis" });
    return;
  }

  try {
    const [from, to] = await Promise.all([
      coordsFromQuery(dlon, dlat, depart) || geocodeStrict(depart),
      coordsFromQuery(alon, alat, arrivee) || geocodeStrict(arrivee),
    ]);
    const { km, source } = await routeDistanceKm(from, to);
    res.status(200).json({
      km: Math.round(km * 10) / 10,
      source,
      depart: from.label,
      arrivee: to.label,
      warnings: [from.warning, to.warning].filter(Boolean),
    });
  } catch (e) {
    console.error("Erreur calcul distance:", e.message);
    res.status(422).json({ error: e.message || "Calcul de distance impossible" });
  }
};
