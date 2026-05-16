// clientServer/src/auth.js
import { randomBytes, timingSafeEqual, scryptSync } from 'crypto';
import { openDb } from './db/index.js';
import { getEncryptedConfig, setEncryptedConfig, deleteEncryptedConfig } from './db/index.js';

const MIN_TOKEN_LEN = 64;
const MIN_PASS_LEN = 8;
const PEPPER = 'apextunnel-v1';
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };

function hashPassword(password, salt) {
  return scryptSync(password + PEPPER, salt, 64, SCRYPT_PARAMS).toString('hex');
}
function generateSalt() { return randomBytes(32).toString('hex'); }
function safeCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
function validateTokenFormat(token) {
  if (/^[A-Za-z0-9\-_./+=]+$/.test(token)) return { valid: true, type: 'api_key' };
  return { valid: false, reason: 'Token contains invalid characters' };
}

const loginAttempts = new Map();
const RATE_LIMIT_WINDOW_MS = 3600000;
function cleanupOldRateLimits() {
  const now = Date.now();
  for (const [id, record] of loginAttempts.entries()) {
    if (now - record.lastAttempt > RATE_LIMIT_WINDOW_MS) loginAttempts.delete(id);
  }
}
function getRateLimit(identifier) {
  const now = Date.now();
  const record = loginAttempts.get(identifier);
  if (!record) return { allowed: true, waitSeconds: 0 };
  if (now < record.nextAllowed) return { allowed: false, waitSeconds: Math.ceil((record.nextAllowed - now) / 1000) };
  return { allowed: true, waitSeconds: 0 };
}
function recordFailure(identifier) {
  const now = Date.now();
  const record = loginAttempts.get(identifier) || { count: 0, nextAllowed: now };
  record.count += 1;
  const delayMs = Math.min(60000 * Math.pow(2, record.count - 1), 3840000);
  record.nextAllowed = now + delayMs;
  record.lastAttempt = now;
  loginAttempts.set(identifier, record);
  return Math.ceil(delayMs / 1000);
}
function clearRateLimit(identifier) { loginAttempts.delete(identifier); }

export async function saveToken(token, force = false) {
  if (!token || typeof token !== 'string') throw new Error('Invalid token.');
  const trimmed = token.trim();
  if (trimmed.length < MIN_TOKEN_LEN) throw new Error(`Token too short. Must be at least ${MIN_TOKEN_LEN} characters.`);
  const validation = validateTokenFormat(trimmed);
  if (!validation.valid) throw new Error(validation.reason);
  try { await openDb(); } catch {}
  const existing = await getStoredToken();
  if (existing && !force) throw new Error('Token already saved. Run: apex new token <token> to update.');
  await setEncryptedConfig('token', trimmed);
}

export async function updateToken(newToken) {
  if (!newToken || typeof newToken !== 'string') throw new Error('Invalid token.');
  const trimmed = newToken.trim();
  if (trimmed.length < MIN_TOKEN_LEN) throw new Error(`Token too short. Must be at least ${MIN_TOKEN_LEN} characters.`);
  const validation = validateTokenFormat(trimmed);
  if (!validation.valid) throw new Error(validation.reason);
  const existing = await getStoredToken();
  if (!existing) throw new Error('No token saved. Run: apex authtoken <token> to set one.');
  await setEncryptedConfig('token', trimmed);
}

export async function getStoredToken() {
  try {
    return await getEncryptedConfig('token');
  } catch (err) {
    if (err.message.includes('not initialized')) return null;
    if (err.message.includes('DECRYPTION_FAILED')) throw err;
    throw err;
  }
}

export async function setPassword(password, force = false) {
  if (!password || typeof password !== 'string') throw new Error('Password must be a string.');
  if (password.length < MIN_PASS_LEN) throw new Error(`Password too short. Must be at least ${MIN_PASS_LEN} characters.`);
  try { await openDb(); } catch {}
  const existingHash = await getEncryptedConfig('passwordHash');
  if (existingHash && !force) throw new Error('Password already set. Run: apex new pass <password> to update.');
  const salt = generateSalt();
  const hash = hashPassword(password, salt);
  await setEncryptedConfig('passwordHash', hash);
  await setEncryptedConfig('passwordSalt', salt);
}

export async function updatePassword(newPassword) {
  if (!newPassword || typeof newPassword !== 'string') throw new Error('Password must be a string.');
  if (newPassword.length < MIN_PASS_LEN) throw new Error(`Password too short. Must be at least ${MIN_PASS_LEN} characters.`);
  try { await openDb(); } catch {}
  const existingHash = await getEncryptedConfig('passwordHash');
  const salt = await getEncryptedConfig('passwordSalt');
  if (!existingHash || !salt) throw new Error('No password set. Run: apex pass <password> to set one.');
  const newSalt = generateSalt();
  const newHash = hashPassword(newPassword, newSalt);
  await setEncryptedConfig('passwordHash', newHash);
  await setEncryptedConfig('passwordSalt', newSalt);
}

export async function verifyPassword(password, identifier = 'default') {
  if (!password || typeof password !== 'string') return { valid: false, rateLimited: false, waitSeconds: 0 };
  cleanupOldRateLimits();
  const limit = getRateLimit(identifier);
  if (!limit.allowed) return { valid: false, rateLimited: true, waitSeconds: limit.waitSeconds };
  const storedHash = await getEncryptedConfig('passwordHash');
  const salt = await getEncryptedConfig('passwordSalt');
  if (!storedHash || !salt) return { valid: false, rateLimited: false, waitSeconds: 0 };
  const computedHash = hashPassword(password, salt);
  if (safeCompare(computedHash, storedHash)) { clearRateLimit(identifier); return { valid: true, rateLimited: false, waitSeconds: 0 }; }
  const waitSeconds = recordFailure(identifier);
  return { valid: false, rateLimited: true, waitSeconds };
}

export async function hasPassword() {
  try {
    const hash = await getEncryptedConfig('passwordHash');
    const salt = await getEncryptedConfig('passwordSalt');
    return !!(hash && salt);
  } catch { return false; }
}

export async function clearPassword() {
  await deleteEncryptedConfig('passwordHash');
  await deleteEncryptedConfig('passwordSalt');
}
