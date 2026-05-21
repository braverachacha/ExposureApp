import { describe, it, expect, vi } from 'vitest';
import { BackpressureController } from '../relayServer/src/backpressure.js';
import { EventEmitter } from 'events';

describe('BackpressureController', () => {
  it('writes successfully when socket is writable', () => {
    const socket = new EventEmitter();
    socket.destroyed = false;
    socket.write = vi.fn(() => true);

    const bp = new BackpressureController(socket);
    expect(bp.write(Buffer.from('hello'))).toBe(true);
    expect(socket.write).toHaveBeenCalledTimes(1);
  });

  it('pauses when buffer exceeds limit', () => {
    const socket = new EventEmitter();
    socket.destroyed = false;
    socket.write = vi.fn(() => false);

    const bp = new BackpressureController(socket, 100);
    bp.write(Buffer.alloc(50));
    expect(bp.isPaused()).toBe(false);
    bp.write(Buffer.alloc(60));
    expect(bp.isPaused()).toBe(true);
  });

  it('resumes on drain event', () => {
    const socket = new EventEmitter();
    socket.destroyed = false;
    socket.write = vi.fn(() => false);

    const bp = new BackpressureController(socket, 100);
    bp.write(Buffer.alloc(200));
    expect(bp.isPaused()).toBe(true);

    socket.emit('drain');
    expect(bp.isPaused()).toBe(false);
  });

  it('returns false on destroyed socket', () => {
    const socket = new EventEmitter();
    socket.destroyed = true;
    const bp = new BackpressureController(socket);
    expect(bp.write(Buffer.from('x'))).toBe(false);
  });
});