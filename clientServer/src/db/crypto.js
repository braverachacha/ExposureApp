import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

const CRYPTO_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const APP_PEPPER = 'a3f9c2e8d1b70456a8c3f9e2d1b70456a8c3f9e2d1b70456a8c3f9e2d1b70456';

function deriveMasterKey() {
  const salt = Buffer.from(APP_PEPPER.slice(0, 64), 'hex');
  const input = Buffer.from(APP_PEPPER, 'hex');
  return scryptSync(input, salt, KEY_LENGTH, {
    N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024,
  });
}

const _masterKey = deriveMasterKey();

export function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encrypt() expects a string');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, _masterKey, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([tag, encrypted]);
  return `${CRYPTO_VERSION}:${iv.toString('base64')}:${payload.toString('base64')}`;
}

export function decrypt(ciphertext) {
  if (!ciphertext || typeof ciphertext !== 'string') {
    throw new Error('Invalid ciphertext: empty or non-string');
  }

  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext: expected 3 colon-separated parts');
  }

  const [version, ivB64, payloadB64] = parts;

  if (version !== CRYPTO_VERSION) {
    throw new Error(`Unsupported crypto version: ${version}`);
  }

  let iv, payload;
  try {
    iv = Buffer.from(ivB64, 'base64');
    payload = Buffer.from(payloadB64, 'base64');
  } catch {
    throw new Error('Malformed ciphertext: invalid base64');
  }

  if (iv.length !== IV_LENGTH) {
    throw new Error(`Invalid IV length: ${iv.length} (expected ${IV_LENGTH})`);
  }
  if (payload.length < TAG_LENGTH) {
    throw new Error('Invalid payload: shorter than auth tag');
  }

  const tag = payload.slice(0, TAG_LENGTH);
  const encrypted = payload.slice(TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, _masterKey, iv, { authTagLength: TAG_LENGTH });
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    throw new Error('DECRYPTION_FAILED: Key mismatch. Run "apex authtoken <token>" to re-sync.');
  }
}

export function isEncrypted(value) {
  if (!value || typeof value !== 'string') return false;
  const parts = value.split(':');
  if (parts.length !== 3) return false;
  if (parts[0] !== CRYPTO_VERSION) return false;
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const payload = Buffer.from(parts[2], 'base64');
    return iv.length === IV_LENGTH && payload.length >= TAG_LENGTH;
  } catch {
    return false;
  }
}

export function secureZero(buf) {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}

export function getSecureConfig(key, getRawFn) {
  const raw = getRawFn(key);
  if (raw === null || raw === undefined) return null;
  if (!isEncrypted(raw)) {
    return Buffer.from(raw);
  }
  try {
    const plaintext = decrypt(raw);
    return Buffer.from(plaintext);
  } catch (err) {
    secureZero(_masterKey);
    throw err;
  }
}
