import fs from 'fs';
import os from 'os';
import path from 'path';
import { Low } from 'lowdb';
import { DataFile, JSONFile } from 'lowdb/node';
import { encrypt, decrypt } from './crypto.js';

export const DB_PATH = path.join(os.homedir(), '.apextunnel.db');
export const REQUESTS_DB_PATH = path.join(os.homedir(), '.apextunnel.requests.json');

const encryptedAdapter = new DataFile(DB_PATH, {
  parse: (text) => {
    if (!text || !text.trim()) return null;
    try {
      const json = decrypt(text);
      return JSON.parse(json);
    } catch (err) {
      throw new Error(
        `DECRYPTION_FAILED: ${err.message}. ` +
        `Run "apex authtoken <token>" to re-sync.`
      );
    }
  },
  stringify: (data) => {
    const json = JSON.stringify(data);
    return encrypt(json);
  },
});

const requestsAdapter = new JSONFile(REQUESTS_DB_PATH);

let configDb = null;
let requestsDb = null;

const defaultConfigData = { config: {} };
const defaultRequestsData = { requests: [] };

export async function openDb() {
  if (configDb) return configDb;

  configDb = new Low(encryptedAdapter, defaultConfigData);
  await configDb.read();
  if (!configDb.data) {
    configDb.data = structuredClone(defaultConfigData);
    await configDb.write();
  }

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

export async function getEncryptedConfig(key) {
  await openDb();
  const encryptedValue = configDb.data.config[key];
  if (encryptedValue === undefined || encryptedValue === null) return null;
  if (typeof encryptedValue !== 'string' || !encryptedValue.startsWith('v1:')) {
    return encryptedValue;
  }
  return decrypt(encryptedValue);
}

export async function setEncryptedConfig(key, value) {
  await openDb();
  const encrypted = encrypt(value);
  configDb.data.config[key] = encrypted;
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

// --- Plain config (for user preferences, not encrypted) ---

export async function getPlainConfig(key) {
  await openDb();
  return configDb.data.config[key] ?? null;
}

export async function setPlainConfig(key, value) {
  await openDb();
  configDb.data.config[key] = value;
  await configDb.write();
}


process.on('exit', async () => {
  try { await persistDb(); } catch {}
});
