const crypto = require('crypto');

const HASH_ALGORITHM = 'sha256';
const SALT_LENGTH = 16;

function hashPassword(plainPassword) {
  if (!plainPassword) {
    throw new Error('Password is required for hashing.');
  }

  const salt = crypto.randomBytes(SALT_LENGTH).toString('hex');
  const derived = crypto
    .createHash(HASH_ALGORITHM)
    .update(`${salt}:${plainPassword}`)
    .digest('hex');

  return { salt, hash: derived };
}

function verifyPassword(plainPassword, salt, expectedHash) {
  if (!plainPassword || !salt || !expectedHash) {
    return false;
  }

  const derived = crypto
    .createHash(HASH_ALGORITHM)
    .update(`${salt}:${plainPassword}`)
    .digest('hex');

  const derivedBuffer = Buffer.from(derived, 'hex');
  const expectedBuffer = Buffer.from(expectedHash, 'hex');

  if (derivedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(derivedBuffer, expectedBuffer);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
