// Jetons de session signés, sans état côté serveur (les fonctions API sont
// "serverless", donc pas de session Flask ici). Remplace l'ancien mot de
// passe unique transmis en clair à chaque appel.
//
// Format du jeton : base64url("email|expiration") + "." + signature HMAC-SHA256 hex.

const crypto = require('crypto');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 heures

function getSecret() {
  const secret = process.env.SECRET_KEY;
  if (!secret) {
    throw new Error("Variable SECRET_KEY manquante (nécessaire pour signer les sessions).");
  }
  return secret;
}

function sign(payload) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
}

function makeToken(email) {
  const expires = Date.now() + TOKEN_TTL_MS;
  const payload = `${email}|${expires}`;
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = sign(encoded);
  return `${encoded}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  let expectedSig;
  try {
    expectedSig = sign(encoded);
  } catch (e) {
    return null;
  }
  const sigBuf = Buffer.from(sig || '', 'hex');
  const expectedBuf = Buffer.from(expectedSig, 'hex');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }
  let payload;
  try {
    payload = Buffer.from(encoded, 'base64url').toString('utf8');
  } catch (e) {
    return null;
  }
  const idx = payload.lastIndexOf('|');
  if (idx === -1) return null;
  const email = payload.slice(0, idx);
  const expires = parseInt(payload.slice(idx + 1), 10);
  if (!expires || Date.now() > expires) return null;
  return email;
}

module.exports = { makeToken, verifyToken };
