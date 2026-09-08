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

// Délai maximum par appel externe : évite qu'une requête qui traîne fasse
// planter toute la fonction en silence (timeout Vercel, réponse 502 opaque).
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`Délai dépassé (${FETCH_TIMEOUT_MS / 1000}s) en appelant ${url}`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

async function geocode(text, apiKey) {
  const url = `${GEOCODE_URL}?api_key=${encodeURIComponent(apiKey)}&text=${encodeURIComponent(text)}&size=1&focus.point.lat=${FOCUS_LAT}&focus.point.lon=${FOCUS_LON}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Géocodage impossible (${res.status}) : ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  const feature = data.features && data.features[0];
  if (!feature) {
    throw new Error(`Adresse introuvable : ${text}`);
  }
  return feature.geometry.coordinates; // [lon, lat]
}

async function directionsDistanceKm(coordDepart, coordArrivee, apiKey) {
  const res = await fetchWithTimeout(DIRECTIONS_URL, {
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
    const body = await res.text().catch(() => "");
    throw new Error(`Calcul d'itinéraire impossible (${res.status}) : ${body.slice(0, 300)}`);
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
    console.error("Erreur calcul distance:", e.message);
    res.status(502).json({ error: e.message || "Calcul de distance impossible" });
  }
};


<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frais Kilométriques — AID'Aux</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root{
    --bg: #F3F5FA;
    --surface: #FFFFFF;
    --ink: #182449;
    --ink-soft: #5B6690;
    --navy: #1B2A6B;
    --navy-bright: #000F9F;
    --navy-wash: #E8EAF6;
    --teal: #13B3B3;
    --teal-bright: #00BBB4;
    --teal-wash: #E1F6F5;
    --coral: #E8583A;
    --coral-bright: #FF4713;
    --coral-wash: #FDEAE4;
    --line: #DDE1EF;
    --danger: #C6503A;
    --radius: 14px;
    --shadow: 0 1px 2px rgba(27,42,107,0.06), 0 8px 24px -12px rgba(27,42,107,0.20);
    --font-display: 'Space Grotesk', sans-serif;
    --font-body: 'IBM Plex Sans', sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
  }
  *{box-sizing:border-box;}
  body{
    margin:0;
    font-family: var(--font-body);
    background: var(--bg);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  .app{ max-width: 860px; margin: 0 auto; padding: 0 0 110px; }

  /* Header */
  .hero{
    background: linear-gradient(155deg, var(--navy), var(--teal) 75%);
    color: white;
    padding: 28px 20px 34px;
    border-radius: 0 0 22px 22px;
    position: relative;
    overflow: hidden;
  }
  .hero::after{
    content:"";
    position:absolute; right:-40px; top:-40px; width:180px; height:180px;
    border-radius:50%;
    background: radial-gradient(circle, rgba(232,88,58,0.40), transparent 70%);
  }
  .brand{ display:flex; align-items:center; gap:10px; margin-bottom: 18px; }
  .brand-mark{
    width:34px; height:34px; border-radius:10px;
    background: var(--coral);
    display:flex; align-items:center; justify-content:center;
    font-family: var(--font-display); font-weight:700; color:white; font-size:16px;
    flex-shrink:0;
  }
  .brand-name{ font-family: var(--font-display); font-weight:600; font-size:15px; letter-spacing:0.02em; opacity:0.95; }
  .brand-sub{ font-size:11px; opacity:0.75; margin-top:1px; }
  h1{
    font-family: var(--font-display); font-weight:700; font-size: 22px;
    margin: 0 0 4px; letter-spacing: -0.01em;
  }
  .hero p{ margin:0; font-size:13px; opacity:0.85; max-width: 50ch; }

  /* Sections */
  .card{
    background: var(--surface);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: 18px;
    margin: -22px 16px 16px;
    position: relative;
    z-index: 2;
  }
  .card + .card{ margin-top: 16px; }
  .section-header-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
  .section-label{
    font-family: var(--font-display); font-weight:600; font-size: 13px;
    color: var(--navy); text-transform: uppercase; letter-spacing: 0.06em;
    margin: 0;
    display:flex; align-items:center; gap:8px;
  }
  .section-label .dot{ width:6px;height:6px;border-radius:50%; background:var(--coral); }

  .tab-btn{
    font-family: var(--font-body); font-weight:600; font-size:12px;
    color: var(--teal); background: var(--teal-wash); border: 1px solid transparent;
    padding: 6px 11px; border-radius: 20px; cursor:pointer;
  }
  .tab-btn:hover{ background: var(--teal); color:white; }

  .bareme-panel{
    background: var(--navy-wash); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;
  }
  .bareme-row{ display:flex; align-items:center; justify-content:space-between; font-size:13px; padding: 4px 0; color: var(--ink); }
  .bareme-row strong{ font-family: var(--font-mono); color: var(--navy); }
  .bareme-note{ font-size:11.5px; color: var(--ink-soft); margin: 8px 0 0; }

  .field-row{ display:flex; gap:10px; flex-wrap: wrap; }
  .field{ flex:1; min-width: 140px; display:flex; flex-direction:column; gap:6px; }
  label{ font-size:12px; font-weight:600; color: var(--ink-soft); }
  input, select{
    font-family: var(--font-body);
    font-size: 14px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1.5px solid var(--line);
    background: #FCFDFF;
    color: var(--ink);
    width:100%;
    transition: border-color 0.15s;
  }
  input:focus, select:focus{
    outline: none;
    border-color: var(--teal);
    box-shadow: 0 0 0 3px var(--teal-wash);
  }
  input[type="number"]{ font-family: var(--font-mono); }

  .swap-btn{
    align-self:center;
    width:36px; height:36px; border-radius:10px;
    border: 1.5px solid var(--line);
    background: white;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; flex-shrink:0;
    color: var(--navy);
    margin-top: 18px;
    transition: background 0.15s, transform 0.15s;
  }
  .swap-btn:hover{ background: var(--teal-wash); transform: rotate(180deg); }

  .checkbox-row{
    display:flex; align-items:center; gap:8px; margin-top:12px; font-size:13px; color: var(--ink-soft);
  }
  .checkbox-row input{ width:16px; height:16px; accent-color: var(--teal); }

  .leg-block{
    background: #FAFBFF; border: 1.5px dashed var(--line); border-radius: 12px;
    padding: 12px; margin-top: 10px;
  }
  .leg-block-title{
    font-family: var(--font-display); font-weight:600; font-size:12px;
    color: var(--navy); text-transform:uppercase; letter-spacing:0.04em; margin-bottom:10px;
    display:flex; align-items:center;
  }
  .calc-status{
    display:block; font-size:11px; color: var(--ink-soft); margin-top:4px; min-height:14px;
  }

  .btn{
    font-family: var(--font-body); font-weight:600; font-size:14px;
    padding: 11px 16px; border-radius: 10px; border:none; cursor:pointer;
    display:inline-flex; align-items:center; justify-content:center; gap:6px;
    transition: transform 0.1s, opacity 0.15s, background 0.15s;
  }
  .btn:active{ transform: scale(0.98); }
  .btn:disabled{ opacity:0.6; cursor:not-allowed; }
  .btn-primary{ background: var(--teal); color:white; width:100%; margin-top:14px; }
  .btn-primary:hover{ background: var(--navy); }
  .btn-ghost{ background: transparent; color: var(--navy); border:1.5px solid var(--line); }
  .btn-ghost:hover{ background: var(--navy-wash); }
  .btn-danger-ghost{ background:transparent; color: var(--danger); border: 1.5px solid #F1D2C9; }
  .btn-sm{ padding: 7px 10px; font-size:12.5px; }

  /* Table */
  .table-wrap{ overflow-x:auto; margin: 0 -2px; }
  table.trip-table{ width:100%; border-collapse: collapse; font-size: 12.5px; min-width: 560px; }
  .trip-table th, .trip-table td{
    border: 1px solid var(--line); padding: 8px 9px; text-align:left; vertical-align: middle;
  }
  .trip-table thead th{
    background: var(--navy-wash); color: var(--navy);
    font-family: var(--font-display); font-weight:600; font-size: 11px;
    text-transform: uppercase; letter-spacing: 0.03em;
  }
  .trip-table td.cell-date{ font-weight:600; white-space:nowrap; color: var(--ink); }
  .trip-table td.cell-km{ font-family: var(--font-mono); color: var(--teal); font-weight:600; white-space:nowrap; }
  .trip-table td.cell-total{ font-family: var(--font-mono); font-weight:700; color: var(--navy); white-space:nowrap; background: var(--teal-wash); }
  .trip-table td.cell-forfait{ font-family: var(--font-mono); font-weight:700; color: var(--coral); white-space:nowrap; background: var(--coral-wash); }
  .trip-table td.cell-del{ text-align:center; padding: 4px; }
  .leg-del{
    background:none; border:none; cursor:pointer; color: var(--ink-soft);
    font-size:13px; padding:4px 7px; border-radius: 6px; line-height:1;
  }
  .leg-del:hover{ color: var(--danger); background: #FBEAE6; }
  tr.total-row td{
    background: var(--navy); color:white; font-family: var(--font-display); font-weight:600;
    font-size: 12px; text-transform:uppercase; letter-spacing:0.03em;
  }
  tr.total-row td.cell-km, tr.total-row td.cell-forfait{ background: var(--navy); color:white; }
  .direction-tag{
    display:inline-block; margin-left:8px; font-size:10px; font-weight:600; text-transform:none;
    letter-spacing:0; color: rgba(255,255,255,0.75); font-family: var(--font-body);
  }

  .empty-state{
    text-align:center; padding: 26px 12px; color: var(--ink-soft); font-size:13.5px;
  }
  .empty-state .icon{ font-size: 26px; margin-bottom:8px; }

  /* Sticky total bar */
  .total-bar{
    position: sticky; bottom: 0; left:0; right:0;
    background: var(--surface);
    border-top: 1px solid var(--line);
    padding: 12px 20px;
    display:flex; align-items:center; justify-content:space-between; gap: 14px;
    box-shadow: 0 -6px 18px -10px rgba(27,42,107,0.28);
    z-index: 5;
  }
  .tb-group{ display:flex; flex-direction:column; align-items:flex-start; }
  .tb-group.right{ align-items:flex-end; }
  .total-bar .label{ font-size:11px; color: var(--ink-soft); font-weight:600; text-transform:uppercase; letter-spacing:0.04em; }
  .total-bar .value{ font-family: var(--font-mono); font-size: 20px; font-weight:600; color: var(--navy); }
  .total-bar .value.coral{ color: var(--coral); }

  .toolbar{ display:flex; gap:10px; margin-top: 14px; }
  .toolbar .btn{ flex:1; }

  .toast{
    position: fixed; top: 14px; left:50%; transform: translateX(-50%);
    background: var(--ink); color:white; font-size:13px; padding: 9px 16px;
    border-radius: 20px; opacity:0; pointer-events:none; transition: opacity 0.25s, transform 0.25s;
    z-index: 50; white-space:nowrap;
  }
  .toast.show{ opacity:1; transform: translateX(-50%) translateY(4px); }

  .loading-row{ text-align:center; padding: 20px; color: var(--ink-soft); font-size:13px; }

  @media print{
    .hero, .toolbar, .swap-btn, .leg-del, .no-print, .btn-primary, .checkbox-row, .total-bar{ display:none !important; }
    .card{ box-shadow:none; margin: 0 0 12px; border:1px solid #ccc; }
    body{ background:white; }
    tr.total-row td{ background:#eee !important; color:#000 !important; }
  }
</style>
</head>
<body>
<div class="app">

  <div class="hero">
    <div class="brand">
      <div class="brand-mark">A</div>
      <div>
        <div class="brand-name">AID'Aux</div>
        <div class="brand-sub">Services d'aide à la personne</div>
      </div>
    </div>
    <h1>Frais kilométriques</h1>
    <p>1er lieu d'intervention / dernier lieu d'intervention — domicile. Enregistrez vos trajets, le total et le forfait se calculent tout seuls.</p>
  </div>

  <div class="card">
    <div class="section-label"><span class="dot"></span>Informations</div>
    <div class="field-row">
      <div class="field">
        <label for="salarie">Nom du salarié</label>
        <input type="text" id="salarie" placeholder="ex. Erdogan">
      </div>
      <div class="field">
        <label for="mois">Mois concerné</label>
        <input type="month" id="mois">
      </div>
    </div>
    <div class="field-row" style="margin-top:10px;">
      <div class="field">
        <label for="domicile">Adresse du domicile (départ habituel)</label>
        <input type="text" id="domicile" placeholder="ex. 1 rue du canal 67550 Vendenheim">
      </div>
    </div>
  </div>

  <div class="card">
    <div class="section-label"><span class="dot"></span>Ajouter un trajet</div>
    <div class="field-row">
      <div class="field" style="max-width:170px;">
        <label for="f-date">Date</label>
        <input type="date" id="f-date">
      </div>
    </div>

    <div class="leg-block">
      <div class="leg-block-title">Aller</div>
      <div class="field-row" style="align-items:flex-end;">
        <div class="field">
          <label for="f-depart">Adresse de départ</label>
          <input type="text" id="f-depart" placeholder="Adresse de départ">
        </div>
        <button class="swap-btn" id="btn-swap" type="button" title="Inverser départ / arrivée">⇅</button>
        <div class="field">
          <label for="f-arrivee">Adresse d'arrivée</label>
          <input type="text" id="f-arrivee" placeholder="Adresse d'arrivée">
        </div>
      </div>
      <div class="field-row" style="margin-top:10px;">
        <div class="field" style="max-width:150px;">
          <label for="f-km">Nombre de km (aller)</label>
          <input type="number" id="f-km" step="0.1" min="0" placeholder="ex. 4,2">
          <span class="calc-status" id="aller-calc-status"></span>
        </div>
      </div>
    </div>

    <label class="checkbox-row">
      <input type="checkbox" id="f-has-retour" checked>
      Ajouter aussi un trajet retour
    </label>

    <div class="leg-block" id="retour-block">
      <div class="leg-block-title">
        Retour
        <button class="tab-btn" id="btn-copy-retour" type="button" style="margin-left:8px;">↺ Reprendre l'aller inversé</button>
      </div>
      <div class="field-row" style="align-items:flex-end;">
        <div class="field">
          <label for="f-retour-depart">Adresse de départ (retour)</label>
          <input type="text" id="f-retour-depart" placeholder="Adresse de départ">
        </div>
        <div class="field">
          <label for="f-retour-arrivee">Adresse d'arrivée (retour)</label>
          <input type="text" id="f-retour-arrivee" placeholder="Adresse d'arrivée">
        </div>
      </div>
      <div class="field-row" style="margin-top:10px;">
        <div class="field" style="max-width:150px;">
          <label for="f-retour-km">Nombre de km (retour)</label>
          <input type="number" id="f-retour-km" step="0.1" min="0" placeholder="ex. 4,2">
          <span class="calc-status" id="retour-calc-status"></span>
        </div>
      </div>
    </div>

    <button class="btn btn-primary" id="btn-add">+ Ajouter le trajet</button>
  </div>

  <div class="card">
    <div class="section-header-row">
      <div class="section-label"><span class="dot"></span>Trajets du mois</div>
      <button class="tab-btn no-print" id="btn-bareme" type="button">ℹ️ Barème de remboursement</button>
    </div>

    <div id="bareme-panel" class="bareme-panel no-print" style="display:none;">
      <div class="bareme-row"><span>Moins de 20,99 km / jour</span><strong>2 €</strong></div>
      <div class="bareme-row"><span>Entre 21 et 40,99 km / jour</span><strong>4 €</strong></div>
      <div class="bareme-row"><span>Au-delà de 41 km / jour</span><strong>6 €</strong></div>
      <p class="bareme-note">Le forfait est calculé automatiquement par journée, sur la base du total de km parcourus ce jour-là.</p>
    </div>

    <div id="loading" class="loading-row">Chargement de vos trajets…</div>

    <div id="table-wrap" class="table-wrap" style="display:none;">
      <table class="trip-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Adresse de départ</th>
            <th>Adresse arrivée</th>
            <th>Km</th>
            <th>Total jour</th>
            <th>Forfait jour</th>
            <th class="no-print"></th>
          </tr>
        </thead>
        <tbody id="trip-table-body"></tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3">Total du mois<span class="direction-tag">réservé à la direction</span></td>
            <td class="cell-km"><span id="month-km-total">0 km</span></td>
            <td class="cell-forfait" colspan="2"><span id="month-forfait-total">0 €</span></td>
          </tr>
        </tfoot>
      </table>
    </div>

    <div id="empty" class="empty-state" style="display:none;">
      <div class="icon">🚗</div>
      Aucun trajet enregistré pour ce mois pour l'instant.
    </div>

    <div class="toolbar no-print">
      <button class="btn btn-ghost btn-sm" id="btn-print">🖨️ Imprimer</button>
      <button class="btn btn-ghost btn-sm" id="btn-csv">⬇️ Exporter CSV</button>
      <button class="btn btn-danger-ghost btn-sm" id="btn-reset">Effacer le mois</button>
    </div>
  </div>

</div>

<div class="total-bar no-print">
  <div class="tb-group">
    <span class="label">Total km</span>
    <span class="value" id="month-total">0 km</span>
  </div>
  <div class="tb-group right">
    <span class="label">Total forfait</span>
    <span class="value coral" id="month-total-forfait">0 €</span>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
(function(){
  const $ = (id) => document.getElementById(id);
  const els = {
    salarie: $('salarie'), mois: $('mois'), domicile: $('domicile'),
    fDate: $('f-date'), fKm: $('f-km'), fDepart: $('f-depart'), fArrivee: $('f-arrivee'),
    fHasRetour: $('f-has-retour'), retourBlock: $('retour-block'),
    fRetourDepart: $('f-retour-depart'), fRetourArrivee: $('f-retour-arrivee'), fRetourKm: $('f-retour-km'),
    allerCalcStatus: $('aller-calc-status'), retourCalcStatus: $('retour-calc-status'),
    btnCopyRetour: $('btn-copy-retour'),
    btnAdd: $('btn-add'), btnSwap: $('btn-swap'),
    btnBareme: $('btn-bareme'), baremePanel: $('bareme-panel'),
    tableWrap: $('table-wrap'), tripTableBody: $('trip-table-body'),
    loading: $('loading'), empty: $('empty'),
    monthTotal: $('month-total'), monthTotalForfait: $('month-total-forfait'),
    monthKmTotal: $('month-km-total'), monthForfaitTotal: $('month-forfait-total'),
    toast: $('toast'),
    btnPrint: $('btn-print'), btnCsv: $('btn-csv'), btnReset: $('btn-reset')
  };

  let entries = [];
  const LAST_SALARIE_KEY = 'fraisKm:lastSalarie';

  function todayMonth(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }
  function todayISO(){
    return new Date().toISOString().slice(0,10);
  }
  function showToast(msg){
    els.toast.textContent = msg;
    els.toast.classList.add('show');
    setTimeout(()=> els.toast.classList.remove('show'), 1800);
  }
  function fmtKm(n){
    return (Math.round(n*10)/10).toString().replace('.', ',') + ' km';
  }
  function fmtEuro(n){
    return (Math.round(n*100)/100).toString().replace('.', ',') + ' €';
  }
  function escapeHtml(str){
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }
  function currentSalarie(){
    return (els.salarie.value || '').trim();
  }
  function currentMois(){
    return els.mois.value || todayMonth();
  }
  function calcForfait(km){
    if(km <= 20.99) return 2;
    if(km <= 40.99) return 4;
    return 6;
  }

  async function loadDomicile(){
    const salarie = currentSalarie();
    if(!salarie) return;
    try{
      const res = await fetch('/api/settings?salarie=' + encodeURIComponent(salarie));
      const data = await res.json();
      if(data && data.domicile !== undefined){
        els.domicile.value = data.domicile || '';
      }
    }catch(e){ /* pas de réglages pour ce salarié */ }
  }

  async function saveDomicile(){
    const salarie = currentSalarie();
    if(!salarie) return;
    try{
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ salarie, domicile: els.domicile.value.trim() })
      });
    }catch(e){ console.error('Erreur sauvegarde réglages', e); }
  }

  async function loadEntries(){
    const salarie = currentSalarie();
    if(!salarie){
      entries = [];
      els.loading.style.display = 'none';
      render();
      return;
    }
    els.loading.style.display = 'block';
    els.tableWrap.style.display = 'none';
    els.empty.style.display = 'none';
    try{
      const res = await fetch('/api/trajets?salarie=' + encodeURIComponent(salarie) + '&mois=' + encodeURIComponent(currentMois()));
      if(!res.ok) throw new Error('Erreur serveur');
      entries = await res.json();
    }catch(e){
      entries = [];
      showToast('Impossible de charger les trajets');
    }
    els.loading.style.display = 'none';
    render();
  }

  function render(){
    const byDate = {};
    entries.forEach(e => {
      if(!byDate[e.date]) byDate[e.date] = [];
      byDate[e.date].push(e);
    });
    const dates = Object.keys(byDate).sort();

    let monthKm = 0;
    let monthForfait = 0;

    if(dates.length === 0){
      els.tripTableBody.innerHTML = '';
      els.tableWrap.style.display = 'none';
      els.empty.style.display = 'block';
    } else {
      els.empty.style.display = 'none';
      els.tableWrap.style.display = 'block';
      let rowsHtml = '';
      dates.forEach(date => {
        const legs = byDate[date];
        const dayKm = legs.reduce((s,l)=> s + Number(l.km||0), 0);
        const dayForfait = calcForfait(dayKm);
        monthKm += dayKm;
        monthForfait += dayForfait;
        const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
        legs.forEach((leg, i) => {
          rowsHtml += '<tr>';
          if(i === 0){
            rowsHtml += `<td class="cell-date" rowspan="${legs.length}">${dateLabel}</td>`;
          }
          rowsHtml += `
            <td>${escapeHtml(leg.depart)}</td>
            <td>${escapeHtml(leg.arrivee)}</td>
            <td class="cell-km">${fmtKm(Number(leg.km||0))}</td>
          `;
          if(i === 0){
            rowsHtml += `<td class="cell-total" rowspan="${legs.length}">${fmtKm(dayKm)}</td>`;
            rowsHtml += `<td class="cell-forfait" rowspan="${legs.length}">${dayForfait} €</td>`;
          }
          rowsHtml += `<td class="cell-del no-print"><button class="leg-del" data-id="${leg.id}" title="Supprimer">✕</button></td>`;
          rowsHtml += '</tr>';
        });
      });
      els.tripTableBody.innerHTML = rowsHtml;
    }

    els.monthKmTotal.textContent = fmtKm(monthKm);
    els.monthForfaitTotal.textContent = fmtEuro(monthForfait);
    els.monthTotal.textContent = fmtKm(monthKm);
    els.monthTotalForfait.textContent = fmtEuro(monthForfait);

    els.tripTableBody.querySelectorAll('.leg-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        entries = entries.filter(e => e.id !== id);
        render();
        try{
          await fetch('/api/trajets/' + encodeURIComponent(id), { method: 'DELETE' });
        }catch(e){
          showToast('Erreur lors de la suppression');
        }
      });
    });
  }

  async function postLeg(salarie, mois, date, depart, arrivee, km){
    const res = await fetch('/api/trajets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salarie, mois, date, depart, arrivee, km, retour: false })
    });
    if(!res.ok) throw new Error('Erreur serveur');
  }

  async function addTrip(){
    const salarie = currentSalarie();
    const date = els.fDate.value;
    const depart = els.fDepart.value.trim();
    const arrivee = els.fArrivee.value.trim();
    const km = parseFloat((els.fKm.value || '').replace(',', '.'));
    const hasRetour = els.fHasRetour.checked;
    const rDepart = els.fRetourDepart.value.trim();
    const rArrivee = els.fRetourArrivee.value.trim();
    const rKm = parseFloat((els.fRetourKm.value || '').replace(',', '.'));

    if(!salarie){ showToast('Merci de renseigner le nom du salarié'); return; }
    if(!date){ showToast('Merci de renseigner une date'); return; }
    if(!depart || !arrivee){ showToast('Merci de renseigner les deux adresses de l\'aller'); return; }
    if(isNaN(km) || km <= 0){ showToast('Merci de renseigner un nombre de km valide pour l\'aller'); return; }
    if(hasRetour){
      if(!rDepart || !rArrivee){ showToast('Merci de renseigner les deux adresses du retour'); return; }
      if(isNaN(rKm) || rKm <= 0){ showToast('Merci de renseigner un nombre de km valide pour le retour'); return; }
    }

    els.btnAdd.disabled = true;
    try{
      const mois = currentMois();
      await postLeg(salarie, mois, date, depart, arrivee, km);
      if(hasRetour){
        await postLeg(salarie, mois, date, rDepart, rArrivee, rKm);
      }
      await loadEntries();
      showToast('Trajet ajouté ✓');
      els.fKm.value = '';
      els.fArrivee.value = '';
      els.fRetourKm.value = '';
      els.fRetourArrivee.value = '';
      els.fRetourDepart.value = '';
      els.fKm.focus();
    }catch(e){
      showToast("Échec de l'enregistrement, réessayez");
    }
    els.btnAdd.disabled = false;
  }

  function toggleRetourBlock(){
    els.retourBlock.style.display = els.fHasRetour.checked ? 'block' : 'none';
  }

  // --- Calcul automatique de la distance (OpenRouteService) ---
  async function autoCalcKm(depart, arrivee, kmEl, statusEl){
    if(!depart || !arrivee) return;
    if(statusEl) statusEl.textContent = 'Calcul de la distance...';
    try{
      const res = await fetch('/api/distance?depart=' + encodeURIComponent(depart) + '&arrivee=' + encodeURIComponent(arrivee));
      const data = await res.json();
      if(res.ok && typeof data.km === 'number'){
        kmEl.value = String(data.km).replace('.', ',');
        if(statusEl) statusEl.textContent = `Distance calculée : ${String(data.km).replace('.', ',')} km`;
      } else {
        if(statusEl) statusEl.textContent = (data.error || "Distance non trouvée") + " — renseignez le km manuellement";
      }
    }catch(e){
      if(statusEl) statusEl.textContent = "Calcul indisponible, merci de renseigner le km manuellement";
    }
  }

  function maybeAutoCalc(departEl, arriveeEl, kmEl, statusEl){
    autoCalcKm(departEl.value.trim(), arriveeEl.value.trim(), kmEl, statusEl);
  }

  function copyRetourFromAller(){
    els.fRetourDepart.value = els.fArrivee.value;
    els.fRetourArrivee.value = els.fDepart.value;
    els.fRetourKm.value = els.fKm.value;
    maybeAutoCalc(els.fRetourDepart, els.fRetourArrivee, els.fRetourKm, els.retourCalcStatus);
  }

  function swapAddresses(){
    const d = els.fDepart.value;
    els.fDepart.value = els.fArrivee.value;
    els.fArrivee.value = d;
    maybeAutoCalc(els.fDepart, els.fArrivee, els.fKm, els.allerCalcStatus);
  }

  function exportCsv(){
    if(entries.length === 0){ showToast('Aucun trajet à exporter'); return; }
    const byDate = {};
    entries.forEach(e => { if(!byDate[e.date]) byDate[e.date] = []; byDate[e.date].push(e); });
    const rows = [['Date','Adresse de départ','Adresse arrivée','Nombre Km','Total jour (km)','Forfait jour (€)']];
    Object.keys(byDate).sort().forEach(date => {
      const legs = byDate[date];
      const dayKm = legs.reduce((s,l)=> s + Number(l.km||0), 0);
      const dayForfait = calcForfait(dayKm);
      legs.forEach((e, i) => {
        rows.push([
          e.date, e.depart, e.arrivee, String(e.km).replace('.', ','),
          i === 0 ? String(Math.round(dayKm*10)/10).replace('.', ',') : '',
          i === 0 ? String(dayForfait) : ''
        ]);
      });
    });
    const csv = rows.map(r => r.map(c => '"' + String(c).replace(/"/g,'""') + '"').join(';')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const name = (els.salarie.value || 'salarie').trim().replace(/\s+/g,'_') || 'salarie';
    a.href = url;
    a.download = `frais_kms_${name}_${els.mois.value || 'mois'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function resetMonth(){
    const salarie = currentSalarie();
    if(!salarie) return;
    if(!confirm('Effacer tous les trajets enregistrés pour ce mois ? Cette action est irréversible.')) return;
    try{
      await fetch('/api/trajets?salarie=' + encodeURIComponent(salarie) + '&mois=' + encodeURIComponent(currentMois()), { method: 'DELETE' });
      entries = [];
      render();
      showToast('Mois réinitialisé');
    }catch(e){
      showToast('Erreur lors de la réinitialisation');
    }
  }

  els.btnAdd.addEventListener('click', addTrip);
  els.btnSwap.addEventListener('click', swapAddresses);
  els.fHasRetour.addEventListener('change', toggleRetourBlock);
  els.btnCopyRetour.addEventListener('click', copyRetourFromAller);
  els.fDepart.addEventListener('change', () => maybeAutoCalc(els.fDepart, els.fArrivee, els.fKm, els.allerCalcStatus));
  els.fArrivee.addEventListener('change', () => maybeAutoCalc(els.fDepart, els.fArrivee, els.fKm, els.allerCalcStatus));
  els.fRetourDepart.addEventListener('change', () => maybeAutoCalc(els.fRetourDepart, els.fRetourArrivee, els.fRetourKm, els.retourCalcStatus));
  els.fRetourArrivee.addEventListener('change', () => maybeAutoCalc(els.fRetourDepart, els.fRetourArrivee, els.fRetourKm, els.retourCalcStatus));
  els.btnPrint.addEventListener('click', () => window.print());
  els.btnCsv.addEventListener('click', exportCsv);
  els.btnReset.addEventListener('click', resetMonth);
  els.btnBareme.addEventListener('click', () => {
    const showing = els.baremePanel.style.display !== 'none';
    els.baremePanel.style.display = showing ? 'none' : 'block';
  });
  els.salarie.addEventListener('change', async () => {
    localStorage.setItem(LAST_SALARIE_KEY, currentSalarie());
    await loadDomicile();
    if(!els.fDepart.value) els.fDepart.value = els.domicile.value;
    await loadEntries();
  });
  els.domicile.addEventListener('change', async () => {
    await saveDomicile();
    if(!els.fDepart.value) els.fDepart.value = els.domicile.value;
  });
  els.mois.addEventListener('change', loadEntries);

  (async function init(){
    toggleRetourBlock();
    if(!els.mois.value) els.mois.value = todayMonth();
    if(!els.fDate.value) els.fDate.value = todayISO();
    const lastSalarie = localStorage.getItem(LAST_SALARIE_KEY);
    if(lastSalarie) els.salarie.value = lastSalarie;
    await loadDomicile();
    if(!els.fDepart.value) els.fDepart.value = els.domicile.value;
    await loadEntries();
  })();
})();
</script>
</body>
</html>
