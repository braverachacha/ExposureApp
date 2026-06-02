// clientServer/src/inspector.js
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomBytes } from 'crypto';
import { C } from './colors.js';
import { CONFIG } from './config.js';
import { getRecentRequests, insertRequest } from './db/index.js';
import { getPlainConfig, setPlainConfig } from './db/index.js';
import { generateCSS } from './styles.js';
import { inspectorPage } from './pages/inspectorPage.js';

const MAX_BODY_SIZE = 100 * 1024 * 1024;
const CLEANUP_INTERVAL_MS = 3600000;
const MAX_POST_BODY = 1024 * 1024;
const PREVIEW_BODY_CHARS = 2048;
const BODY_DIR = path.join(os.tmpdir(), 'apextunnel-bodies');

let server = null;
let boundPort = null;
const clients = new Set();

if (!fs.existsSync(BODY_DIR)) {
  fs.mkdirSync(BODY_DIR, { recursive: true, mode: 0o700 });
}

function readPostBody(req, maxSize = MAX_POST_BODY) {
  return new Promise((resolve, reject) => {
    let body = '';
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxSize) { req.destroy(); reject(new Error('Request body too large')); return; }
      body += chunk;
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

export function storeBody(stream, maxSize, callback) {
  const id = randomBytes(16).toString('hex');
  const filePath = path.join(BODY_DIR, id);
  const writeStream = fs.createWriteStream(filePath, { mode: 0o600 });
  let size = 0;
  let truncated = false;
  let ended = false;
  function done(err, finalSize, isTruncated, filePath) {
    if (ended) return;
    ended = true;
    callback(err, finalSize, isTruncated, filePath);
  }
  stream.on('data', (chunk) => {
    if (truncated) return;
    size += chunk.length;
    if (size > maxSize) {
      truncated = true;
      writeStream.destroy();
      fs.unlink(filePath, () => {});
      done(null, size, true);
      return;
    }
    writeStream.write(chunk);
  });
  stream.on('end', () => {
    if (!truncated) {
      writeStream.end(() => { done(null, size, false, filePath); });
    }
  });
  stream.on('error', (err) => {
    writeStream.destroy();
    fs.unlink(filePath, () => {});
    done(err, size, true);
  });
}

function cleanupOldBodies() {
  const cutoff = Date.now() - 86400000;
  try {
    const files = fs.readdirSync(BODY_DIR);
    for (const file of files) {
      const filePath = path.join(BODY_DIR, file);
      try {
        const stats = fs.statSync(filePath);
        if (stats.mtimeMs < cutoff) fs.unlinkSync(filePath);
      } catch {}
    }
  } catch {}
}

setInterval(cleanupOldBodies, CLEANUP_INTERVAL_MS);

// --- Request logging to DB (LowDB) ---

export async function logRequestToDb(reqData) {
  try {
    await insertRequest({
      time: reqData.time, method: reqData.method, url: reqData.url,
      status: reqData.status, duration: reqData.duration,
      reqHeaders: reqData.reqHeaders ?? {}, resHeaders: reqData.resHeaders ?? {},
      reqBodyPath: reqData.reqBodyPath ?? null, resBodyPath: reqData.resBodyPath ?? null,
      reqBodySize: reqData.reqBodySize ?? 0, resBodySize: reqData.resBodySize ?? 0,
    });
    broadcast(reqData);
  } catch (err) {
    console.error('Failed to log request:', err.message);
  }
}

export async function getRecentRequestsFromDb(limit = 100) {
  try {
    const rows = await getRecentRequests(limit);
    return rows.map(r => ({
      time: r.time, method: r.method, url: r.url, status: r.status, duration: r.duration,
      reqHeaders: r.reqHeaders || {}, resHeaders: r.resHeaders || {},
      reqBodyPath: r.reqBodyPath, resBodyPath: r.resBodyPath,
      reqBodySize: r.reqBodySize, resBodySize: r.resBodySize,
    }));
  } catch { return []; }
}

// --- Inspector Server ---

export async function startInspector(getState) {
  const { portStart, portEnd, host } = CONFIG.inspector;
  for (let port = portStart; port <= portEnd; port++) {
    try {
      server = http.createServer((req, res) => {
        const remoteAddr = req.socket.remoteAddress;
        if (!remoteAddr?.match(/^(127\.0\.0\.1|::1|::ffff:127\.0\.0\.1)$/)) {
          res.writeHead(403); res.end('Forbidden'); return;
        }
        if (req.url === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
          return;
        }
        handleRoutes(req, res, getState);
      });
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); resolve(); });
      });
      boundPort = port;
      return boundPort;
    } catch (err) {
      if (err.code === 'EADDRINUSE') continue;
      throw err;
    }
  }
  console.log(`${C.warning}○${C.reset} No free inspector port in range ${portStart}–${portEnd}`);
  return null;
}

