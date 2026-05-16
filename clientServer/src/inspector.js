// clientServer/src/inspector.js
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createHash, randomBytes } from 'crypto';
import { C } from './colors.js';
import { CONFIG } from './config.js';
import { getRecentRequests, insertRequest } from './db/index.js';
import { hasPassword, verifyPassword, setPassword } from './auth.js';
import { INSPECTOR_CSS } from './styles.js';

const SESSION_TIMEOUT_MS = 86400000;
const MAX_BODY_SIZE = 100 * 1024 * 1024;
const CLEANUP_INTERVAL_MS = 3600000;
const MAX_SESSIONS = 100;
const MAX_POST_BODY = 1024 * 1024;
const PREVIEW_BODY_CHARS = 2048;
const BODY_DIR = path.join(os.tmpdir(), 'apextunnel-bodies');

let server = null;
let boundPort = null;
const clients = new Set();
const sessions = new Map();

if (!fs.existsSync(BODY_DIR)) {
  fs.mkdirSync(BODY_DIR, { recursive: true, mode: 0o700 });
}

function generateSessionId() { return randomBytes(32).toString('hex'); }
function hashSessionId(sessionId) { return createHash('sha256').update(sessionId).digest('hex'); }

function getSession(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/apex_session=([^;]+)/);
  if (!match) return null;
  const sessionId = match[1];
  const hashed = hashSessionId(sessionId);
  const session = sessions.get(hashed);
  if (!session) return null;
  if (Date.now() - session.createdAt > SESSION_TIMEOUT_MS) { sessions.delete(hashed); return null; }
  session.lastUsed = Date.now();
  return session;
}

