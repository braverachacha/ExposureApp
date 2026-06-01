// clientServer/src/auth.js
import { openDb } from './db/index.js';
import { getEncryptedConfig, setEncryptedConfig } from './db/index.js';

const MIN_TOKEN_LEN = 64;

function validateTokenFormat(token) {
  if (/^[A-Za-z0-9\-_./+=]+$/.test(token)) return { valid: true, type: 'api_key' };
  return { valid: false, reason: 'Token contains invalid characters' };
}

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
