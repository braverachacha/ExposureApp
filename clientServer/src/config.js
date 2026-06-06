// clientServer/src/config.js
/**
 * Client configuration with environment variable overrides
 *
 * TLS Modes:
 * - APEX_TLS=true: Require TLS connection (fail if unavailable)
 * - APEX_TLS=false + APEX_TLS_DETECT=true: Auto-detect (try TLS, fallback to plaintext)
 * - APEX_TLS=false + APEX_TLS_DETECT=false: Plaintext-only (default)
 */

export const CONFIG = Object.freeze({
  relay: {
    host: process.env.APEX_RELAY || 'relay.apextunnel.top',
    port: Number(process.env.APEX_RELAY_PORT) || 9000,
  },
  tls: {
    // APEX_TLS: explicitly require TLS
    enabled: process.env.APEX_TLS === 'true' || process.env.APEX_TLS === '1',

    // APEX_TLS_CA: path to CA certificate for self-signed certificates
    caPath: process.env.APEX_TLS_CA || null,

    // APEX_TLS_DETECT: enable automatic TLS detection (try TLS, fallback to plaintext)
    // Defaults to false — must be explicitly set to true
    // Disabled if APEX_TLS=true (TLS is required, no fallback needed)
    detectMode:
      process.env.APEX_TLS === 'true' || process.env.APEX_TLS === '1'
        ? false // No detection if TLS is required
        : process.env.APEX_TLS_DETECT === 'true', // Default: false (must explicitly enable)
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
    version: '2.2.0',
  },
});

/**
 * Validate configuration on startup
 */
export function validateConfig() {
  const { port } = CONFIG.relay;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid APEX_RELAY_PORT: ${port}. Must be 1–65535.`);
  }
  return CONFIG;
}

