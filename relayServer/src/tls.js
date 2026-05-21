// relayServer/src/tls.js
/**
 * TLS configuration with intelligent certificate detection
 * 
 * Fallback order:
 * 1. TLS_KEY_PATH and TLS_CERT_PATH environment variables
 * 2. ./src/privkey.pem and ./src/fullchain.pem (local cert directory)
 * 3. ./privkey.pem and ./fullchain.pem (relayServer root)
 * 
 * Set TLS_DISABLED=true to explicitly run in plaintext mode
 */

import fs from 'fs';
import path from 'path';
import tls from 'tls';
import logger from '../logger.js';
import { CONFIG } from './config.js';

/**
 * Attempt to locate TLS certificate pair through multiple fallback paths
 * Returns { key, cert, source } object or null if not found
 */
function findCertificatePair() {
  const checks = [
    {
      source: 'environment',
      key: CONFIG.tls.keyPath,
      cert: CONFIG.tls.certPath,
    },
    {
      source: 'local (src/)',
      key: path.join(process.cwd(), 'src', 'privkey.pem'),
      cert: path.join(process.cwd(), 'src', 'fullchain.pem'),
    },
    {
      source: 'root',
      key: path.join(process.cwd(), 'privkey.pem'),
      cert: path.join(process.cwd(), 'fullchain.pem'),
    },
  ];

  for (const check of checks) {
    try {
      if (fs.existsSync(check.key) && fs.existsSync(check.cert)) {
        return {
          key: check.key,
          cert: check.cert,
          source: check.source,
        };
      }
    } catch (err) {
      // Continue to next check on permission errors
      continue;
    }
  }

  return null;
}

/**
 * Load and validate TLS options for the relay server
 * Returns tls.ServerOptions or null for plaintext mode
 */
export function getTlsOptions() {
  // Explicit TLS disable takes precedence
  if (CONFIG.tls.disabled) {
    logger.info('TLS explicitly disabled via TLS_DISABLED=true environment variable');
    return null;
  }

  const certPair = findCertificatePair();

  if (!certPair) {
    logger.warn(
      {
        primaryKey: CONFIG.tls.keyPath,
        primaryCert: CONFIG.tls.certPath,
        fallbackPaths: [
          'relayServer/src/privkey.pem + fullchain.pem',
          'relayServer/privkey.pem + fullchain.pem',
        ],
      },
      'TLS certificates not found. Relay will run in plaintext mode. ' +
        'To enable TLS: (1) Set TLS_KEY_PATH and TLS_CERT_PATH environment variables, or ' +
        '(2) Place privkey.pem and fullchain.pem in relayServer root or src/ directory'
    );
    return null;
  }

  try {
    const key = fs.readFileSync(certPair.key, 'utf8');
    const cert = fs.readFileSync(certPair.cert, 'utf8');

    // Basic validation: ensure both are PEM formatted
    if (!key.includes('-----BEGIN') || !cert.includes('-----BEGIN')) {
      throw new Error('Invalid PEM format: files do not contain certificate markers');
    }

    logger.info(
      {
        source: certPair.source,
        keyPath: certPair.key,
        certPath: certPair.cert,
      },
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
      {
        error: err.message,
        source: certPair.source,
        keyPath: certPair.key,
        certPath: certPair.cert,
      },
      'Failed to load TLS certificates'
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
