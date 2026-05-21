import { describe, it, expect } from 'vitest';
import { validateSubdomain, sanitizeHeaders, escapeHtml } from '../relayServer/src/security.js';

describe('validateSubdomain', () => {
  it('accepts valid subdomains', () => {
    expect(validateSubdomain('myapp')).toBe(true);
    expect(validateSubdomain('my-app')).toBe(true);
    expect(validateSubdomain('a1')).toBe(true);
  });

  it('rejects invalid subdomains', () => {
    expect(validateSubdomain('')).toBe(false);
    expect(validateSubdomain('-invalid')).toBe(false);
    expect(validateSubdomain('invalid-')).toBe(false);
    expect(validateSubdomain('foo_bar')).toBe(false);
    expect(validateSubdomain('a'.repeat(64))).toBe(false);
  });
});

describe('sanitizeHeaders', () => {
  it('strips hop-by-hop headers', () => {
    const headers = {
      'content-type': 'text/html',
      'connection': 'keep-alive',
      'proxy-authenticate': 'Basic',
    };
    const clean = sanitizeHeaders(headers);
    expect(clean['content-type']).toBe('text/html');
    expect(clean['connection']).toBeUndefined();
    expect(clean['proxy-authenticate']).toBeUndefined();
  });

  it('strips CRLF from header values', () => {
    const headers = { 'x-custom': 'value\r\ninjected' };
    const clean = sanitizeHeaders(headers);
    expect(clean['x-custom']).toBe('valueinjected');
  });
});

describe('escapeHtml', () => {
  it('escapes all HTML entities', () => {
    expect(escapeHtml('<script>alert("xss")</script>'))
      .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    expect(escapeHtml("it's ok")).toBe('it&#39;s ok');
  });
});