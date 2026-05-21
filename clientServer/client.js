#!/usr/bin/env node
// clientServer/client.js

import 'dotenv/config';
import fs from 'fs';
import os from 'os';
import path from 'path';
import http from 'http';
import { Readable } from 'node:stream';
import { parseArgs } from 'util';
import { C } from './src/colors.js';
import { CONFIG, validateConfig } from './src/config.js';
import {
  setConnecting, setOnline, setReconnecting,
  logRequest, destroyUI, uiActive, setRestartCallback,
  getState, setInspectorPort,
} from './src/cli.js';
import {
  getStoredToken, saveToken,
  setPassword, updatePassword, updateToken,
  hasPassword, verifyPassword,
} from './src/auth.js';
import { getClientErrorPage } from './src/clientError.js';
import { TunnelConnection } from './src/connection.js';
import { startInspector, stopInspector, logRequestToDb, storeBody } from './src/inspector.js';
import { initDatabase } from './src/db/init.js';
import { openDb } from './src/db/index.js';

const OLD_CONFIG_PATH = path.join(os.homedir(), '.apextunnel');

async function migrateOldConfig() {
  if (!fs.existsSync(OLD_CONFIG_PATH)) return;
  try {
    const oldData = JSON.parse(fs.readFileSync(OLD_CONFIG_PATH, 'utf8'));
    console.log(`${C.warning}○${C.reset} Found old .apextunnel config, migrating to encrypted DB...`);
    if (oldData.token && typeof oldData.token === 'string') {
      await openDb();
      await saveToken(oldData.token, true);
      if (oldData.passwordHash && oldData.passwordSalt) {
        console.log(`${C.warning}○${C.reset} Password needs reset: run 'apex pass <password>'`);
      }
    }
    fs.unlinkSync(OLD_CONFIG_PATH);
    console.log(`${C.success}✔${C.reset} Migration complete. Old config removed.`);
  } catch (err) {
    console.warn(`${C.warning}○${C.reset} Failed to migrate old config: ${err.message}`);
    console.log(`   ${C.dim}Delete ${OLD_CONFIG_PATH} manually if issues persist${C.reset}`);
  }
}

const dbInitResult = await initDatabase();
if (dbInitResult.error) {
  console.error(`${C.error}✖${C.reset} Database initialization failed: ${dbInitResult.error}`);
  process.exit(1);
}

try { validateConfig(); }
catch (err) { console.error(`${C.error}✖${C.reset} ${err.message}`); process.exit(1); }

const { relay, tls, local, app } = CONFIG;

const HELP = `
 ${C.brandBold}ApexTunnel v${app.version}${C.reset} — expose localhost to the internet

 ${C.brandBold}Usage:${C.reset}
   ${C.text}apex http <port>${C.reset}              ${C.dim}Expose a local port${C.reset}
   ${C.text}apex http <port> --subdomain <name>${C.reset}  ${C.dim}Expose with a custom subdomain${C.reset}
   ${C.text}apex authtoken <token>${C.reset}     ${C.dim}Save your auth token${C.reset}
   ${C.text}apex new token <token>${C.reset}     ${C.dim}Update auth token${C.reset}
   ${C.text}apex pass <password>${C.reset}       ${C.dim}Set dashboard password${C.reset}
   ${C.text}apex new pass <password>${C.reset}   ${C.dim}Update dashboard password${C.reset}
   ${C.text}apex status${C.reset}                ${C.dim}Show saved token & relay info${C.reset}
   ${C.text}apex help${C.reset}                  ${C.dim}Show this message${C.reset}

 ${C.brandBold}Examples:${C.reset}
   ${C.dim}apex http 3000${C.reset}
   ${C.dim}apex http 3000 --subdomain myapp${C.reset}
   ${C.dim}apex authtoken eyJhbGciOiJIUzI1NiJ9...${C.reset}
   ${C.dim}apex pass mysecret123${C.reset}
   ${C.dim}apex new pass newsecret123${C.reset}

 ${C.brandBold}Env overrides:${C.reset}
   ${C.text}APEX_RELAY${C.reset}       ${C.dim}Relay hostname (default: relay.apextunnel.top)${C.reset}
   ${C.text}APEX_RELAY_PORT${C.reset}  ${C.dim}Relay port (default: 9000)${C.reset}
   ${C.text}APEX_TLS${C.reset}         ${C.dim}Enable TLS on tunnel (default: false)${C.reset}
   ${C.text}APEX_TLS_CA${C.reset}      ${C.dim}Path to CA certificate for self-signed TLS${C.reset}
   ${C.text}APEX_LOCAL_HOST${C.reset}  ${C.dim}Local app hostname (default: localhost)${C.reset}
`.trimStart();

