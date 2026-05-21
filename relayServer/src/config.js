// relayServer/src/config.js 

export const CONFIG = Object.freeze({
  ports: {
    tcp: Number(process.env.TCP_PORT) || 9000,
    http: Number(process.env.HTTP_PORT) || 2000,
    metrics: Number(process.env.METRICS_PORT) || 9090,
  },
  limits: {
    requestTimeoutMs: 30000,
    maxBodySize: 100 * 1024 * 1024,
    maxHeadersSize: 64 * 1024,
    maxConcurrentRequests: 1000,
    maxBufferedBytes: 8 * 1024 * 1024,
    regTimeoutMs: 15000,
  },
  tls: {
    keyPath: process.env.TLS_KEY_PATH || './privkey.pem',
    certPath: process.env.TLS_CERT_PATH || './fullchain.pem',
    disabled: process.env.TLS_DISABLED === 'true',
  },
  api: {
    url: process.env.API_URL,
    secret: process.env.INTERNAL_SECRET,
  },
  app: {
    version: '2.0.1',
  },
});

export function validateConfig() {
  const { tcp, http, metrics } = CONFIG.ports;
  for (const [name, port] of Object.entries({ tcp, http, metrics })) {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid ${name} port: ${port}. Must be 1–65535.`);
    }
  }
  if (!CONFIG.api.url) {
    throw new Error('API_URL environment variable is required.');
  }
  if (!CONFIG.api.secret) {
    throw new Error('INTERNAL_SECRET environment variable is required.');
  }
  return CONFIG;
}
