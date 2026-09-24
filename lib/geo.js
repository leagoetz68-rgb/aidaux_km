// Géocodage et calcul d'itinéraire via les services publics de la
// Géoplateforme (IGN) — gratuits, sans clé, données officielles françaises :
//  - Géocodage : Base Adresse Nationale (BAN), précise au numéro de rue
//  - Itinéraire : réseau routier BD TOPO (moteur OSRM)
// Si GOOGLE_MAPS_API_KEY est défini, l'itinéraire est calculé par Google
// (Routes API) pour coller au kilométrage affiché par Google Maps ; l'IGN
// sert alors de secours. OpenRouteService reste un dernier secours si
// ORS_API_KEY est défini.

const { reserverAppelGoogle } = require("./googleQuota");

const GEOCODE_URL = "https://data.geopf.fr/geocodage/search";
const IGN_ROUTE_URL = "https://data.geopf.fr/navigation/itineraire";
const GOOGLE_ROUTE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const ORS_ROUTE_URL = "https://api.heigit.org/openrouteservice/v2/directions/driving-car";

// Centre de gravité de l'activité (Strasbourg) : sert à départager les
// adresses homonymes (ex. « rue de la Gare » existe dans des centaines de communes).
const FOCUS_LAT = 48.5734;
const FOCUS_LON = 7.7521;

// En dessous de ce score BAN (0 à 1), la correspondance est trop incertaine
// pour être utilisée sans que le salarié confirme l'adresse.
const MIN_SCORE = 0.5;

// "fastest" = itinéraire conseillé type Google Maps / Mappy (celui que les
// salariés vérifient en général). "shortest" = strict plus court en km.
const ROUTE_OPTIMIZATION = process.env.ROUTE_OPTIMIZATION === "shortest" ? "shortest" : "fastest";

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`Délai dépassé (${FETCH_TIMEOUT_MS / 1000}s)`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// Nettoyage léger de la saisie : espaces multiples, virgules parasites.
function cleanAddress(text) {
  return String(text || "").replace(/\s+/g, " ").replace(/\s*,\s*/g, " ").trim();
}

function toCandidate(feature) {
  const p = feature.properties || {};
  const [lon, lat] = feature.geometry.coordinates;
  return {
    label: p.label,
    lon,
    lat,
    score: typeof p.score === "number" ? p.score : 0,
    type: p.type, // housenumber | street | locality | municipality
  };
}

// Recherche d'adresses (utilisée par l'autocomplétion et par le calcul).
async function searchAddresses(text, { limit = 5, autocomplete = false } = {}) {
  const q = cleanAddress(text);
  if (q.length < 3) return [];
  const params = new URLSearchParams({
    q,
    limit: String(limit),
    lat: String(FOCUS_LAT),
    lon: String(FOCUS_LON),
    autocomplete: autocomplete ? "1" : "0",
  });
  const res = await fetchWithTimeout(`${GEOCODE_URL}?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Service d'adresses indisponible (${res.status}) ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return (data.features || []).map(toCandidate);
}

// Transforme une adresse saisie en un point fiable, ou lève une erreur
// explicite plutôt que de renvoyer silencieusement un mauvais point
// (ex. le centre de la commune au lieu du domicile).
async function geocodeStrict(text) {
  const candidates = await searchAddresses(text, { limit: 5 });
  const best = candidates[0];
  if (!best) {
    throw new Error(`Adresse introuvable : « ${text} »`);
  }
  if (best.type === "municipality" || best.type === "locality") {
    throw new Error(
      `Adresse trop vague : seule la commune/le lieu-dit a été reconnu (« ${best.label} »). Précisez le numéro et la rue.`
    );
  }
  if (best.score < MIN_SCORE) {
    throw new Error(
      `Adresse incertaine : « ${text} » ressemble à « ${best.label} ». Choisissez l'adresse dans la liste de suggestions.`
    );
  }
  return {
    ...best,
    warning: best.type === "street" ? `numéro non trouvé pour « ${best.label} », calcul depuis la rue` : null,
  };
}

async function routeIgn(from, to) {
  const params = new URLSearchParams({
    resource: "bdtopo-osrm",
    profile: "car",
    optimization: ROUTE_OPTIMIZATION,
    start: `${from.lon},${from.lat}`,
    end: `${to.lon},${to.lat}`,
    distanceUnit: "meter",
    getSteps: "false",
    geometryFormat: "polyline",
  });
  const res = await fetchWithTimeout(`${IGN_ROUTE_URL}?${params}`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Itinéraire IGN impossible (${res.status}) ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const meters = Number(data.distance);
  if (!Number.isFinite(meters)) throw new Error("Réponse d'itinéraire IGN invalide");
  return meters / 1000;
}

async function routeOrs(from, to, apiKey) {
  const res = await fetchWithTimeout(ORS_ROUTE_URL, {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      coordinates: [[from.lon, from.lat], [to.lon, to.lat]],
      preference: ROUTE_OPTIMIZATION === "shortest" ? "shortest" : "recommended",
    }),
  });
  if (!res.ok) throw new Error(`Itinéraire ORS impossible (${res.status})`);
  const data = await res.json();
  const meters = data.routes && data.routes[0] && data.routes[0].summary && data.routes[0].summary.distance;
  if (typeof meters !== "number") throw new Error("Réponse d'itinéraire ORS invalide");
  return meters / 1000;
}

// Google Routes API, niveau "Essentials" (sans trafic temps réel) : c'est la
// formule la moins chère et le résultat ne change pas selon l'heure du calcul.
// On envoie l'adresse BAN validée : Google la place lui-même comme dans Maps.
async function routeGoogle(from, to, apiKey) {
  const waypoint = (p) => (p.label ? { address: p.label } : { location: { latLng: { latitude: p.lat, longitude: p.lon } } });
  const res = await fetchWithTimeout(GOOGLE_ROUTE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "routes.distanceMeters",
    },
    body: JSON.stringify({
      origin: waypoint(from),
      destination: waypoint(to),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      regionCode: "FR",
      languageCode: "fr-FR",
      units: "METRIC",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Itinéraire Google impossible (${res.status}) ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const meters = data.routes && data.routes[0] && data.routes[0].distanceMeters;
  if (typeof meters !== "number") throw new Error("Réponse d'itinéraire Google invalide");
  return meters / 1000;
}

async function routeDistanceKm(from, to) {
  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  // Google seulement tant que le plafond mensuel (9 999) n'est pas atteint.
  if (googleKey && (await reserverAppelGoogle())) {
    try {
      return { km: await routeGoogle(from, to, googleKey), source: "google" };
    } catch (gErr) {
      console.error("Google indisponible, repli sur l'IGN :", gErr.message);
    }
  }
  try {
    return { km: await routeIgn(from, to), source: "ign" };
  } catch (ignErr) {
    const orsKey = process.env.ORS_API_KEY;
    if (!orsKey) throw ignErr;
    console.error("IGN indisponible, repli sur ORS :", ignErr.message);
    return { km: await routeOrs(from, to, orsKey), source: "ors" };
  }
}

module.exports = { searchAddresses, geocodeStrict, routeDistanceKm };