const argv = process.argv.slice(2);
const [cmd = ''] = argv;

if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') { process.stdout.write(HELP); process.exit(0); }
if (cmd === '--version' || cmd === '-v') { console.log(`${C.brandBold}apex v${app.version}${C.reset}`); process.exit(0); }

if (cmd === 'authtoken') {
  const rawToken = argv[1];
  if (!rawToken || !rawToken.trim()) { console.error(`${C.error}✖${C.reset} ${C.text}Usage:${C.reset} apex authtoken <token>`); process.exit(1); }
  try { await saveToken(rawToken); console.log(`${C.success}✔${C.reset} Authtoken saved successfully.`); process.exit(0); }
  catch (err) { console.error(`${C.error}✖${C.reset} ${sanitizeErrorMessage(err.message)}`); process.exit(1); }
}

if (cmd === 'new') {
  const subCmd = argv[1];
  const value = argv[2];
  if (subCmd === 'token') {
    if (!value || !value.trim()) { console.error(`${C.error}✖${C.reset} ${C.text}Usage:${C.reset} apex new token <token>`); process.exit(1); }
    try { await updateToken(value.trim()); console.log(`${C.success}✔${C.reset} Token updated successfully.`); process.exit(0); }
    catch (err) { console.error(`${C.error}✖${C.reset} ${err.message}`); process.exit(1); }
  }
  if (subCmd === 'pass' || subCmd === 'password') {
    if (!value || !value.trim()) { console.error(`${C.error}✖${C.reset} ${C.text}Usage:${C.reset} apex new pass <password>`); process.exit(1); }
    try { await updatePassword(value.trim()); console.log(`${C.success}✔${C.reset} Password updated successfully.`); process.exit(0); }
    catch (err) { console.error(`${C.error}✖${C.reset} ${err.message}`); process.exit(1); }
  }
  console.error(`${C.error}✖${C.reset} Unknown 'new' subcommand: "${subCmd}"`);
  console.error(`   ${C.dim}Available: token, pass${C.reset}`);
  process.exit(1);
}

if (cmd === 'pass' || cmd === 'password') {
  const rawPass = argv[1];
  if (!rawPass || !rawPass.trim()) { console.error(`${C.error}✖${C.reset} ${C.text}Usage:${C.reset} apex pass <password>`); process.exit(1); }
  try {
    await setPassword(rawPass.trim());
    console.log(`${C.success}✔${C.reset} Password set successfully.`);
    process.exit(0);
  } catch (err) {
    if (err.message.includes('already set')) {
      console.error(`${C.error}✖${C.reset} ${err.message}`);
      console.error(`   ${C.dim}Run: apex new pass <password>${C.reset}`);
    } else { console.error(`${C.error}✖${C.reset} ${err.message}`); }
    process.exit(1);
  }
}

if (cmd === 'status') {
  let stored = null, decryptionError = false;
  try { stored = await getStoredToken(); }
  catch (err) { if (err.message.includes('DECRYPTION_FAILED')) decryptionError = true; }
  if (decryptionError) {
    console.log(`${C.warning}○${C.reset} Encrypted token cannot be decrypted.`);
    console.log(`   ${C.dim}This usually means the database was moved to a different device.${C.reset}`);
    console.log(`   ${C.dim}Run: apex authtoken <token> to re-sync.${C.reset}`);
  } else if (!stored) {
    console.log(`${C.warning}○${C.reset} No auth token saved.`);
    console.log(`   ${C.dim}Run: apex authtoken <token>${C.reset}`);
  } else {
    const masked = stored.slice(0, 8) + '••••••••' + stored.slice(-4);
    console.log(`${C.success}✔${C.reset} Token : ${C.text}${masked}${C.reset}`);
    console.log(`   ${C.dim}Relay : ${relay.host}:${relay.port} ${tls.enabled ? '(TLS)' : ''}${C.reset}`);
  }
  const passStatus = await hasPassword();
  console.log(`   ${C.dim}Password: ${passStatus ? 'Set' : 'Not set'}${C.reset}`);
  if (dbInitResult.cleaned > 0) console.log(`   ${C.dim}DB cleanup: ${dbInitResult.cleaned} old rows removed${C.reset}`);
  if (dbInitResult.migrated > 0) console.log(`   ${C.dim}Crypto migration: ${dbInitResult.migrated} value(s) encrypted${C.reset}`);
  process.exit(0);
}

if (cmd !== 'http') {
  console.error(`${C.error}✖${C.reset} Unknown command: "${cmd}". Run: apex help`);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  args: argv.slice(1),
  options: { subdomain: { type: 'string', default: '' } },
  allowPositionals: true, strict: true,
});

