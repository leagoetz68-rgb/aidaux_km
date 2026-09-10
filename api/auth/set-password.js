const { emailForToken, setPassword } = require('../../lib/authdb');

const LONGUEUR_MDP_MIN = 8;

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    // Utilisé par reset.html pour vérifier que le lien est encore valable
    // avant d'afficher le formulaire.
    const { token } = req.query;
    try {
      const email = await emailForToken(token);
      if (!email) {
        res.status(400).json({ error: "Ce lien est invalide ou a expiré." });
        return;
      }
      res.status(200).json({ email });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const { token, password, password2 } = body || {};
  if (!token || !password || !password2) {
    res.status(400).json({ error: 'Champs manquants' });
    return;
  }
  if (password.length < LONGUEUR_MDP_MIN) {
    res.status(400).json({ error: `Le mot de passe doit contenir au moins ${LONGUEUR_MDP_MIN} caractères.` });
    return;
  }
  if (password !== password2) {
    res.status(400).json({ error: 'Les deux mots de passe ne correspondent pas.' });
    return;
  }
  try {
    const email = await setPassword(token, password);
    if (!email) {
      res.status(400).json({ error: "Le lien n'est plus valable. Redemandez-en un." });
      return;
    }
    res.status(200).json({ ok: true, email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
