//  clientServer/src/connection.js

import tls from 'tls';
import {
  ProtocolParser, FRAME_TYPES,
  encodeJson, encodeResponseStart, encodeBodyChunk, encodeBodyEnd, encodePong,
} from './protocol.js';

export class TunnelConnection {
  constructor({
    host, port, token, subdomain, localPort,
    onRegistered, onError, onRequest,
    logger = console,
  }) {
    this.host = host;
    this.port = port;
    this.token = token;
    this.subdomain = subdomain;
    this.localPort = localPort;
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

    this.logger.info(`Connecting via TLS to ${this.host}:${this.port}`);

    this.socket = tls.connect({
      host: this.host,
      port: this.port,
      rejectUnauthorized: true,
      // Let's Encrypt certs are trusted by system CA store — no custom CA needed
      servername: this.host, // SNI: required for proper TLS handshake
    }, () => this._onConnect());

    this.socket.on('data', (chunk) => this.parser.feed(chunk));

    this.socket.on('error', (err) => {
      this.logger.error(`TLS socket error: ${err.message}`);
    });

    this.socket.on('close', () => {
      if (!this.intentionalClose) {
        this._reconnect();
      }
    });

    this.socket.on('timeout', () => {
      this.logger.warn('Socket timeout — closing connection');
      this.socket.destroy();
    });
  }

  _onConnect() {
    this.reconnectDelay = 3000;
    this.socket.setNoDelay(true);
    this.socket.setTimeout(90000);
    this.logger.info('TLS connected. Registering…');

    this.socket.write(
      encodeJson({
        type: 'register',
        subdomain: this.subdomain,
        token: this.token,
        version: '2.0.1',
      })
    );
  }

  _handleFrame(type, payload) {
    if (type === FRAME_TYPES.PING) {
      this._sendPong();
      return;
    }

    if (type === FRAME_TYPES.PONG) {
      return;
    }

    if (type === FRAME_TYPES.JSON_CONTROL) {
      if (payload.type === 'error') {
        if (payload.code === 'SUBDOMAIN_IN_USE') {
          this.logger.warn(
            'Subdomain in use — clearing stored subdomain and reconnecting with a server-assigned one'
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
        this.logger.info(`Registered with subdomain: ${payload.subdomain || 'server-assigned'}`);
        this.onRegistered?.(payload);
        return;
      }
    }

    if (type === FRAME_TYPES.REQUEST_START) {
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
      this.logger.error(`Pong write failed: ${err.message}`);
    }
  }

  _reconnect() {
    const delayMs = this.reconnectDelay;
    this.onError?.({ type: 'reconnecting', delay: delayMs });

    const jitter = Math.random() * 1000;
    const totalDelay = delayMs + jitter;

    setTimeout(() => {
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, totalDelay);
  }

  sendResponseStart(requestId, statusCode, headers, bodyExpected) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(encodeResponseStart({ id: requestId, statusCode, headers, bodyExpected }));
    } catch (err) {
      this.logger.error(`sendResponseStart failed: ${err.message}`);
    }
  }

  sendBodyChunk(requestId, data) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(encodeBodyChunk(requestId, data));
    } catch (err) {
      this.logger.error(`sendBodyChunk failed: ${err.message}`);
    }
  }

  sendBodyEnd(requestId) {
    if (!this.socket || this.socket.destroyed) return;
    try {
      this.socket.write(encodeBodyEnd(requestId));
    } catch (err) {
      this.logger.error(`sendBodyEnd failed: ${err.message}`);
    }
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch (err) {
        this.logger.error(`Socket destroy failed: ${err.message}`);
      }
    }
  }
}
