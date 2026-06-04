import os from 'os';
import path from 'path';
import { JsonDb } from './json-db.js';
import { encrypt, decrypt } from './crypto.js';

export const DB_PATH = path.join(os.homedir(), '.apextunnel.db');
export const REQUESTS_DB_PATH = path.join(os.homedir(), '.apextunnel.requests.json');

const defaultConfigData = { config: {} };
const defaultRequestsData = { requests: [] };

let configDb = null;
let requestsDb = null;

export async function openDb() {
  if (configDb) return configDb;

  configDb = new JsonDb(DB_PATH, { encryptFn: encrypt, decryptFn: decrypt });
  await configDb.read(defaultConfigData);

  requestsDb = new JsonDb(REQUESTS_DB_PATH);
  await requestsDb.read(defaultRequestsData);

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
  if (configDb) configDb.write();
  if (requestsDb) requestsDb.write();
}

export async function closeDb() {
  persistDb();
  configDb = null;
  requestsDb = null;
}

export async function getEncryptedConfig(key) {
  await openDb();
  const value = configDb.get().config[key];
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.startsWith('v1:')) {
    return decrypt(value);
  }
  return value;
}


export async function setEncryptedConfig(key, value) {
  await openDb();
  configDb.get().config[key] = value;
  configDb.write();
}

export async function deleteEncryptedConfig(key) {
  await openDb();
  delete configDb.get().config[key];
  configDb.write();
}

export async function hasConfigKey(key) {
  await openDb();
  return key in configDb.get().config;
}

export async function migratePlaintextConfig() {
  await openDb();
  let migrated = 0;
  for (const [key, value] of Object.entries(configDb.get().config)) {
    if (typeof value === 'string' && !value.startsWith('v1:')) {
      configDb.get().config[key] = encrypt(value);
      migrated++;
    }
  }
  if (migrated > 0) {
    configDb.write();
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
  requestsDb.get().requests.push(entry);
  requestsDb.write();
  return entry;
}

export async function getRecentRequests(limit = 100) {
  await openDb();
  return requestsDb.get().requests.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export async function deleteOldRequests(cutoffTimestamp) {
  await openDb();
  const before = requestsDb.get().requests.length;
  requestsDb.get().requests = requestsDb.get().requests.filter(r => r.createdAt >= cutoffTimestamp);
  const deleted = before - requestsDb.get().requests.length;
  if (deleted > 0) requestsDb.write();
  return deleted;
}

export async function getPlainConfig(key) {
  await openDb();
  return configDb.get().config[key] ?? null;
}

export async function setPlainConfig(key, value) {
  await openDb();
  configDb.get().config[key] = value;
  configDb.write();
}
