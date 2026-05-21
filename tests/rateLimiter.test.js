import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../relayServer/src/rateLimiter.js';

describe('RateLimiter', () => {
  it('allows requests within limit', () => {
    const rl = new RateLimiter({ windowMs: 1000, maxRequests: 3 });
    expect(rl.isAllowed('ip1').allowed).toBe(true);
    expect(rl.isAllowed('ip1').allowed).toBe(true);
    expect(rl.isAllowed('ip1').allowed).toBe(true);
    rl.destroy();
  });

  it('blocks requests over limit', () => {
    const rl = new RateLimiter({ windowMs: 1000, maxRequests: 2 });
    rl.isAllowed('ip1');
    rl.isAllowed('ip1');
    const result = rl.isAllowed('ip1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
    rl.destroy();
  });

  it('tracks different keys independently', () => {
    const rl = new RateLimiter({ windowMs: 1000, maxRequests: 1 });
    expect(rl.isAllowed('ipA').allowed).toBe(true);
    expect(rl.isAllowed('ipB').allowed).toBe(true);
    rl.destroy();
  });

  it('refills tokens after window', () => {
    const rl = new RateLimiter({ windowMs: 50, maxRequests: 1 });
    rl.isAllowed('ip1');
    expect(rl.isAllowed('ip1').allowed).toBe(false);
    return new Promise(resolve => {
      setTimeout(() => {
        expect(rl.isAllowed('ip1').allowed).toBe(true);
        rl.destroy();
        resolve();
      }, 60);
    });
  });
});