// Hachage / vérification de mot de passe compatible avec le format produit par
// Werkzeug (generate_password_hash / check_password_hash), utilisé par les
// applis Flask AID'Aux (auth.py). Format : "scrypt:N:r:p$salt$hexhash".
//
// On génère et on vérifie ce même format ici en Node, avec le module natif
// crypto (scrypt), pour que la table `comptes` reste partagée et utilisable
// indifféremment par toutes les applis, quelle que soit leur techno.

const crypto = require('crypto');

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64; // octets -> 128 caractères hex, comme Werkzeug

function scryptOptions(N, r, p) {
  // maxmem doit être >= 128 * N * r (approximativement) ; on prend large.
  return { N, r, p, maxmem: 256 * 1024 * 1024 };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(
    password,
    salt,
    KEY_LEN,
    scryptOptions(SCRYPT_N, SCRYPT_R, SCRYPT_P)
  );
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}$${salt}$${derived.toString('hex')}`;
}

function verifyPassword(storedHash, password) {
  if (!storedHash || typeof storedHash !== 'string') return false;
  const firstDollar = storedHash.indexOf('$');
  const lastDollar = storedHash.lastIndexOf('$');
  if (firstDollar === -1 || lastDollar === firstDollar) return false;

  const methodPart = storedHash.slice(0, firstDollar);
  const salt = storedHash.slice(firstDollar + 1, lastDollar);
  const hashHex = storedHash.slice(lastDollar + 1);

  const parts = methodPart.split(':');
  const method = parts[0];

  try {
    if (method === 'scrypt') {
      const N = parseInt(parts[1], 10);
      const r = parseInt(parts[2], 10);
      const p = parseInt(parts[3], 10);
      const keylen = hashHex.length / 2;
      const derived = crypto.scryptSync(password, salt, keylen, scryptOptions(N, r, p));
      const derivedHex = derived.toString('hex');
      if (derivedHex.length !== hashHex.length) return false;
      return crypto.timingSafeEqual(Buffer.from(derivedHex), Buffer.from(hashHex));
    }
    if (method === 'pbkdf2') {
      // format: pbkdf2:sha256:ITERATIONS (ou pbkdf2:sha256 sans itérations = 600000 par défaut anciennes versions)
      const hashName = parts[1] || 'sha256';
      const iterations = parseInt(parts[2], 10) || 600000;
      const keylen = hashHex.length / 2;
      const derived = crypto.pbkdf2Sync(password, salt, iterations, keylen, hashName);
      const derivedHex = derived.toString('hex');
      if (derivedHex.length !== hashHex.length) return false;
      return crypto.timingSafeEqual(Buffer.from(derivedHex), Buffer.from(hashHex));
    }
  } catch (e) {
    return false;
  }
  return false;
}

module.exports = { hashPassword, verifyPassword };
