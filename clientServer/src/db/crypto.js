//  clientServer/src/db/crypto.js
import { createHash, randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

// ── Cryptographic Constants ──
// Version prefix for future algorithm migration
const CRYPTO_VERSION = 'v1';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;      // AES block size
const TAG_LENGTH = 16;     // GCM auth tag
const KEY_LENGTH = 32;   // AES-256
const SALT_LENGTH = 32;  // scrypt salt

// ── Hardcoded application salt (pepper) ──
const APP_PEPPER = 'a3f9c2e8d1b70456a8c3f9e2d1b70456a8c3f9e2d1b70456a8c3f9e2d1b70456';

// ── Hardware Anchor ──
// Reads machine-id with CPU+user+hostname fallback.
// The fallback is hashed to prevent info leakage.
function getHardwareId() {
  const candidates = [
    '/etc/machine-id',
    '/var/lib/dbus/machine-id',
    '/sys/class/dmi/id/product_uuid',
    '/proc/sys/kernel/random/boot_id',
  ];

  for (const p of candidates) {
    try {
      const id = fs.readFileSync(p, 'utf8').trim();
      if (id && id.length >= 16 && id !== 'uninitialized' && !id.includes('00000000')) {
        return id;
      }
    } catch {}
  }

  // Fallback: hash components so they don't leak in error messages
  const cpu = os.cpus()[0]?.model || 'unknown-cpu';
  const user = os.userInfo().username || 'unknown-user';
  const hostname = os.hostname() || 'unknown-host';
  const combined = `fallback:${cpu}:${user}:${hostname}`;
  return createHash('sha256').update(combined).digest('hex');
}

// ── Master Key Derivation ──
// Uses scrypt (memory-hard) instead of fast SHA-256.
// Key is never stored; computed fresh every process start.
function deriveMasterKey() {
  const hardwareId = getHardwareId();
  // Combine pepper + hardware ID + pepper for domain separation
  const input = Buffer.from(APP_PEPPER + hardwareId + APP_PEPPER, 'hex');
  return scryptSync(input, Buffer.from(APP_PEPPER.slice(0, 64), 'hex'), KEY_LENGTH, {
    N: 16384, r: 8, p: 1, maxmem: 128 * 1024 * 1024,
  });
}

// Derive once per process, store in closure
const _masterKey = deriveMasterKey();

// ── Ciphertext Format ──
// All components base64url-safe (standard base64)

/**
 * Encrypt a plaintext string.
 * Returns: "v1:<iv_tag_b64>:<ciphertext_b64>"
 */
export function encrypt(plaintext) {
  if (typeof plaintext !== 'string') {
    throw new TypeError('encrypt() expects a string');
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, _masterKey, iv, { authTagLength: TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Prepend tag to ciphertext for storage
  const payload = Buffer.concat([tag, encrypted]);
  return `${CRYPTO_VERSION}:${iv.toString('base64')}:${payload.toString('base64')}`;
}

/**
 * Decrypt a ciphertext string.
 * Throws on tampering, wrong key, or malformed input.
 */
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
    // GCM auth failure — tampering or wrong key
    throw new Error('DECRYPTION_FAILED: Authentication failed. The database was encrypted on a different device or the data was tampered with. Run "apex authtoken <token>" to re-sync.');
  }
}

/**
 * Check if a value appears to be encrypted with our format.
 * Returns false for legacy plaintext (allows migration).
 */
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

/**
 * Securely clear a Buffer's contents (best effort in JS).
 */
export function secureZero(buf) {
  if (Buffer.isBuffer(buf)) {
    buf.fill(0);
  }
}

/**
 * Get a one-time plaintext copy of a sensitive value.
 * Caller should call secureZero() on the returned Buffer when done.
 * Returns null if key not found.
 */
export function getSecureConfig(key, getRawFn) {
  const raw = getRawFn(key);
  if (raw === null || raw === undefined) return null;
  if (!isEncrypted(raw)) {
    // Legacy plaintext — return as-is, migration caller will re-encrypt
    return Buffer.from(raw);
  }
  try {
    const plaintext = decrypt(raw);
    return Buffer.from(plaintext);
  } catch (err) {
    secureZero(_masterKey); // Best effort
    throw err;
  }
}
