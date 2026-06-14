/**
 * Client configuration
 */

export const CONFIG = Object.freeze({
  relay: {
    host: 'relay.apextunnel.top',
    port: 9000,
  },
  local: {
    host: 'localhost',
    defaultPort: 8080,
  },
  inspector: {
    portStart: 4040,
    portEnd: 4060,
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
    throw new Error(`Invalid relay port: ${port}. Must be 1–65535.`);
  }
  return CONFIG;
}
