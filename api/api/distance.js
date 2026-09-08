// Calcule la distance routière (en km, itinéraire le plus rapide) entre
// deux adresses, via l'API OpenRouteService (hébergée par HeiGIT).
// Deux étapes : geocoder chaque adresse en coordonnées (Pelias), puis
// demander l'itinéraire routier entre ces deux points (Directions).

const GEOCODE_URL = "https://api.heigit.org/pelias/v1/search";
const DIRECTIONS_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car";

// Point de référence pour aider le géocodeur à privilégier les résultats
// de la région (Strasbourg / Eurométropole) en cas d'adresse ambiguë.
const FOCUS_LAT = 48.5734;
const FOCUS_LON = 7.7521;

async function geocode(text, apiKey) {
  const url = `${GEOCODE_URL}?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(text)}&size=1&focus.point.lat=${FOCUS_LAT}&focus.point.lon=${FOCUS_LON}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Géocodage impossible (${res.status})`);
  }
  const data = await res.json();
  const feature = data.features && data.features[0];
  if (!feature) {
    throw new Error(`Adresse introuvable : ${text}`);
  }
  return feature.geometry.coordinates; // [lon, lat]
}

async function directionsDistanceKm(coordDepart, coordArrivee, apiKey) {
  const res = await fetch(DIRECTIONS_URL, {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      coordinates: [coordDepart, coordArrivee],
      preference: "fastest",
    }),
  });
  if (!res.ok) {
    throw new Error(`Calcul d'itinéraire impossible (${res.status})`);
  }
  const data = await res.json();
  const meters = data.routes && data.routes[0] && data.routes[0].summary && data.routes[0].summary.distance;
  if (typeof meters !== "number") {
    throw new Error("Réponse d'itinéraire invalide");
  }
  return meters / 1000;
}

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Méthode non autorisée" });
    return;
  }

  const { depart, arrivee } = req.query;
  if (!depart || !arrivee) {
    res.status(400).json({ error: "Paramètres depart et arrivee requis" });
    return;
  }

  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Clé ORS_API_KEY manquante côté serveur" });
    return;
  }

  try {
    const [coordDepart, coordArrivee] = await Promise.all([
      geocode(depart, apiKey),
      geocode(arrivee, apiKey),
    ]);
    const km = await directionsDistanceKm(coordDepart, coordArrivee, apiKey);
    res.status(200).json({ km: Math.round(km * 10) / 10 });
  } catch (e) {
    res.status(502).json({ error: e.message || "Calcul de distance impossible" });
  }
};
