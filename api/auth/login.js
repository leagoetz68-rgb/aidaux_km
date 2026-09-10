const { verifyLogin } = require('../../lib/authdb');
const { makeToken } = require('../../lib/sessionToken');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { email, password } = body || {};
  if (!email || !password) {
    res.status(400).json({ error: 'Email et mot de passe requis' });
    return;
  }
  try {
    const ok = await verifyLogin(email, password);
    if (!ok) {
      res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
      return;
    }
    const token = makeToken(email.trim().toLowerCase());
    res.status(200).json({ token });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
