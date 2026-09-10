// Envoi d'email via l'API Brevo (même service que les autres applis AID'Aux).

const APP_NOM = process.env.AUTH_APP_NOM || "AID'Aux";
const EXPEDITEUR_EMAIL = process.env.EXPEDITEUR_EMAIL || 'lea.goetz@aidaux.fr';
const EXPEDITEUR_NOM = process.env.EXPEDITEUR_NOM || "AID'Aux";

async function envoyerMail(destinataire, sujet, texte) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY non configurée : envoi d\'email impossible.');
  }
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      sender: { name: EXPEDITEUR_NOM, email: EXPEDITEUR_EMAIL },
      to: [{ email: destinataire }],
      subject: sujet,
      textContent: texte,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo a refusé l'envoi (${res.status}) : ${body}`);
  }
}

async function envoyerLienMotDePasse(email, token, baseUrl) {
  const lien = `${baseUrl.replace(/\/$/, '')}/reset.html?token=${encodeURIComponent(token)}`;
  const texte =
    `Bonjour,\n\n` +
    `Vous avez demandé à définir ou réinitialiser votre mot de passe pour ` +
    `l'application ${APP_NOM} (frais kilométriques).\n\n` +
    `Cliquez sur ce lien (valable 2 h) pour choisir votre mot de passe :\n${lien}\n\n` +
    `Si vous n'êtes pas à l'origine de cette demande, ignorez simplement ce message.\n\n` +
    `— ${APP_NOM}\n`;
  await envoyerMail(email, `${APP_NOM} — définir votre mot de passe`, texte);
}

module.exports = { envoyerLienMotDePasse };
