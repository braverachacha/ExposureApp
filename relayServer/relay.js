// relayServer/relay.js 

import tls from 'tls';
import http from 'http';
import https from 'https';
import crypto from 'crypto';
import 'dotenv/config';
import logger from './logger.js';
import { handleRegister } from './handlers/register.js';
import { errorPage } from './pages/errorPages.js';
import {
  ProtocolParser, FRAME_TYPES,
  encodeJson, encodeRequestStart, encodeBodyChunk, encodeBodyEnd, encodePong,
} from './src/protocol.js';
import { ConnectionManager } from './src/connectionManager.js';
import { RateLimiter } from './src/rateLimiter.js';
import { getClientIp, sanitizeHeaders, escapeHtml } from './src/security.js';
import { metrics } from './src/metrics.js';
import { BackpressureController } from './src/backpressure.js';
import { getTlsOptions } from './src/tls.js';
import { CONFIG, validateConfig } from './src/config.js';
import { C } from './src/colors.js';

try {
  validateConfig();
} catch (err) {
  console.error(`${C.error}✖${C.reset} ${err.message}`);
  process.exit(1);
}

const {
  ports: { tcp: TCP_PORT, http: HTTP_PORT, metrics: METRICS_PORT },
  limits: {
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
    maxBodySize: MAX_BODY_SIZE,
    maxHeadersSize: MAX_REQUEST_HEADERS_SIZE,
    maxConcurrentRequests: MAX_CONCURRENT_REQUESTS,
    maxBufferedBytes: MAX_BUFFERED_BYTES,
    regTimeoutMs: REG_TIMEOUT_MS,
  },
} = CONFIG;

const pendingRequests = new Map();
const connectionManager = new ConnectionManager({ logger });
const httpRateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 120, keyPrefix: 'http:' });
const registerRateLimiter = new RateLimiter({ windowMs: 60000, maxRequests: 10, keyPrefix: 'reg:' });

function recordRequestMetrics(method, statusCode, duration) {
  metrics.inc('apex_requests_total', { method, status: String(statusCode) });
  metrics.observe('apex_request_duration_seconds', { method }, duration);
}

const sendError = (res, status, title, message) => {
  if (res.writableEnded || res.headersSent) return;
  try {
    res.writeHead(status, { 'Content-Type': 'text/html' });
    res.end(errorPage(status, title, message));
  } catch (err) {
    logger.error({ err: err.message, status }, 'Failed to send error response');
  }
};

function cleanupRequest(id) {
  const pending = pendingRequests.get(id);
  if (pending) {
    clearTimeout(pending.timer);
    pendingRequests.delete(id);
  }
}

function cleanupPendingRequests(socket) {
  for (const [id, pending] of pendingRequests) {
    if (pending.tunnelSocket === socket) {
      clearTimeout(pending.timer);
      sendError(
        pending.res,
        502,
        'Tunnel Disconnected',
        'The tunnel client disconnected before the response was complete. Please retry.',
      );
      pendingRequests.delete(id);
    }
  }
}

function handleResponseStart(msg) {
  const pending = pendingRequests.get(msg.id);
  if (!pending) return;

  clearTimeout(pending.timer);

  if (pending.res.writableEnded || pending.res.headersSent) {
    pendingRequests.delete(msg.id);
    return;
  }

  try {
    const headers = sanitizeHeaders(msg.headers || {});
    pending.res.writeHead(msg.statusCode || 502, headers);
    pending.responseStarted = true;
    pending.statusCode = msg.statusCode || 502;

    const bodyExpected = msg.bodyExpected === true;

    if (!bodyExpected) {
      pending.res.end();
      recordRequestMetrics(
        pending.method || 'GET',
        msg.statusCode || 502,
        (performance.now() - pending.startTime) / 1000,
      );
      pendingRequests.delete(msg.id);
    }
  } catch (err) {
    logger.error({ err: err.message, requestId: msg.id }, 'Error writing response headers');
    pendingRequests.delete(msg.id);
  }
}

function handleBodyChunk(requestId, data) {
  const pending = pendingRequests.get(requestId);
  if (!pending || !pending.responseStarted) return;

  try {
    pending.res.write(data);
  } catch (err) {
    logger.error({ err: err.message, requestId }, 'Error writing response body chunk');
    cleanupRequest(requestId);
  }
}

