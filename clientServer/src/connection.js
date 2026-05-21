//  clientServer/src/connection.js
/**
 * Connection manager with TLS fallback, heartbeat, reconnection, and streaming
 * 
 * Supports three modes:
 * 1. TLS-only: useTls=true, detectTls=false (fail on plaintext relay)
 * 2. Plaintext-only: useTls=false, detectTls=false (no TLS attempt)
 * 3. Auto-detect: useTls=false, detectTls=true (try TLS, fallback to plaintext)
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
    detectTls = true,
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

    // TLS detection: try TLS first, fallback to plaintext if it fails
    this.detectTls = detectTls;
    this.tlsAttempted = false;
    this.tlsFailed = false;

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

    const connectOptions = {
      host: this.host,
      port: this.port,
    };

    // Determine whether to attempt TLS on this connection attempt
    const shouldAttemptTls = this.useTls || (this.detectTls && !this.tlsFailed);

    if (shouldAttemptTls && !this.tlsFailed) {
      this.logger.info(
        `Attempting TLS connection to ${this.host}:${this.port}${
          this.tlsAttempted ? ' (retry)' : ''
        }`
      );

      connectOptions.rejectUnauthorized = true;
      if (this.caPath && fs.existsSync(this.caPath)) {
        try {
          connectOptions.ca = fs.readFileSync(this.caPath);
          this.logger.debug(`Using CA certificate from ${this.caPath}`);
        } catch (err) {
          this.logger.warn(`Failed to read CA certificate: ${err.message}`);
        }
      }

      this.socket = tls.connect(connectOptions, () => this._onConnect());

      // Handle TLS-specific errors
      this.socket.once('error', (err) => {
        // If TLS is in detection mode (not required), switch to plaintext
        if (
          this.detectTls &&
          !this.useTls &&
          !this.tlsAttempted &&
          (err.code === 'ECONNREFUSED' ||
            err.code === 'ENOTFOUND' ||
            err.code === 'EHOSTUNREACH' ||
            err.code === 'ERR_TLS_CERT_HAS_EXPIRED' ||
            err.code === 'ERR_TLS_CERT_SELF_SIGNED' ||
            err.code === 'ERR_TLS_CERT_UNKNOWN')
        ) {
          this.logger.warn(
            `TLS connection failed (${err.code}). Falling back to plaintext mode.`
          );
          this.tlsFailed = true;
          this.tlsAttempted = true;

          // Destroy current socket and reconnect without TLS
          try {
            this.socket.destroy();
          } catch (destroyErr) {
            // Ignore destroy errors
          }
          this.socket = null;
          this._reconnect();
          return;
        }

        // For TLS-required mode, propagate the error
        this.logger.error(`TLS connection error: ${err.message}`);
      });

      this.tlsAttempted = true;
    } else {
      // Plaintext connection
      const mode = this.tlsFailed ? '(TLS failed, using plaintext)' : '(plaintext)';
      this.logger.info(`Connecting to ${this.host}:${this.port} ${mode}`);
      this.socket = net.connect(connectOptions, () => this._onConnect());
    }

    // Shared socket event handlers
    this.socket.on('data', (chunk) => this.parser.feed(chunk));

    this.socket.on('error', (err) => {
      this.logger.error(`Socket error: ${err.message}`);
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
    // Reset backoff on successful connection
    this.reconnectDelay = 3000;
    this.socket.setNoDelay(true);

    // Keep-alive timeout longer than the relay's ping interval (30s) so the
    // relay's own heartbeat drives liveness detection, not the OS TCP timer.
    this.socket.setTimeout(90000);

    // Log connection mode
    const tlsMode = this.socket instanceof tls.TLSSocket ? 'TLS' : 'plaintext';
    this.logger.info(`Connected via ${tlsMode}. Registering…`);

    // Send registration message
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

    // ── Request frames
    if (type === FRAME_TYPES.REQUEST_START) {
      // Tag the payload so client.js can dispatch on msg.type === 'request'.
      // The raw REQUEST_START payload carries no .type field; without this tag
      // the dispatcher's check always failed and proxyRequest() was never called
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

  // ── Outbound helpers

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