const rawPort = positionals[0] ?? String(local.defaultPort);
const localPort = Number(rawPort);
if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
  console.error(`${C.error}✖${C.reset} Invalid port: "${rawPort}". Must be 1–65535.`);
  process.exit(1);
}

let token;
try { token = await getStoredToken(); }
catch (err) {
  if (err.message.includes('DECRYPTION_FAILED')) {
    console.error(`${C.error}✖${C.reset} Cannot decrypt stored token.`);
    console.error(`   ${C.dim}The database was likely encrypted on a different device.${C.reset}`);
    console.error(`   ${C.dim}Run: apex authtoken <token> to re-sync to this machine.${C.reset}`);
    process.exit(1);
  }
  throw err;
}
if (!token) { console.error(`${C.error}✖${C.reset} No auth token found. Run: apex authtoken <token>`); process.exit(1); }

const activeRequests = new Map();
setConnecting(String(localPort));

const tunnel = new TunnelConnection({
  host: relay.host, port: relay.port, token,
  subdomain: values.subdomain || '', localPort,
  useTls: tls.enabled, caPath: tls.caPath,
  detectTls: tls.detectMode,
  onRegistered: (info) => { setOnline({ ...info, port: String(localPort) }); },
  onError: (err) => {
    if (err.type === 'reconnecting') { setReconnecting(); return; }
    if (err.code === 'SUBDOMAIN_IN_USE') { setReconnecting(); return; }
    destroyUI();
    console.error(`${C.error}✖${C.reset} ${sanitizeErrorMessage(String(err.message ?? 'Unknown server error'))}`);
    process.exit(1);
  },
  onRequest: async (msg) => {
    if (msg.type === 'request') { await proxyRequest(msg); }
    else if (msg.type === 'bodyChunk') {
      const req = activeRequests.get(msg.id);
      if (req && !req.bodyComplete) {
        if (req.localReq) { const writable = req.localReq.write(msg.data); if (!writable) req.paused = true; }
        else { req.earlyChunks.push(msg.data); }
        if (!req.reqBodyTruncated) {
          req.reqBodySize += msg.data.length;
          if (req.reqBodySize > 100 * 1024 * 1024) req.reqBodyTruncated = true;
          else req.reqBodyChunks.push(Buffer.from(msg.data));
        }
      }
    } else if (msg.type === 'bodyEnd') {
      const req = activeRequests.get(msg.id);
      if (req) { req.bodyComplete = true; if (req.localReq) req.localReq.end(); }
    }
  },
  logger: uiActive ? { error: () => {}, warn: () => {}, info: () => {} } : console,
});

tunnel.connect();
setRestartCallback(() => { tunnel.disconnect(); setTimeout(() => tunnel.connect(), 500); });

const inspectorPort = await startInspector(() => getState());
if (inspectorPort) setInspectorPort(inspectorPort);

const HOP_BY_HOP = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade']);

function sanitizeErrorMessage(msg) {
  if (typeof msg !== 'string') return 'An error occurred';
  msg = msg.replace(/[/\\][^\s]*/g, '[path]');
  msg = msg.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '[ip]');
  if (msg.length > 200) msg = msg.substring(0, 197) + '...';
  return msg;
}

function normalizePath(urlPath) {
  if (typeof urlPath !== 'string') return '/';
  if (!urlPath.startsWith('/')) return '/';
  let decoded;
  try { decoded = decodeURIComponent(urlPath); } catch { return '/'; }
  const segments = [];
  for (const segment of decoded.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') { segments.pop(); continue; }
    segments.push(segment);
  }
  return '/' + segments.join('/');
}

function send502(requestId, method, safePath, localReq) {
  try { localReq?.destroy(); } catch {}
  const html = getClientErrorPage(localPort);
  tunnel.sendResponseStart(requestId, 502, { 'content-type': 'text/html', 'content-length': String(Buffer.byteLength(html)) }, true);
  tunnel.sendBodyChunk(requestId, Buffer.from(html));
  tunnel.sendBodyEnd(requestId);
  logRequest(method, safePath, 502, 0, { reqHeaders: {}, resHeaders: { 'content-type': 'text/html' } });
}