async function getCurrentTheme() {
  const stored = await getPlainConfig('inspectorTheme');
  return stored === 'dark' ? 'dark' : 'teal';
}

async function handleRoutes(req, res, getState) {
  if (req.url === '/') {
    const state = getState();
    const theme = await getCurrentTheme();
    const css = generateCSS(theme);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(inspectorPage(state, css, theme));
    return;
  }
  if (req.url === '/api/theme' && req.method === 'GET') {
    const theme = await getCurrentTheme();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ theme }));
    return;
  }
  if (req.url === '/api/theme' && req.method === 'POST') {
    try {
      const body = await readPostBody(req);
      const data = JSON.parse(body);
      const theme = data.theme === 'dark' ? 'dark' : 'teal';
      await setPlainConfig('inspectorTheme', theme);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ theme }));
    } catch {
      res.writeHead(400);
      res.end('Bad request');
    }
    return;
  }
  if (req.url === '/api/requests') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    const dbRequests = await getRecentRequestsFromDb(100);
    res.end(JSON.stringify(dbRequests));
    return;
  }
  if (req.url === '/api/stream') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  if (req.url.startsWith('/api/body/')) {
    const bodyId = req.url.slice('/api/body/'.length).replace(/[^a-f0-9]/g, '');
    const filePath = path.join(BODY_DIR, bodyId);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
    req.on('close', () => readStream.destroy());
    return;
  }
  if (req.url.startsWith('/api/preview/')) {
    const bodyId = req.url.slice('/api/preview/'.length).replace(/[^a-f0-9]/g, '');
    const filePath = path.join(BODY_DIR, bodyId);
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const stats = fs.statSync(filePath);
      const size = Math.min(stats.size, PREVIEW_BODY_CHARS);
      const buf = Buffer.alloc(size);
      const fd = fs.openSync(filePath, 'r');
      fs.readSync(fd, buf, 0, size, 0);
      fs.closeSync(fd);
      const content = buf.toString('utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ content, truncated: stats.size > PREVIEW_BODY_CHARS, fullSize: stats.size }));
    } catch {
      res.writeHead(500);
      res.end('Failed to read body');
    }
    return;
  }
  if (req.url === '/api/replay' && req.method === 'POST') {
    handleReplay(req, res, getState);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
}

async function handleReplay(req, res, getState) {
  try {
    const body = await readPostBody(req, 1024 * 1024);
    const data = JSON.parse(body);
    const { method, url, headers, bodyPath, bodyContent } = data;
    const state = getState();
    const localPort = state?.info?.port || CONFIG.local.defaultPort;
    const localHost = CONFIG.local.host;
    const targetHeaders = { ...headers };
    delete targetHeaders['host'];
    delete targetHeaders['content-length'];
    let payload = null;
    if (bodyContent) {
      payload = Buffer.from(bodyContent, 'utf8');
    } else if (bodyPath) {
      const filePath = path.join(BODY_DIR, path.basename(bodyPath).replace(/[^a-f0-9]/g, ''));
      if (fs.existsSync(filePath)) payload = fs.readFileSync(filePath);
    }
    if (payload) targetHeaders['content-length'] = String(payload.length);
    const proxyReq = http.request({
      hostname: localHost, port: localPort, path: url,
      method: method || 'GET', headers: targetHeaders,
    }, (proxyRes) => {
      let responseBody = '';
      proxyRes.on('data', chunk => responseBody += chunk);
      proxyRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: proxyRes.statusCode, headers: proxyRes.headers, body: responseBody.slice(0, 50000) }));
      });
    });
    proxyReq.on('error', (err) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    });
    if (payload) proxyReq.write(payload);
    proxyReq.end();
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Invalid replay request' }));
  }
}

export function broadcast(request) {
  if (!clients.size) return;
  const data = JSON.stringify(request);
  for (const res of clients) {
    try { res.write(`data: ${data}\n\n`); }
    catch { clients.delete(res); }
  }
}

export function stopInspector() {
  if (!server) return;
  for (const res of clients) {
    try { res.write('event: close\ndata: shutting down\n\n'); res.end(); }
    catch {}
  }
  clients.clear();
  setTimeout(() => {
    server.close(() => { server = null; boundPort = null; });
  }, 500);
}

export function getInspectorPort() { return boundPort; }
