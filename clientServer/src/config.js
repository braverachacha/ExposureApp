// clientServer/src/config.js
export const CONFIG = Object.freeze({
  relay: {
    host: process.env.APEX_RELAY || 'relay.apextunnel.top',
    port: Number(process.env.APEX_RELAY_PORT) || 9000,
  },
  tls: {
    enabled: process.env.APEX_TLS === 'true' || process.env.APEX_TLS === '1',
    caPath: process.env.APEX_TLS_CA || null,
  },
  local: {
    host: process.env.APEX_LOCAL_HOST || 'localhost',
    defaultPort: 8080,
  },
  inspector: {
    portStart: Number(process.env.APEX_INSPECTOR_PORT_START) || 4040,
    portEnd: Number(process.env.APEX_INSPECTOR_PORT_END) || 4060,
    host: '127.0.0.1',
  },
  app: {
    version: '2.0.1',
  },
});

export function validateConfig() {
  const { port } = CONFIG.relay;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid APEX_RELAY_PORT: ${port}. Must be 1–65535.`);
  }
  return CONFIG;
}