async function finishLog(msg, safePath, status, duration, reqState) {
  const logData = {
    time: new Date().toISOString(), method: msg.method, url: safePath, status, duration,
    reqHeaders: msg.headers, resHeaders: reqState.resHeaders || {},
    reqBodyPath: null, resBodyPath: null,
    reqBodySize: reqState.reqBodySize, resBodySize: reqState.resBodySize,
  };
  if (reqState.reqBodyChunks.length > 0 && !reqState.reqBodyTruncated) {
    const stream = new Readable();
    stream.push(Buffer.concat(reqState.reqBodyChunks)); stream.push(null);
    await new Promise(resolve => {
      storeBody(stream, 100 * 1024 * 1024, (err, _size, _truncated, filePath) => {
        if (!err && filePath) logData.reqBodyPath = filePath; resolve();
      });
    });
  }
  if (reqState.resBodyChunks.length > 0 && !reqState.resBodyTruncated) {
    const stream = new Readable();
    stream.push(Buffer.concat(reqState.resBodyChunks)); stream.push(null);
    await new Promise(resolve => {
      storeBody(stream, 100 * 1024 * 1024, (err, _size, _truncated, filePath) => {
        if (!err && filePath) logData.resBodyPath = filePath; resolve();
      });
    });
  }
  logRequest(msg.method, safePath, status, duration, { reqHeaders: msg.headers, resHeaders: reqState.resHeaders || {} });
  await logRequestToDb(logData);
}

async function proxyRequest(msg) {
  const reqState = {
    bodyComplete: !msg.bodyExpected, localReq: null, earlyChunks: [], paused: false,
    responseStarted: false, timedOut: false, reqBodyChunks: [], reqBodySize: 0, reqBodyTruncated: false,
    resBodyChunks: [], resBodySize: 0, resBodyTruncated: false, resHeaders: {},
  };
  activeRequests.set(msg.id, reqState);
  const safePath = normalizePath(msg.url);
  reqState.timeout = setTimeout(() => {
    if (!activeRequests.has(msg.id)) return;
    reqState.timedOut = true;
    activeRequests.delete(msg.id);
    if (!reqState.responseStarted) send502(msg.id, msg.method, safePath, reqState.localReq);
    else { try { reqState.localReq?.destroy(); } catch {} }
  }, 60000);

  const headers = {};
  for (const [key, val] of Object.entries(msg.headers ?? {})) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers[key] = val;
  }
  headers['host'] = `${local.host}:${localPort}`;
  const startTime = performance.now();

  const localReq = http.request({ hostname: local.host, port: localPort, path: safePath, method: msg.method, headers }, (localRes) => {
    if (reqState.timedOut) { localRes.destroy(); return; }
    const noBodyStatus = [204, 304];
    const hasBody = !noBodyStatus.includes(localRes.statusCode) && msg.method !== 'HEAD';
    reqState.resHeaders = localRes.headers;
    tunnel.sendResponseStart(msg.id, localRes.statusCode, localRes.headers, hasBody);
    reqState.responseStarted = true;
    if (!hasBody) {
      const duration = Math.round(performance.now() - startTime);
      finishLog(msg, safePath, localRes.statusCode, duration, reqState);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
      return;
    }
    localRes.on('data', (chunk) => {
      tunnel.sendBodyChunk(msg.id, chunk);
      if (!reqState.resBodyTruncated) {
        reqState.resBodySize += chunk.length;
        if (reqState.resBodySize > 100 * 1024 * 1024) reqState.resBodyTruncated = true;
        else reqState.resBodyChunks.push(Buffer.from(chunk));
      }
    });
    localRes.on('end', () => {
      if (reqState.timedOut) return;
      const duration = Math.round(performance.now() - startTime);
      tunnel.sendBodyEnd(msg.id);
      finishLog(msg, safePath, localRes.statusCode, duration, reqState);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
    });
    localRes.on('error', (err) => {
      if (reqState.timedOut) return;
      console.error(`[PROXY] Response stream error: ${err.message}`);
      tunnel.sendBodyEnd(msg.id);
      finishLog(msg, safePath, 502, 0, reqState);
      clearTimeout(reqState.timeout);
      activeRequests.delete(msg.id);
    });
  });

  reqState.localReq = localReq;
  localReq.on('drain', () => { reqState.paused = false; });
  if (reqState.earlyChunks.length > 0) {
    for (const chunk of reqState.earlyChunks) { const writable = localReq.write(chunk); if (!writable) reqState.paused = true; }
    reqState.earlyChunks = [];
  }
  if (reqState.bodyComplete) localReq.end();
  localReq.on('error', (err) => {
    if (reqState.timedOut) return;
    console.error(`[PROXY ERROR] ${msg.method} ${safePath} -> ${local.host}:${localPort}: ${err.message}`);
    clearTimeout(reqState.timeout);
    activeRequests.delete(msg.id);
    send502(msg.id, msg.method, safePath, localReq);
    finishLog(msg, safePath, 502, 0, reqState);
  });
}

const gracefulExit = () => { stopInspector(); tunnel.disconnect(); destroyUI(); process.exit(0); };
process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);