function handleBodyEnd(requestId) {
  const pending = pendingRequests.get(requestId);
  if (!pending) return;

  try {
    if (!pending.res.writableEnded) {
      pending.res.end();
    }
    recordRequestMetrics(
      pending.method || 'GET',
      pending.statusCode || 200,
      (performance.now() - pending.startTime) / 1000,
    );
  } catch (err) {
    logger.error({ err: err.message, requestId }, 'Error ending response body');
  }

  cleanupRequest(requestId);
}

function createTcpConnectionHandler(socket) {
  socket.setNoDelay(true);
  const parser = new ProtocolParser();
  let registered = false;
  const bp = new BackpressureController(socket, MAX_BUFFERED_BYTES);

  const regTimeout = setTimeout(() => {
    if (!registered) {
      logger.warn({ remote: socket.remoteAddress }, 'Client timed out before registering');
      socket.destroy();
    }
  }, REG_TIMEOUT_MS);

  parser.onFrame = async (type, payload) => {
    if (type === FRAME_TYPES.PING) {
      try { bp.write(encodePong()); } catch (err) {
        logger.error({ err: err.message }, 'Failed to send pong to client');
      }
      return;
    }

    if (type === FRAME_TYPES.PONG) {
      connectionManager.handlePong(socket);
      return;
    }

    if (type === FRAME_TYPES.JSON_CONTROL && payload?.type === 'register') {
      clearTimeout(regTimeout);
      const result = await handleRegister(socket, payload, connectionManager, registerRateLimiter);
      if (result.success) {
        registered = true;
        metrics.inc('apex_connections_total');
        metrics.set('apex_active_connections', {}, connectionManager.getStats().activeConnections);
      }
      return;
    }

    if (!registered) return;

    if (type === FRAME_TYPES.RESPONSE_START) {
      handleResponseStart(payload);
      return;
    }

    if (type === FRAME_TYPES.BODY_CHUNK) {
      handleBodyChunk(payload.id, payload.data);
      return;
    }

    if (type === FRAME_TYPES.BODY_END) {
      handleBodyEnd(payload.id);
      return;
    }
  };

  parser.onError = (err) => {
    logger.error({ err: err.message, remote: socket.remoteAddress }, 'Protocol parse error');
    socket.destroy();
  };

  socket.on('data', (chunk) => parser.feed(chunk));

  socket.on('end', () => {
    connectionManager.unregister(socket);
    cleanupPendingRequests(socket);
    metrics.set('apex_active_connections', {}, connectionManager.getStats().activeConnections);
  });

  socket.on('error', (err) => {
    logger.error({ err: err.message, remote: socket.remoteAddress }, 'TCP socket error');
    connectionManager.unregister(socket);
    cleanupPendingRequests(socket);
    metrics.set('apex_active_connections', {}, connectionManager.getStats().activeConnections);
  });
}

// ── Load TLS options (shared by tunnel and public HTTP) ─────────────────────
const tlsOptions = getTlsOptions();
if (!tlsOptions) {
  logger.error('TLS certificates are required but not configured. Set TLS_KEY_PATH and TLS_CERT_PATH.');
  process.exit(1);
}

// ── TCP tunnel server: TLS for client connections ──────────────────────────
const tcpServer = tls.createServer(tlsOptions, createTcpConnectionHandler);
logger.info('TLS enabled for TCP tunnel (client connections)');