function setSession(res) {
  const sessionId = generateSessionId();
  const hashed = hashSessionId(sessionId);
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed)[0];
    if (oldest) sessions.delete(oldest[0]);
  }
  sessions.set(hashed, { createdAt: Date.now(), lastUsed: Date.now() });
  res.setHeader('Set-Cookie', `apex_session=${sessionId}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'apex_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
}

function isAuthenticated(req) { return !!getSession(req); }

function requireAuth(req, res, next) {
  if (isAuthenticated(req)) return next();
  if (req.url.startsWith('/api/')) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
  } else {
    res.writeHead(302, { Location: '/login' });
    res.end();
  }
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
        if (req.url === '/setup' && req.method === 'GET') { handleSetupGet(req, res); return; }
        if (req.url === '/setup' && req.method === 'POST') { handleSetupPost(req, res); return; }
        if (req.url === '/login' && req.method === 'GET') { handleLoginGet(req, res); return; }
        if (req.url === '/login' && req.method === 'POST') { handleLoginPost(req, res); return; }
        if (req.url === '/logout') { handleLogout(req, res); return; }
        requireAuth(req, res, () => { handleProtected(req, res, getState); });
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

async function handleSetupGet(req, res) {
  if (await hasPassword()) { res.writeHead(302, { Location: '/login' }); res.end(); return; }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(renderSetupPage());
}

async function handleSetupPost(req, res) {
  if (await hasPassword()) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Password already set' }));
    return;
  }
  try {
    const body = await readPostBody(req);
    const data = JSON.parse(body);
    if (!data.password || data.password.length < 8) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Password must be at least 8 characters' }));
      return;
    }
    await setPassword(data.password);
    setSession(res);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
  }
}

async function handleLoginGet(req, res) {
  if (isAuthenticated(req)) { res.writeHead(302, { Location: '/' }); res.end(); return; }
  const needsSetup = !(await hasPassword());
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(renderLoginPage(needsSetup));
}

async function handleLoginPost(req, res) {
  try {
    const body = await readPostBody(req);
    const data = JSON.parse(body);
    if (!data.password) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Password required' }));
      return;
    }
    const identifier = req.socket.remoteAddress || 'unknown';
    const result = await verifyPassword(data.password, identifier);
    if (result.valid) {
      setSession(res);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } else if (result.rateLimited) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': String(result.waitSeconds) });
      res.end(JSON.stringify({ error: 'Too many attempts', retryAfter: result.waitSeconds }));
    } else {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid password' }));
    }
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message || 'Invalid request' }));
  }
}

function handleLogout(req, res) {
  const session = getSession(req);
  if (session) {
    const cookie = req.headers.cookie || '';
    const match = cookie.match(/apex_session=([^;]+)/);
    if (match) sessions.delete(hashSessionId(match[1]));
  }
  clearSession(res);
  res.writeHead(302, { Location: '/login' });
  res.end();
}

async function handleProtected(req, res, getState) {
  if (req.url === '/') {
    const state = getState();
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(renderDashboard(state));
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

// --- HTML Rendering ---
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}
function formatHeaders(headers) {
  if (!headers || typeof headers !== 'object') return null;
  const keys = Object.keys(headers);
  if (!keys.length) return null;
  const normalized = {};
  for (const k of keys) { normalized[k] = Array.isArray(headers[k]) ? headers[k].join(', ') : String(headers[k]); }
  return JSON.stringify(normalized, null, 2);
}
function truncateUrl(url, max) { return typeof url === 'string' && url.length > max ? url.slice(0, max) + '…' : url || ''; }
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function renderSetupPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ApexTunnel Inspector — Setup</title>
<style>${INSPECTOR_CSS}</style>
</head>
<body class="centered-page">
<div class="setup-box">
<h1>⚡ Inspector Setup</h1>
<p style="text-align:center;color:#666;font-size:13px;margin-bottom:24px;">Create a password to protect your dashboard</p>
<div class="field"><label>Password</label><input type="password" id="pass" placeholder="Min 8 characters" autocomplete="new-password"><div class="hint">Minimum 8 characters</div></div>
<div class="field"><label>Confirm Password</label><input type="password" id="confirm" placeholder="Repeat password" autocomplete="new-password"></div>
<div class="error" id="error"></div>
<button id="btn" onclick="submit()">Create Password</button>
</div>
<script>
async function submit() {
  const pass = document.getElementById('pass').value;
  const confirm = document.getElementById('confirm').value;
  const error = document.getElementById('error');
  const btn = document.getElementById('btn');
  if (pass.length < 8) { error.textContent = 'Password must be at least 8 characters'; error.style.display = 'block'; return; }
  if (pass !== confirm) { error.textContent = 'Passwords do not match'; error.style.display = 'block'; return; }
  btn.disabled = true;
  try {
    const res = await fetch('/setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
    const data = await res.json();
    if (data.success) { window.location.href = '/'; }
    else { error.textContent = data.error || 'Setup failed'; error.style.display = 'block'; btn.disabled = false; }
  } catch { error.textContent = 'Network error'; error.style.display = 'block'; btn.disabled = false; }
}
document.getElementById('confirm').addEventListener('keypress', e => { if (e.key === 'Enter') submit(); });
</script>
</body>
</html>`;
}

