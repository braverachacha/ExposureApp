import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import net from 'net';
import { spawn, exec } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ─── Helpers ───
function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
    server.on('error', reject);
  });
}

function httpRequest(options) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = Buffer.alloc(0);
      res.on('data', chunk => body = Buffer.concat([body, chunk]));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function portReady(port, host = '127.0.0.1', timeout = 10000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const sock = new net.Socket();
      sock.setTimeout(500);
      sock.once('connect', () => { sock.destroy(); resolve(); });
      sock.once('error', () => {
        sock.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        } else {
          setTimeout(tryConnect, 200);
        }
      });
      sock.once('timeout', () => {
        sock.destroy();
        if (Date.now() - start > timeout) {
          reject(new Error(`Port ${port} not ready after ${timeout}ms`));
        } else {
          setTimeout(tryConnect, 200);
        }
      });
      sock.connect(port, host);
    };
    tryConnect();
  });
}

async function killZombiesOnPort(port) {
  try {
    const { stdout } = await execAsync(`lsof -ti:${port} 2>/dev/null || true`);
    const pids = stdout.trim().split('\n').filter(Boolean);
    for (const pid of pids) {
      try { process.kill(Number(pid), 'SIGKILL'); } catch {}
    }
  } catch {}
}

// ─── Mock Auth API ───
function startMockAuth(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/internal/tunnel/connected' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              subdomain: data.subdomain || 'test-local',
              email: 'test@local.dev',
              isPremium: false,
            }));
          } catch {
            res.writeHead(400);
            res.end('Bad request');
          }
        });
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

// ─── Mock Local App ───
function startLocalApp(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/hello') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Hello from local app!');
        return;
      }
      if (req.url === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'ok', method: req.method }));
        return;
      }
      if (req.url === '/echo' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(`Echo: ${body}`);
        });
        return;
      }
      if (req.url === '/large') {
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        const chunk = Buffer.alloc(64 * 1024, 'x');
        let sent = 0;
        const sendChunk = () => {
          if (sent >= 1024 * 1024) {
            res.end();
            return;
          }
          res.write(chunk);
          sent += chunk.length;
          setImmediate(sendChunk);
        };
        sendChunk();
        return;
      }
      res.writeHead(404);
      res.end('Not found');
    });
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

async function waitForClientConnected(metricsPort, timeout = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await httpRequest({
        hostname: '127.0.0.1', port: metricsPort, path: '/health',
      });
      if (res.status === 200) {
        const json = JSON.parse(res.body.toString());
        if (json.activeConnections >= 1) return json;
      }
    } catch {}
    await wait(300);
  }
  throw new Error(`Client never connected after ${timeout}ms`);
}

