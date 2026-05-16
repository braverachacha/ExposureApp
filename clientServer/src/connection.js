//  clientServer/src/connection.js
/**
 * Connection manager with TLS, heartbeat, reconnection, and streaming
 */

import net from 'net';
import tls from 'tls';
import fs from 'fs';
import {
  ProtocolParser, FRAME_TYPES,
  encodeJson, encodeResponseStart, encodeBodyChunk, encodeBodyEnd, encodePong,
} from './protocol.js';

export class TunnelConnection {
  constructor({
    host, port, token, subdomain, localPort,
    useTls = false, caPath = null,
    onRegistered, onError, onRequest,
    logger = console,
  }) {
    this.host = host;
    this.port = port;
    this.token = token;
    this.subdomain = subdomain;
    this.localPort = localPort;
    this.useTls = useTls;
    this.caPath = caPath;
    this.onRegistered = onRegistered;
    this.onError = onError;
    this.onRequest = onRequest;
    this.logger = logger;

    this.socket = null;
    this.parser = null;
    this.intentionalClose = false;
    this.reconnectDelay = 3000;
    this.maxReconnectDelay = 60000;
    this.registered = false;
  }

  connect() {
    if (this.socket && !this.socket.destroyed) return;

    this.intentionalClose = false;
    this.registered = false;
    this.parser = new ProtocolParser();

    this.parser.onFrame = (type, payload) => this._handleFrame(type, payload);
    this.parser.onError = (err) => {
      this.logger.error('Protocol error:', err.message);
      this._reconnect();
    };

    const connectOptions = { host: this.host, port: this.port };

    if (this.useTls) {
      connectOptions.rejectUnauthorized = true;
      if (this.caPath && fs.existsSync(this.caPath)) {
        connectOptions.ca = fs.readFileSync(this.caPath);
      }
      this.socket = tls.connect(connectOptions, () => this._onConnect());
    } else {
      this.socket = net.connect(connectOptions, () => this._onConnect());
    }

    this.socket.on('data', (chunk) => this.parser.feed(chunk));

    this.socket.on('error', (err) => {
      this.logger.error('Tunnel error:', err.message);
    });

    this.socket.on('close', () => {
      if (!this.intentionalClose) {
        this._reconnect();
      }
    });

    this.socket.on('timeout', () => {
      this.logger.warn('Socket timeout — destroying');
      this.socket.destroy();
    });
  }

  _onConnect() {
    this.reconnectDelay = 3000;
    this.socket.setNoDelay(true);
    // Keep-alive timeout longer than the relay's ping interval (30s) so the
    // relay's own heartbeat drives liveness detection, not the OS TCP timer.
    this.socket.setTimeout(90000);

    this.socket.write(encodeJson({
      type: 'register',
      subdomain: this.subdomain,
      token: this.token,
      version: '2.0.1',
    }));
  }

  _handleFrame(type, payload) {
    // ── Control frames
    if (type === FRAME_TYPES.PING) {
      // Relay is probing liveness — respond immediately.
      this._sendPong();
      return;
    }

    if (type === FRAME_TYPES.PONG) {
      // Relay acknowledged one of our earlier pongs; nothing to do.
      return;
    }

    // ── JSON control
    if (type === FRAME_TYPES.JSON_CONTROL) {
      if (payload.type === 'error') {
        if (payload.code === 'SUBDOMAIN_IN_USE') {
          this.logger.warn(
            'Subdomain in use — clearing stored subdomain and reconnecting with a server-assigned one',
          );
          this.subdomain = '';
          this.onError?.(payload);
          this._reconnect();
          return;
        }
        this.onError?.(payload);
        this.intentionalClose = true;
        this.socket?.destroy();
        return;
      }

      if (payload.type === 'registered') {
        this.registered = true;

        this.onRegistered?.(payload);
        return;
      }
    }

    // ── Request frames
    if (type === FRAME_TYPES.REQUEST_START) {
      // Tag the payload so client.js can dispatch on msg.type === 'request'.
      // The raw REQUEST_START payload carries no .type field; without this tag
      // the dispatcher's check always failed and proxyRequest() was never
      this.onRequest?.({ ...payload, type: 'request' });
      return;
    }

    if (type === FRAME_TYPES.BODY_CHUNK) {
      this.onRequest?.({ type: 'bodyChunk', id: payload.id, data: payload.data });
      return;
    }

    if (type === FRAME_TYPES.BODY_END) {
      this.onRequest?.({ type: 'bodyEnd', id: payload.id });
      return;
    }
  }

  _sendPong() {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(encodePong());
    } catch (err) {
      this.logger.error('Pong write failed:', err.message);
    }
  }

  _reconnect() {
    this.onError?.({ type: 'reconnecting', delay: this.reconnectDelay });

    const jitter = Math.random() * 1000;
    const delay = this.reconnectDelay + jitter;

    setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, delay);
  }

  // ── Outbound helpers

  sendResponseStart(requestId, statusCode, headers, bodyExpected) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(encodeResponseStart({ id: requestId, statusCode, headers, bodyExpected }));
    } catch (err) {
      this.logger.error('sendResponseStart failed:', err.message);
    }
  }

  sendBodyChunk(requestId, data) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(encodeBodyChunk(requestId, data));
    } catch (err) {
      this.logger.error('sendBodyChunk failed:', err.message);
    }
  }

  sendBodyEnd(requestId) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(encodeBodyEnd(requestId));
    } catch (err) {
      this.logger.error('sendBodyEnd failed:', err.message);
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.socket) {
      try { this.socket.destroy(); } catch (err) {
        this.logger.error('Socket destroy failed:', err.message);
      }
    }
  }
}