function renderLoginPage(needsSetup) {
  if (needsSetup) {
    return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="0;url=/setup"><title>Redirecting...</title></head><body style="background:#0a0a0a;"></body></html>`;
  }
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ApexTunnel Inspector — Login</title>
<style>${INSPECTOR_CSS}</style>
</head>
<body class="centered-page">
<div class="login-box">
<h1>⚡ Inspector Login</h1>
<div class="field"><label>Password</label><input type="password" id="pass" placeholder="Enter password" autocomplete="current-password"></div>
<div class="error" id="error"></div>
<div class="countdown" id="countdown">Try again in <span id="timer">0</span>s</div>
<button id="btn" onclick="login()">Login</button>
</div>
<script>
let countdownInterval = null, nextAttempt = 0;
function updateTimer() {
  const now = Math.floor(Date.now() / 1000);
  const remaining = Math.max(0, nextAttempt - now);
  document.getElementById('timer').textContent = remaining;
  if (remaining <= 0) {
    clearInterval(countdownInterval);
    document.getElementById('countdown').style.display = 'none';
    document.getElementById('btn').disabled = false;
    document.getElementById('error').style.display = 'none';
  }
}
async function login() {
  const pass = document.getElementById('pass').value;
  const error = document.getElementById('error');
  const btn = document.getElementById('btn');
  const countdown = document.getElementById('countdown');
  if (!pass) { error.textContent = 'Password required'; error.style.display = 'block'; return; }
  btn.disabled = true;
  try {
    const res = await fetch('/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
    const data = await res.json();
    if (data.success) { clearInterval(countdownInterval); window.location.href = '/'; }
    else if (res.status === 429 && data.retryAfter) {
      nextAttempt = Math.floor(Date.now() / 1000) + data.retryAfter;
      countdown.style.display = 'block'; updateTimer();
      countdownInterval = setInterval(updateTimer, 1000);
      error.textContent = data.error || 'Too many attempts'; error.style.display = 'block';
    } else { error.textContent = data.error || 'Login failed'; error.style.display = 'block'; btn.disabled = false; }
  } catch { error.textContent = 'Network error'; error.style.display = 'block'; btn.disabled = false; }
}
document.getElementById('pass').addEventListener('keypress', e => { if (e.key === 'Enter') login(); });
(async function checkStatus() {
  try {
    const res = await fetch('/login', { method: 'HEAD' });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '0');
      if (retryAfter) {
        nextAttempt = Math.floor(Date.now() / 1000) + retryAfter;
        document.getElementById('countdown').style.display = 'block';
        document.getElementById('btn').disabled = true;
        updateTimer(); countdownInterval = setInterval(updateTimer, 1000);
      }
    }
  } catch {}
})();
</script>
</body>
</html>`;
}

function renderDashboard(state) {
  const { info } = state;
  const safeInfo = {
    online: !!info?.online, email: info?.email || '—',
    isPremium: !!info?.isPremium, subdomain: info?.subdomain || '', port: info?.port || '',
  };
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ApexTunnel Inspector</title>
<style>${INSPECTOR_CSS}</style>
</head>
<body>
<div class="header">
<div>
<h1>⚡ ApexTunnel Inspector</h1>
<div class="meta">
<span><div class="dot ${safeInfo.online ? '' : 'offline'}"></div> ${safeInfo.online ? 'Online' : 'Connecting…'}</span>
<span>📧 ${escapeHtml(safeInfo.email)}</span>
<span>${safeInfo.isPremium ? '⭐ Premium' : '○ Free'}</span>
</div>
</div>
<a href="/logout" class="logout">Logout</a>
</div>
<div class="container">
<div class="status-bar">
<div>
<div class="label">Forwarding</div>
<div class="url">${safeInfo.subdomain ? 'https://' + escapeHtml(safeInfo.subdomain) + '.apextunnel.top → localhost:' + escapeHtml(safeInfo.port) : 'Pending…'}</div>
</div>
<div style="display: flex; gap: 8px; align-items: center;">
<div class="live-badge">Live</div>
<button class="btn primary" onclick="downloadLog()">Export</button>
</div>
</div>
<div class="stats">
<div class="stat-card"><div class="stat-label">Total Requests</div><div class="stat-value" id="total-count">0</div></div>
<div class="stat-card"><div class="stat-label">Requests / min</div><div class="stat-value" id="rate">0</div></div>
<div class="stat-card"><div class="stat-label">Avg Response Time</div><div class="stat-value" id="avg-time">—</div></div>
<div class="stat-card"><div class="stat-label">Error Rate</div><div class="stat-value" id="error-rate">0%</div></div>
</div>
<div class="filter-bar">
<input type="text" class="filter-input" id="filter-url" placeholder="Filter by URL..." oninput="applyFilters()">
<select class="filter-select" id="filter-method" onchange="applyFilters()">
<option value="">All Methods</option>
<option value="GET">GET</option><option value="POST">POST</option><option value="PUT">PUT</option>
<option value="PATCH">PATCH</option><option value="DELETE">DELETE</option><option value="HEAD">HEAD</option>
</select>
<select class="filter-select" id="filter-status" onchange="applyFilters()">
<option value="">All Status</option>
<option value="2xx">2xx Success</option><option value="3xx">3xx Redirect</option>
<option value="4xx">4xx Client Error</option><option value="5xx">5xx Server Error</option>
</select>
<button class="btn clear" onclick="clearFilters()">Clear</button>
</div>
<div class="table-wrapper">
<table>
<thead><tr><th class="time-col">Time</th><th class="method-col">Method</th><th class="url-col">Path</th><th class="status-col">Status</th><th class="dur-col">Duration</th></tr></thead>
<tbody><tr><td colspan="5" class="empty">Waiting for requests…</td></tr></tbody>
</table>
</div>
</div>
<script>
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B','KB','MB','GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
let allRequests = [];
const MAX_STORED = 500;
let activeDetailId = null;
function toggleDetail(id) {
  const row = document.getElementById(id);
  const isVisible = row.style.display !== 'none';
  document.querySelectorAll('.detail-row').forEach(r => r.style.display = 'none');
  if (!isVisible) { row.style.display = 'table-row'; activeDetailId = id; loadBodyPreview(id); }
  else { activeDetailId = null; }
}
function truncateUrl(url, max) { return url && url.length > max ? url.slice(0, max) + '…' : url || ''; }
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
function syntaxHighlightJson(json) {
      let str = typeof json === 'string' ? json : JSON.stringify(json, null, 2);
      return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/("(\\.|[^"])*"(\s*:)?)/g, m => {
          let cls = 'json-string';
          if (/:$/.test(m)) { cls = 'json-key'; m = m.slice(0,-1)+'</span>:'; return '<span class="'+cls+'">'+m; }
          return '<span class="'+cls+'">'+m+'</span>';
        })
        .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
        .replace(/\b(null)\b/g, '<span class="json-null">$1</span>')
        .replace(/\b(\d+\.?\d*)\b/g, '<span class="json-number">$1</span>');
    }