// ── Public HTTP/HTTPS handler ──────────────────────────────────────────────
function handlePublicRequest(req, res) {
  const clientIp = getClientIp(req);
  const startTime = performance.now();

  const limit = httpRateLimiter.isAllowed(clientIp);
  if (!limit.allowed) {
    res.writeHead(429, {
      'Content-Type': 'text/plain',
      'Retry-After': String(limit.retryAfter),
    });
    res.end('Too many requests.');
    metrics.inc('apex_requests_total', { method: req.method, status: '429' });
    return;
  }

  if (pendingRequests.size >= MAX_CONCURRENT_REQUESTS) {
    sendError(res, 503, 'Service Unavailable', 'Too many concurrent requests. Try again later.');
    metrics.inc('apex_requests_total', { method: req.method, status: '503' });
    return;
  }

  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const subdomain = host.split('.')[0];

  const tunnelSocket = connectionManager.get(subdomain);
  if (!tunnelSocket) {
    sendError(res, 404, 'No Tunnel Found',
      `The subdomain <b>${escapeHtml(subdomain)}</b> is not connected to a client.`);
    metrics.inc('apex_requests_total', { method: req.method, status: '404' });
    return;
  }

  const headersSize = JSON.stringify(req.headers).length;
  if (headersSize > MAX_REQUEST_HEADERS_SIZE) {
    sendError(res, 431, 'Headers Too Large', 'Request headers exceed maximum size.');
    metrics.inc('apex_requests_total', { method: req.method, status: '431' });
    return;
  }

  const requestId = crypto.randomUUID();
  let bodySize = 0;

  try {
    tunnelSocket.write(encodeRequestStart({
      id: requestId,
      method: req.method,
      url: req.url,
      headers: sanitizeHeaders(req.headers),
      bodyExpected: true,
    }));
  } catch (err) {
    sendError(res, 502, 'Tunnel Error', 'Failed to forward request to client.');
    metrics.inc('apex_requests_total', { method: req.method, status: '502' });
    return;
  }

  req.on('data', (chunk) => {
    bodySize += chunk.length;
    if (bodySize > MAX_BODY_SIZE) {
      req.destroy();
      sendError(res, 413, 'Payload Too Large', 'Request body exceeds 100 MB limit.');
      cleanupRequest(requestId);
      metrics.inc('apex_requests_total', { method: req.method, status: '413' });
      return;
    }
    if (!tunnelSocket || tunnelSocket.destroyed) {
      req.destroy();
      cleanupRequest(requestId);
      return;
    }
    try {
      tunnelSocket.write(encodeBodyChunk(requestId, chunk));
    } catch {
      req.destroy();
      cleanupRequest(requestId);
    }
  });

  req.on('end', () => {
    if (!tunnelSocket || tunnelSocket.destroyed) {
      cleanupRequest(requestId);
      return;
    }
    try {
      tunnelSocket.write(encodeBodyEnd(requestId));
    } catch {
      cleanupRequest(requestId);
    }
  });

  req.on('error', (err) => {
    logger.warn({ err: err.message, clientIp }, 'Incoming request error');
    cleanupRequest(requestId);
  });

  req.on('aborted', () => {
    cleanupRequest(requestId);
  });

  res.on('close', () => {
    if (!res.writableEnded) {
      cleanupRequest(requestId);
    }
  });

  const timer = setTimeout(() => {
    const pending = pendingRequests.get(requestId);
    if (pending) {
      sendError(
        pending.res,
        504,
        'Gateway Timeout',
        'The tunnel is open, but your local server is not responding.',
      );
      pendingRequests.delete(requestId);
      metrics.inc('apex_requests_total', { method: req.method, status: '504' });
    }
  }, REQUEST_TIMEOUT_MS);

  pendingRequests.set(requestId, {
    res,
    timer,
    tunnelSocket,
    responseStarted: false,
    startTime,
    method: req.method,
    statusCode: null,
  });
}

// ── Public server: HTTPS (TLS required) ─────────────────────────────────────
const httpServer = https.createServer(tlsOptions, handlePublicRequest);
logger.info('HTTPS enabled for public traffic');

const metricsServer = http.createServer((req, res) => {
  if (req.url === '/metrics') {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' });
    res.end(metrics.format());
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: (Date.now() - metrics.startTime) / 1000,
      activeConnections: connectionManager.getStats().activeConnections,
      pendingRequests: pendingRequests.size,
    }));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

tcpServer.listen(TCP_PORT, () =>
  logger.info(`Relay TLS tunnel listening on :${TCP_PORT}`),
);
httpServer.listen(HTTP_PORT, () =>
  logger.info(`Relay HTTPS listening on :${HTTP_PORT}`),
);
metricsServer.listen(METRICS_PORT, () =>
  logger.info(`Metrics available on :${METRICS_PORT}/metrics`),
);

process.on('SIGINT', () => {
  logger.info('Shutting down gracefully…');
  httpRateLimiter.destroy();
  registerRateLimiter.destroy();
  tcpServer.close();
  httpServer.close();
  metricsServer.close();
  process.exit(0);
});
