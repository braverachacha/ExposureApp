// relayServer/src/tls.js
/**
 * TLS configuration — explicit environment variables only
 * 
 * Set TLS_KEY_PATH and TLS_CERT_PATH to enable TLS.
 * Set TLS_DISABLED=true to explicitly run in plaintext.
 */

import fs from 'fs';
import tls from 'tls';
import logger from '../logger.js';
import { CONFIG } from './config.js';

/**
 * Load and validate TLS options for the relay server
 * Returns tls.ServerOptions or null for plaintext mode
 */
export function getTlsOptions() {
  // Explicit TLS disable takes precedence
  if (CONFIG.tls.disabled) {
    logger.info('TLS explicitly disabled via TLS_DISABLED=true');
    return null;
  }

  const keyPath = CONFIG.tls.keyPath;
  const certPath = CONFIG.tls.certPath;

  // No paths configured = plaintext
  if (!keyPath || !certPath) {
    logger.info('TLS not configured (TLS_KEY_PATH and TLS_CERT_PATH not set). Running in plaintext.');
    return null;
  }

  // Check if files exist
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    logger.warn(
      { keyPath, certPath },
      'TLS certificate files not found. Running in plaintext.'
    );
    return null;
  }

  try {
    const key = fs.readFileSync(keyPath, 'utf8');
    const cert = fs.readFileSync(certPath, 'utf8');

    // Basic validation: ensure both are PEM formatted
    if (!key.includes('-----BEGIN') || !cert.includes('-----BEGIN')) {
      throw new Error('Invalid PEM format: files do not contain certificate markers');
    }

    logger.info(
      { keyPath, certPath },
      'TLS certificates loaded successfully'
    );

    return {
      key,
      cert,
      minVersion: 'TLSv1.2',
      ciphers: [
        'TLS_AES_256_GCM_SHA384',
        'TLS_CHACHA20_POLY1305_SHA256',
        'TLS_AES_128_GCM_SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-CHACHA20-POLY1305',
      ].join(':'),
      honorCipherOrder: true,
    };
  } catch (err) {
    logger.error(
      { error: err.message, keyPath, certPath },
      'Failed to load TLS certificates. Running in plaintext.'
    );
    return null;
  }
}

/**
 * Create a TLS server with provided options
 */
export function createSecureServer(options, connectionListener) {
  return tls.createServer(options, connectionListener);
}
