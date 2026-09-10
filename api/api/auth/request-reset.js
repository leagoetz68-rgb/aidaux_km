const { emailAutorise, createResetToken } = require('../../lib/authdb');
const { envoyerLienMotDePasse } = require('../../lib/mail');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const email = (body && body.email || '').trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: 'Email requis' });
    return;
  }
  if (!emailAutorise(email)) {
    res.status(403).json({ error: "Cette adresse n'est pas autorisée. Contactez Léa Goetz (lea.goetz@aidaux.fr)." });
    return;
  }
  try {
    const token = await createResetToken(email);
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const baseUrl = `${proto}://${req.headers.host}`;
    await envoyerLienMotDePasse(email, token, baseUrl);
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "L'envoi de l'email a échoué : " + e.message });
  }
};
