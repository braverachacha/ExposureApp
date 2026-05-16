// clientServer/src/db/index.js
/**
 * LowDB-based storage with two separate files:
 *  - ~/.apextunnel.db          → Encrypted config (token, password, etc.)
 *  - ~/.apextunnel.requests.json → Plain request/response log
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { Low } from 'lowdb';
import { DataFile, JSONFile } from 'lowdb/node';
import { encrypt, decrypt } from './crypto.js';

// ── Paths ──
export const DB_PATH = path.join(os.homedir(), '.apextunnel.db');
export const REQUESTS_DB_PATH = path.join(os.homedir(), '.apextunnel.requests.json');

// ── Encrypted DataFile Adapter ──
// Uses lowdb's DataFile with custom parse/stringify for AES-256-GCM encryption.
// The file on disk is an encrypted blob, not readable JSON.
const encryptedAdapter = new DataFile(DB_PATH, {
  parse: (text) => {
    if (!text || !text.trim()) return null;
    try {
      const json = decrypt(text);
      return JSON.parse(json);
    } catch (err) {
      throw new Error(
        `DECRYPTION_FAILED: ${err.message}. ` +
        `The database was encrypted on a different device. ` +
        `Run "apex authtoken <token>" to re-sync.`
      );
    }
  },
  stringify: (data) => {
    const json = JSON.stringify(data);
    return encrypt(json);
  },
});

// ── Plain JSON Adapter for requests ──
const requestsAdapter = new JSONFile(REQUESTS_DB_PATH);

// ── Database Instances ──
let configDb = null;
let requestsDb = null;

// Default data shapes
const defaultConfigData = { config: {} };
const defaultRequestsData = { requests: [] };

export async function openDb() {
  if (configDb) return configDb;

  // Encrypted config DB
  configDb = new Low(encryptedAdapter, defaultConfigData);
  await configDb.read();
  if (!configDb.data) {
    configDb.data = structuredClone(defaultConfigData);
    await configDb.write();
  }

  // Plain requests DB
  requestsDb = new Low(requestsAdapter, defaultRequestsData);
  await requestsDb.read();
  if (!requestsDb.data) {
    requestsDb.data = structuredClone(defaultRequestsData);
    await requestsDb.write();
  }

  return configDb;
}

export async function openPlainDb() {
  return openDb();
}

export function getDb() {
  if (!configDb) throw new Error('Database not initialized. Call openDb() first.');
  return configDb;
}

export function getRequestsDb() {
  if (!requestsDb) throw new Error('Database not initialized. Call openDb() first.');
  return requestsDb;
}

export async function persistDb() {
  if (configDb) await configDb.write();
  if (requestsDb) await requestsDb.write();
}

export async function closeDb() {
  await persistDb();
  configDb = null;
  requestsDb = null;
}

// ── Encrypted Config API ──

export async function getEncryptedConfig(key) {
  await openDb();
  const value = configDb.data.config[key];
  if (value === undefined || value === null) return null;
  return value;
}

export async function setEncryptedConfig(key, value) {
  await openDb();
  configDb.data.config[key] = value;
  await configDb.write();
}

export async function deleteEncryptedConfig(key) {
  await openDb();
  delete configDb.data.config[key];
  await configDb.write();
}

export async function hasConfigKey(key) {
  await openDb();
  return key in configDb.data.config;
}

/**
 * Re-encrypt all plaintext config values.
 * With LowDB, values are already stored as encrypted strings,
 * so this mainly serves as a migration helper from the old sql.js format.
 */
export async function migratePlaintextConfig() {
  await openDb();
  let migrated = 0;
  for (const [key, value] of Object.entries(configDb.data.config)) {
    if (typeof value === 'string' && !value.startsWith('v1:')) {
      configDb.data.config[key] = encrypt(value);
      migrated++;
    }
  }
  if (migrated > 0) {
    await configDb.write();
    console.log(`[CRYPTO] Migrated ${migrated} plaintext config value(s).`);
  }
  return migrated;
}

// ── Request Log API ──

export async function insertRequest(reqData) {
  await openDb();
  const entry = {
    id: Date.now() + '-' + Math.random().toString(36).slice(2, 9),
    time: reqData.time,
    method: reqData.method,
    url: reqData.url,
    status: reqData.status ?? null,
    duration: reqData.duration ?? null,
    reqHeaders: reqData.reqHeaders ?? {},
    resHeaders: reqData.resHeaders ?? {},
    reqBodyPath: reqData.reqBodyPath ?? null,
    resBodyPath: reqData.resBodyPath ?? null,
    reqBodySize: reqData.reqBodySize ?? 0,
    resBodySize: reqData.resBodySize ?? 0,
    createdAt: Math.floor(Date.now() / 1000),
  };
  requestsDb.data.requests.push(entry);
  await requestsDb.write();
  return entry;
}

export async function getRecentRequests(limit = 100) {
  await openDb();
  return requestsDb.data.requests.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function deleteOldRequests(cutoffTimestamp) {
  await openDb();
  const before = requestsDb.data.requests.length;
  requestsDb.data.requests = requestsDb.data.requests.filter(r => r.createdAt >= cutoffTimestamp);
  const deleted = before - requestsDb.data.requests.length;
  if (deleted > 0) await requestsDb.write();
  return deleted;
}

process.on('exit', async () => {
  try { await persistDb(); } catch {}
});
