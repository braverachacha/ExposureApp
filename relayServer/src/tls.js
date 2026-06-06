/**
 * TLS configuration — explicit environment variables only
 * 
 * Set TLS_KEY_PATH and TLS_CERT_PATH to enable TLS.
 * TLS is now mandatory for both tunnel and public HTTPS.
 */

import fs from 'fs';
import logger from '../logger.js';
import { CONFIG } from './config.js';

/**
 * Load and validate TLS options for the relay server
 * Returns tls.ServerOptions or null if certs missing/invalid
 */
export function getTlsOptions() {
  // Explicit TLS disable takes precedence (emergency only)
  if (CONFIG.tls.disabled) {
    logger.warn('TLS explicitly disabled via TLS_DISABLED=true — NOT RECOMMENDED FOR PRODUCTION');
    return null;
  }

  const keyPath = CONFIG.tls.keyPath;
  const certPath = CONFIG.tls.certPath;

  if (!keyPath || !certPath) {
    logger.error('TLS not configured: TLS_KEY_PATH and TLS_CERT_PATH are required');
    return null;
  }

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    logger.error(
      { keyPath, certPath },
      'TLS certificate files not found'
    );
    return null;
  }

  try {
    const key = fs.readFileSync(keyPath, 'utf8');
    const cert = fs.readFileSync(certPath, 'utf8');

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
      'Failed to load TLS certificates'
    );
    return null;
  }
}