function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!'; btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
  });
}
function updateStats() {
  const total = allRequests.length;
  const now = Date.now(), oneMinAgo = now - 60000;
  const recentReqs = allRequests.filter(r => r._timestamp > oneMinAgo);
  const rate = recentReqs.length;
  const errors = allRequests.filter(r => r.status >= 400);
  const errorRate = total > 0 ? Math.round((errors.length / total) * 100) : 0;
  const avgTime = total > 0 ? Math.round(allRequests.reduce((s, r) => s + r.duration, 0) / total) : 0;
  document.getElementById('total-count').textContent = total;
  document.getElementById('rate').textContent = rate;
  document.getElementById('avg-time').textContent = avgTime + 'ms';
  document.getElementById('error-rate').textContent = errorRate + '%';
}
function downloadLog() {
  const json = JSON.stringify(allRequests, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'apex-requests-' + new Date().toISOString().slice(0,10) + '.json';
  a.click(); URL.revokeObjectURL(url);
}
function applyFilters() {
  const urlFilter = document.getElementById('filter-url').value.toLowerCase();
  const methodFilter = document.getElementById('filter-method').value;
  const statusFilter = document.getElementById('filter-status').value;
  document.querySelectorAll('.request-row').forEach(row => {
    const method = row.querySelector('.method-col .method').textContent;
    const url = row.querySelector('.url-col').textContent.toLowerCase();
    const status = parseInt(row.querySelector('.status-col').textContent) || 0;
    let show = true;
    if (urlFilter && !url.includes(urlFilter)) show = false;
    if (methodFilter && method !== methodFilter) show = false;
    if (statusFilter) { const sg = Math.floor(status / 100) + 'xx'; if (sg !== statusFilter) show = false; }
    row.classList.toggle('filtered', !show);
    const detail = row.nextElementSibling;
    if (detail && detail.classList.contains('detail-row')) detail.style.display = 'none';
  });
}
function clearFilters() {
  document.getElementById('filter-url').value = '';
  document.getElementById('filter-method').value = '';
  document.getElementById('filter-status').value = '';
  applyFilters();
}
async function loadBodyPreview(detailId) {
  const detailRow = document.getElementById(detailId);
  if (!detailRow) return;
  const reqData = allRequests.find(r => r._detailId === detailId);
  if (!reqData) return;
  if (reqData.reqBodyPath) {
    const reqBodyId = reqData.reqBodyPath.replace(/.*[/\\]/, '');
    const previewEl = detailRow.querySelector('.req-body-preview');
    if (previewEl && !previewEl.dataset.loaded) {
      try {
        const res = await fetch('/api/preview/' + reqBodyId);
        const data = await res.json();
        previewEl.innerHTML = syntaxHighlightJson(data.content);
        previewEl.dataset.loaded = 'true';
        if (data.truncated) { const link = previewEl.nextElementSibling; if (link) link.style.display = 'block'; }
      } catch {}
    }
  }
  if (reqData.resBodyPath) {
    const resBodyId = reqData.resBodyPath.replace(/.*[/\\]/, '');
    const previewEl = detailRow.querySelector('.res-body-preview');
    if (previewEl && !previewEl.dataset.loaded) {
      try {
        const res = await fetch('/api/preview/' + resBodyId);
        const data = await res.json();
        previewEl.innerHTML = syntaxHighlightJson(data.content);
        previewEl.dataset.loaded = 'true';
        if (data.truncated) { const link = previewEl.nextElementSibling; if (link) link.style.display = 'block'; }
      } catch {}
    }
  }
}
async function replayRequest(reqData) {
  const btn = document.getElementById('replay-btn-' + reqData._detailId);
  if (btn) { btn.textContent = 'Replaying...'; btn.disabled = true; }
  try {
    let bodyContent = null;
    if (reqData.reqBodyPath) {
      const reqBodyId = reqData.reqBodyPath.replace(/.*[/\\]/, '');
      const res = await fetch('/api/body/' + reqBodyId);
      bodyContent = await res.text();
    }
    const res = await fetch('/api/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method: reqData.method, url: reqData.url, headers: reqData.reqHeaders || {}, bodyPath: reqData.reqBodyPath, bodyContent })
    });
    const result = await res.json();
    const resultEl = document.getElementById('replay-result-' + reqData._detailId);
    if (resultEl) {
      const statusColor = result.status >= 400 ? '#ff4444' : '#00ff88';
      resultEl.innerHTML = '<div style="color:' + statusColor + ';font-weight:600;margin-bottom:4px;">Status: ' + (result.status || 'Error') + '</div><pre style="white-space:pre-wrap;word-break:break-all;">' + escapeHtml(result.body || result.error || '') + '</pre>';
      resultEl.style.display = 'block';
    }
  } catch (err) {
    const resultEl = document.getElementById('replay-result-' + reqData._detailId);
    if (resultEl) { resultEl.innerHTML = '<div style="color:#ff4444;">Replay failed: ' + escapeHtml(err.message) + '</div>'; resultEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.textContent = '↻ Replay'; btn.disabled = false; }
  }
}
function createDetailPanel(r, reqId) {
  const reqHeadersJson = r.reqHeaders && Object.keys(r.reqHeaders).length ? JSON.stringify(r.reqHeaders, null, 2) : null;
  const resHeadersJson = r.resHeaders && Object.keys(r.resHeaders).length ? JSON.stringify(r.resHeaders, null, 2) : null;
  const reqBodyId = r.reqBodyPath ? r.reqBodyPath.replace(/.*[/\\]/, '') : null;
  const resBodyId = r.resBodyPath ? r.resBodyPath.replace(/.*[/\\]/, '') : null;
  const reqBodyDownload = reqBodyId ? '<a href="/api/body/' + escapeHtml(reqBodyId) + '" target="_blank" style="color:#00aaff">Download request body (' + formatBytes(r.reqBodySize || 0) + ')</a>' : '';
  const resBodyDownload = resBodyId ? '<a href="/api/body/' + escapeHtml(resBodyId) + '" target="_blank" style="color:#00ff88">Download response body (' + formatBytes(r.resBodySize || 0) + ')</a>' : '';
  return '<div class="detail-panel">' +
    '<div class="detail-section"><h4>Request Headers <button class="copy-btn" onclick="copyToClipboard(' + JSON.stringify(reqHeadersJson || '').replace(/"/g, '&quot;') + ', this)">Copy</button></h4><pre>' + (reqHeadersJson ? syntaxHighlightJson(reqHeadersJson) : '<em class="empty-hint">No headers captured</em>') + '</pre></div>' +
    (reqBodyId || reqBodyDownload ? '<div class="detail-section"><h4>Request Body</h4><div class="body-preview req-body-preview" data-loaded="false"><em class="empty-hint">Loading preview...</em></div><div class="body-actions">' + reqBodyDownload + '</div></div>' : '') +
    '<div class="detail-section"><h4>Response Headers <button class="copy-btn" onclick="copyToClipboard(' + JSON.stringify(resHeadersJson || '').replace(/"/g, '&quot;') + ', this)">Copy</button></h4><pre>' + (resHeadersJson ? syntaxHighlightJson(resHeadersJson) : '<em class="empty-hint">No headers captured</em>') + '</pre></div>' +
    (resBodyId || resBodyDownload ? '<div class="detail-section"><h4>Response Body</h4><div class="body-preview res-body-preview" data-loaded="false"><em class="empty-hint">Loading preview...</em></div><div class="body-actions">' + resBodyDownload + '</div></div>' : '') +
    '<div class="detail-section"><h4>Actions</h4><div class="body-actions"><button class="btn primary" id="replay-btn-' + reqId + '" onclick="replayRequest(allRequests.find(r => r._detailId === \' + reqId + '\'))">↻ Replay</button></div><div class="replay-result" id="replay-result-' + reqId + '" style="display:none"></div></div>' +
  '</div>';
}
const tbody = document.querySelector('tbody');
const es = new EventSource('/api/stream');
function addRequestRow(r, isNew = true) {
  r._timestamp = r._timestamp || Date.now();
  r._detailId = r._detailId || ('req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7));
  const statusColor = r.status >= 500 ? '#ff4444' : r.status >= 400 ? '#ffcc00' : '#00ff88';
  const reqId = r._detailId;
  const rawTime = r.time || new Date().toISOString();
  const displayTime = rawTime.includes('T') ? rawTime.slice(11, 19) : rawTime;
  const tr = document.createElement('tr');
  tr.className = 'request-row';
  tr.dataset.method = r.method;
  tr.dataset.status = r.status;
  tr.onclick = () => toggleDetail(reqId);
  const escapedUrl = escapeHtml(truncateUrl(r.url, 60));
  const escapedMethod = escapeHtml(r.method);
  tr.innerHTML = '<td class="time-col">' + escapeHtml(displayTime) + '</td><td class="method-col"><span class="method ' + escapedMethod.toLowerCase() + '">' + escapedMethod + '</span></td><td class="url-col">' + escapedUrl + '</td><td class="status-col" style="color:' + statusColor + ';font-weight:600">' + r.status + '</td><td class="dur-col">' + r.duration + 'ms</td>';
  const detailTr = document.createElement('tr');
  detailTr.className = 'detail-row';
  detailTr.id = reqId;
  detailTr.style.display = 'none';
  detailTr.innerHTML = '<td colspan="5">' + createDetailPanel(r, reqId) + '</td>';
  if (tbody.querySelector('.empty')) tbody.innerHTML = '';
  if (isNew) { tbody.insertBefore(detailTr, tbody.firstChild); tbody.insertBefore(tr, tbody.firstChild); }
  else { tbody.appendChild(tr); tbody.appendChild(detailTr); }
  const allRows = tbody.querySelectorAll('.request-row');
  while (allRows.length > 50) {
    const lastRow = tbody.querySelectorAll('.request-row')[49];
    const lastDetail = lastRow?.nextElementSibling;
    if (lastDetail?.classList.contains('detail-row')) lastDetail.remove();
    lastRow?.remove();
  }
  applyFilters(); updateStats();
}
es.onmessage = e => {
  try {
    const r = JSON.parse(e.data);
    allRequests.push(r);
    while (allRequests.length > MAX_STORED) allRequests.shift();
    addRequestRow(r, true);
  } catch (err) { console.error('EventSource parse error:', err); }
};
es.onerror = () => { console.error('EventSource connection lost'); setTimeout(() => location.reload(), 3000); };
fetch('/api/requests').then(r => r.json()).then(data => {
  if (data.length > 0) {
    tbody.innerHTML = '';
    data.reverse().forEach(r => { allRequests.push(r); addRequestRow(r, false); });
  }
}).catch(err => console.error('Failed to load history:', err));
setInterval(updateStats, 5000); updateStats();
</script>
</body>
</html>`;
}