describe('Local Integration Test', () => {
  let AUTH_PORT;
  let RELAY_TCP_PORT;
  let RELAY_HTTP_PORT;
  let LOCAL_APP_PORT;
  let METRICS_PORT;

  let authServer;
  let localApp;
  let relayProc;
  let clientProc;

  beforeAll(async () => {
    [AUTH_PORT, RELAY_TCP_PORT, RELAY_HTTP_PORT, LOCAL_APP_PORT, METRICS_PORT] = await Promise.all([
      getFreePort(), getFreePort(), getFreePort(), getFreePort(), getFreePort(),
    ]);

    await Promise.all([
      killZombiesOnPort(RELAY_TCP_PORT),
      killZombiesOnPort(RELAY_HTTP_PORT),
      killZombiesOnPort(METRICS_PORT),
    ]);
    await wait(300);

    authServer = await startMockAuth(AUTH_PORT);
    await portReady(AUTH_PORT);

    localApp = await startLocalApp(LOCAL_APP_PORT);
    await portReady(LOCAL_APP_PORT);

    // Save token
    const token = 'test_token_1234567890123456789012345678901234567890';
    const tokenProc = spawn('node', ['client.js', 'authtoken', token], {
      cwd: path.join(ROOT, 'clientServer'),
      env: { ...process.env, APEX_RELAY: '127.0.0.1', APEX_RELAY_PORT: String(RELAY_TCP_PORT) },
      stdio: 'pipe',
    });
    await new Promise(r => tokenProc.on('close', r));

    // Start relay
    relayProc = spawn('node', ['relay.js'], {
      cwd: path.join(ROOT, 'relayServer'),
      env: {
        ...process.env,
        API_URL: `http://127.0.0.1:${AUTH_PORT}`,
        INTERNAL_SECRET: 'test_secret',
        TCP_PORT: String(RELAY_TCP_PORT),
        HTTP_PORT: String(RELAY_HTTP_PORT),
        METRICS_PORT: String(METRICS_PORT),
        LOG_LEVEL: 'fatal',
        TLS_DISABLED: 'true',
      },
      stdio: 'pipe',
    });

    await portReady(RELAY_TCP_PORT);
    await portReady(RELAY_HTTP_PORT);
    await portReady(METRICS_PORT);

    // Start client
    clientProc = spawn('node', ['client.js', 'http', String(LOCAL_APP_PORT), '--subdomain', 'test-local'], {
      cwd: path.join(ROOT, 'clientServer'),
      env: {
        ...process.env,
        APEX_RELAY: '127.0.0.1',
        APEX_RELAY_PORT: String(RELAY_TCP_PORT),
      },
      stdio: 'pipe',
    });

    // Wait for client to actually register
    const health = await waitForClientConnected(METRICS_PORT, 15000);
    console.log('Client connected:', health);
  }, 60000);

  afterAll(async () => {
    clientProc?.kill('SIGKILL');
    relayProc?.kill('SIGKILL');
    authServer?.close();
    localApp?.close();
    await wait(200);
  });

  it('tunnels a simple GET request', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1', port: RELAY_HTTP_PORT, path: '/hello',
      headers: { host: 'test-local.localhost' },
    });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe('Hello from local app!');
  });

  it('tunnels a JSON response', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1', port: RELAY_HTTP_PORT, path: '/json',
      headers: { host: 'test-local.localhost' },
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body.toString());
    expect(json.message).toBe('ok');
    expect(json.method).toBe('GET');
  });

  it('tunnels a POST request with body', async () => {
    const body = 'test payload data';
    const res = await httpRequest({
      hostname: '127.0.0.1', port: RELAY_HTTP_PORT, path: '/echo', method: 'POST',
      headers: {
        host: 'test-local.localhost',
        'content-type': 'text/plain',
        'content-length': String(Buffer.byteLength(body)),
      },
      body,
    });
    expect(res.status).toBe(200);
    expect(res.body.toString()).toBe(`Echo: ${body}`);
  });

  it('tunnels a large binary response (1MB)', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1', port: RELAY_HTTP_PORT, path: '/large',
      headers: { host: 'test-local.localhost' },
    });
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1024 * 1024);
    expect(res.body[0]).toBe('x'.charCodeAt(0));
  }, 15000);

  it('returns 404 for disconnected subdomain', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1', port: RELAY_HTTP_PORT, path: '/hello',
      headers: { host: 'nonexistent.localhost' },
    });
    expect(res.status).toBe(404);
    expect(res.body.toString()).toContain('No Tunnel Found');
  });

  it('exposes health endpoint', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1', port: METRICS_PORT, path: '/health',
    });
    expect(res.status).toBe(200);
    const json = JSON.parse(res.body.toString());
    expect(json.status).toBe('healthy');
    expect(json.activeConnections).toBeGreaterThanOrEqual(1);
  });

  it('exposes metrics endpoint', async () => {
    const res = await httpRequest({
      hostname: '127.0.0.1', port: METRICS_PORT, path: '/metrics',
    });
    expect(res.status).toBe(200);
    const text = res.body.toString();
    expect(text).toContain('apex_requests_total');
    expect(text).toContain('apex_uptime_seconds');
  });
});