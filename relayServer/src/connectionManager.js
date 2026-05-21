// relayServer/src/connectionManager.js

/**
 * Connection Manager with heartbeat and automatic cleanup
 */

import { encodePing, encodePong } from './protocol.js';

export class ConnectionManager {
  constructor({ pingIntervalMs = 30000, pongTimeoutMs = 10000, logger = console } = {}) {
    this.clients = new Map();      // subdomain -> socket
    this.sockets = new Map();      // socket -> {subdomain, registeredAt, lastActivity}
    this.heartbeats = new Map();   // socket -> {pingTimer, pongTimer}
    this.pendingPings = new Set(); // sockets awaiting pong
    this.pingIntervalMs = pingIntervalMs;
    this.pongTimeoutMs = pongTimeoutMs;
    this.logger = logger;
  }

  has(subdomain) {
    const socket = this.clients.get(subdomain);
    return socket && !socket.destroyed;
  }

  get(subdomain) {
    const socket = this.clients.get(subdomain);
    if (socket && !socket.destroyed) return socket;
    if (socket) this.unregister(socket);
    return null;
  }

  register(subdomain, socket) {
    // Forcefully reclaim if subdomain is taken by a dead socket
    const existing = this.clients.get(subdomain);
    if (existing) {
      if (existing.destroyed) {
        this.unregister(existing);
      } else {
        this.logger.warn({ subdomain }, 'Reclaiming subdomain from stale connection');
        this.unregister(existing);
        try { existing.destroy(); } catch {}
      }
    }

    this.clients.set(subdomain, socket);
    this.sockets.set(socket, {
      subdomain,
      registeredAt: Date.now(),
      lastActivity: Date.now(),
    });

    this._startHeartbeat(socket);
    this.logger.info({ subdomain }, 'Client registered');
  }

  unregister(socket) {
    const info = this.sockets.get(socket);
    if (info) {
      this.clients.delete(info.subdomain);
      this.sockets.delete(socket);
      this.logger.info({ subdomain: info.subdomain }, 'Client unregistered');
    }
    this._stopHeartbeat(socket);
  }

  getSubdomain(socket) {
    return this.sockets.get(socket)?.subdomain;
  }

  updateActivity(socket) {
    const info = this.sockets.get(socket);
    if (info) info.lastActivity = Date.now();
  }

  _startHeartbeat(socket) {
    const pingTimer = setInterval(() => {
      if (socket.destroyed) {
        this._stopHeartbeat(socket);
        return;
      }
      try {
        socket.write(encodePing());
        this.pendingPings.add(socket);

        const pongTimer = setTimeout(() => {
          if (this.pendingPings.has(socket)) {
            this.logger.warn({ subdomain: this.getSubdomain(socket) }, 'Heartbeat timeout');
            this.unregister(socket);
            try { socket.destroy(); } catch {}
          }
        }, this.pongTimeoutMs);

        const hb = this.heartbeats.get(socket);
        if (hb) {
          if (hb.pongTimer) clearTimeout(hb.pongTimer);
          hb.pongTimer = pongTimer;
        }
      } catch {
        this.unregister(socket);
        try { socket.destroy(); } catch {}
      }
    }, this.pingIntervalMs);

    this.heartbeats.set(socket, { pingTimer, pongTimer: null });
  }

  _stopHeartbeat(socket) {
    this.pendingPings.delete(socket);
    const hb = this.heartbeats.get(socket);
    if (hb) {
      clearInterval(hb.pingTimer);
      if (hb.pongTimer) clearTimeout(hb.pongTimer);
      this.heartbeats.delete(socket);
    }
  }

  handlePong(socket) {
    this.pendingPings.delete(socket);
    const hb = this.heartbeats.get(socket);
    if (hb?.pongTimer) {
      clearTimeout(hb.pongTimer);
      hb.pongTimer = null;
    }
    this.updateActivity(socket);
  }

  getStats() {
    return {
      activeConnections: this.clients.size,
      pendingPings: this.pendingPings.size,
    };
  }
}
