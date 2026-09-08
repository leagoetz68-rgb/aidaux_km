const { getPool, ensureSchema } = require('../lib/db');

function calcForfait(km) {
  if (km <= 20.99) return 2;
  if (km <= 40.99) return 4;
  return 6;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const { mois, password } = req.query;

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    res.status(500).json({ error: "Variable ADMIN_PASSWORD non configurée côté serveur" });
    return;
  }
  if (!password || password !== adminPassword) {
    res.status(401).json({ error: 'Mot de passe incorrect' });
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

    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Frais Kilométriques — Direction — AID'Aux</title>
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
    --navy-wash: #E8EAF6;
    --teal: #13B3B3;
    --teal-wash: #E1F6F5;
    --coral: #E8583A;
    --coral-wash: #FDEAE4;
    --line: #DDE1EF;
    --radius: 14px;
    --shadow: 0 1px 2px rgba(27,42,107,0.06), 0 8px 24px -12px rgba(27,42,107,0.20);
    --font-display: 'Space Grotesk', sans-serif;
    --font-body: 'IBM Plex Sans', sans-serif;
    --font-mono: 'IBM Plex Mono', monospace;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; font-family: var(--font-body); background: var(--bg); color: var(--ink);
    -webkit-font-smoothing: antialiased;
  }
  .app{ max-width: 720px; margin: 0 auto; padding: 0 0 60px; }
  .hero{
    background: linear-gradient(155deg, var(--navy), var(--teal) 75%);
    color: white; padding: 24px 20px 30px; border-radius: 0 0 22px 22px;
  }
  .hero h1{ font-family: var(--font-display); font-weight:700; font-size: 20px; margin:0 0 4px; }
  .hero p{ margin:0; font-size:13px; opacity:0.85; }
  .card{
    background: var(--surface); border-radius: var(--radius); box-shadow: var(--shadow);
    padding: 18px; margin: -18px 16px 16px; position: relative; z-index:2;
  }
  .field-row{ display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap; }
  .field{ flex:1; min-width:140px; display:flex; flex-direction:column; gap:6px; }
  label{ font-size:12px; font-weight:600; color: var(--ink-soft); }
  input{
    font-family: var(--font-body); font-size:14px; padding:10px 12px; border-radius:10px;
    border:1.5px solid var(--line); background:#FCFDFF; color:var(--ink); width:100%;
  }
  input:focus{ outline:none; border-color:var(--teal); box-shadow:0 0 0 3px var(--teal-wash); }
  .btn{
    font-family: var(--font-body); font-weight:600; font-size:14px; padding:11px 16px;
    border-radius:10px; border:none; cursor:pointer; background: var(--teal); color:white;
  }
  .btn:hover{ background: var(--navy); }
  .btn:disabled{ opacity:0.6; cursor:not-allowed; }
  .status-row{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; flex-wrap:wrap; gap:8px; }
  .live-dot{ display:inline-flex; align-items:center; gap:6px; font-size:11px; color: var(--ink-soft); }
  .live-dot .dot{ width:7px; height:7px; border-radius:50%; background:var(--teal); animation: pulse 1.6s infinite; }
  @keyframes pulse{ 0%,100%{opacity:1;} 50%{opacity:0.3;} }
  table{ width:100%; border-collapse:collapse; font-size:13px; }
  th, td{ border:1px solid var(--line); padding:9px 10px; text-align:left; }
  thead th{
    background: var(--navy-wash); color: var(--navy); font-family: var(--font-display);
    font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.03em;
  }
  td.num{ font-family: var(--font-mono); font-weight:600; white-space:nowrap; }
  td.km{ color: var(--teal); }
  td.forfait{ color: var(--coral); }
  tr.total td{ background: var(--navy); color:white; font-weight:700; }
  .empty{ text-align:center; padding:24px; color: var(--ink-soft); font-size:13.5px; }
  .error-box{ background: var(--coral-wash); color:#8a3220; border-radius:10px; padding:10px 14px; font-size:13px; margin-bottom:12px; }
  .login-card{ max-width:360px; margin:60px auto 0; }
</style>
</head>
<body>
<div class="app">
  <div class="hero">
    <h1>Vue direction</h1>
    <p>Suivi en direct des frais kilométriques déclarés par les salariés.</p>
  </div>

  <div id="login-view" class="card login-card">
    <div class="field-row">
      <div class="field">
        <label for="password">Mot de passe direction</label>
        <input type="password" id="password" placeholder="••••••••">
      </div>
    </div>
    <div id="login-error" class="error-box" style="display:none; margin-top:10px;"></div>
    <button class="btn" id="btn-login" style="width:100%; margin-top:12px;">Se connecter</button>
  </div>

  <div id="dashboard-view" class="card" style="display:none;">
    <div class="status-row">
      <div class="field" style="max-width:180px;">
        <label for="mois">Mois</label>
        <input type="month" id="mois">
      </div>
      <div class="live-dot"><span class="dot"></span> Actualisation automatique</div>
    </div>
    <div id="dash-error" class="error-box" style="display:none;"></div>
    <div id="table-wrap"></div>
    <div id="empty" class="empty" style="display:none;">Aucun trajet déclaré pour ce mois pour l'instant.</div>
  </div>
</div>

<script>
(function(){
  const $ = (id) => document.getElementById(id);
  const els = {
    loginView: $('login-view'), dashboardView: $('dashboard-view'),
    password: $('password'), btnLogin: $('btn-login'), loginError: $('login-error'),
    mois: $('mois'), dashError: $('dash-error'), tableWrap: $('table-wrap'), empty: $('empty'),
  };

  let currentPassword = '';
  let pollTimer = null;
  const SESSION_KEY = 'fraisKm:adminPassword';

  function todayMonth(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
  }

  function fmtKm(n){ return (Math.round(n*10)/10).toString().replace('.', ',') + ' km'; }
  function fmtEuro(n){ return (Math.round(n*100)/100).toString().replace('.', ',') + ' €'; }
  function escapeHtml(str){ const d = document.createElement('div'); d.textContent = str || ''; return d.innerHTML; }

  async function fetchSalaries(){
    const mois = els.mois.value || todayMonth();
    try{
      const res = await fetch('/api/salaries?mois=' + encodeURIComponent(mois) + '&password=' + encodeURIComponent(currentPassword));
      if(res.status === 401){
        stopPolling();
        sessionStorage.removeItem(SESSION_KEY);
        els.dashboardView.style.display = 'none';
        els.loginView.style.display = 'block';
        els.loginError.style.display = 'block';
        els.loginError.textContent = 'Session expirée, merci de te reconnecter.';
        return;
      }
      const data = await res.json();
      if(!res.ok){
        els.dashError.style.display = 'block';
        els.dashError.textContent = data.error || 'Erreur de chargement';
        return;
      }
      els.dashError.style.display = 'none';
      render(data);
    }catch(e){
      els.dashError.style.display = 'block';
      els.dashError.textContent = 'Connexion impossible, nouvelle tentative dans 10s...';
    }
  }

  function render(list){
    if(list.length === 0){
      els.tableWrap.innerHTML = '';
      els.empty.style.display = 'block';
      return;
    }
    els.empty.style.display = 'none';
    let totalKm = 0, totalForfait = 0;
    const rows = list.map(item => {
      totalKm += item.km;
      totalForfait += item.forfait;
      return `<tr>
        <td>${escapeHtml(item.salarie)}</td>
        <td class="num">${item.jours}</td>
        <td class="num km">${fmtKm(item.km)}</td>
        <td class="num forfait">${fmtEuro(item.forfait)}</td>
      </tr>`;
    }).join('');
    els.tableWrap.innerHTML = `
      <table>
        <thead><tr><th>Salarié</th><th>Jours</th><th>Km</th><th>Forfait</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr class="total"><td>Total</td><td></td><td class="num">${fmtKm(totalKm)}</td><td class="num">${fmtEuro(totalForfait)}</td></tr></tfoot>
      </table>
    `;
  }

  function startPolling(){
    stopPolling();
    fetchSalaries();
    pollTimer = setInterval(fetchSalaries, 10000);
  }
  function stopPolling(){
    if(pollTimer){ clearInterval(pollTimer); pollTimer = null; }
  }

  async function tryLogin(password){
    currentPassword = password;
    els.loginError.style.display = 'none';
    const mois = els.mois.value || todayMonth();
    const res = await fetch('/api/salaries?mois=' + encodeURIComponent(mois) + '&password=' + encodeURIComponent(password));
    if(res.status === 401){
      els.loginError.style.display = 'block';
      els.loginError.textContent = 'Mot de passe incorrect.';
      return;
    }
    const data = await res.json().catch(()=>null);
    if(!res.ok){
      els.loginError.style.display = 'block';
      els.loginError.textContent = (data && data.error) || 'Erreur de connexion.';
      return;
    }
    sessionStorage.setItem(SESSION_KEY, password);
    els.loginView.style.display = 'none';
    els.dashboardView.style.display = 'block';
    render(data);
    startPolling();
  }

  els.btnLogin.addEventListener('click', () => {
    const pwd = els.password.value.trim();
    if(!pwd) return;
    tryLogin(pwd);
  });
  els.password.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') els.btnLogin.click();
  });
  els.mois.addEventListener('change', fetchSalaries);

  (function init(){
    if(!els.mois.value) els.mois.value = todayMonth();
    const saved = sessionStorage.getItem(SESSION_KEY);
    if(saved) tryLogin(saved);
  })();
})();
</script>
</body>
</html>
