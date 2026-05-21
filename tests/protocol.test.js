import { describe, it, expect } from 'vitest';
import {
  ProtocolParser, FRAME_TYPES,
  encodeFrame, encodeJson, encodeBodyChunk, encodeBodyEnd,
  encodeRequestStart, encodeResponseStart, encodePing, encodePong
} from '../relayServer/src/protocol.js';

describe('Protocol Encoding', () => {
  it('encodes a JSON control frame', () => {
    const frame = encodeJson({ type: 'register', token: 'abc' });
    expect(frame.length).toBeGreaterThan(5);
    expect(frame.readUInt32BE(0)).toBe(frame.length - 4);
    expect(frame[4]).toBe(FRAME_TYPES.JSON_CONTROL);
  });

  it('encodes a body chunk with correct ID', () => {
    const data = Buffer.from('hello world');
    const frame = encodeBodyChunk('req-123', data);
    expect(frame[4]).toBe(FRAME_TYPES.BODY_CHUNK);
    const payload = frame.subarray(5);
    const idLen = payload.readUInt32BE(0);
    const id = payload.subarray(4, 4 + idLen).toString('utf8');
    expect(id).toBe('req-123');
    const body = payload.subarray(4 + idLen);
    expect(body.toString()).toBe('hello world');
  });

  it('encodes ping and pong frames', () => {
    const ping = encodePing();
    expect(ping[4]).toBe(FRAME_TYPES.PING);
    expect(ping.length).toBe(5);

    const pong = encodePong();
    expect(pong[4]).toBe(FRAME_TYPES.PONG);
    expect(pong.length).toBe(5);
  });

  it('rejects oversized payloads', () => {
    const huge = Buffer.alloc(20 * 1024 * 1024);
    expect(() => encodeFrame(FRAME_TYPES.BODY_CHUNK, huge)).toThrow('Payload too large');
  });
});

describe('Protocol Parser', () => {
  it('parses a complete frame in one chunk', () => new Promise((resolve, reject) => {
    const parser = new ProtocolParser();
    const obj = { type: 'registered', subdomain: 'test' };
    const frame = encodeJson(obj);

    parser.onFrame = (type, payload) => {
      expect(type).toBe(FRAME_TYPES.JSON_CONTROL);
      expect(payload.subdomain).toBe('test');
      resolve();
    };
    parser.onError = (err) => reject(err);

    parser.feed(frame);
  }));

  it('parses frames split across multiple chunks', () => new Promise((resolve, reject) => {
    const parser = new ProtocolParser();
    const frame = encodeJson({ type: 'ping' });
    let received = false;

    parser.onFrame = (type) => {
      if (!received && type === FRAME_TYPES.JSON_CONTROL) {
        received = true;
        resolve();
      }
    };
    parser.onError = (err) => reject(err);

    parser.feed(frame.subarray(0, 3));
    parser.feed(frame.subarray(3, 7));
    parser.feed(frame.subarray(7));
  }));

  it('parses multiple frames in one chunk', () => new Promise((resolve, reject) => {
    const parser = new ProtocolParser();
    const f1 = encodeJson({ type: 'a' });
    const f2 = encodeJson({ type: 'b' });
    const combined = Buffer.concat([f1, f2]);
    let count = 0;

    parser.onFrame = () => {
      count++;
      if (count === 2) resolve();
    };
    parser.onError = (err) => reject(err);

    parser.feed(combined);
  }));

  it('handles body chunk frames', () => new Promise((resolve, reject) => {
    const parser = new ProtocolParser();
    const data = Buffer.from('binary data here');
    const frame = encodeBodyChunk('req-42', data);

    parser.onFrame = (type, payload) => {
      expect(type).toBe(FRAME_TYPES.BODY_CHUNK);
      expect(payload.id).toBe('req-42');
      expect(payload.data.toString()).toBe('binary data here');
      resolve();
    };
    parser.onError = (err) => reject(err);

    parser.feed(frame);
  }));

  it('emits error on oversized frame', () => new Promise((resolve, reject) => {
    const parser = new ProtocolParser();
    const badFrame = Buffer.alloc(4);
    badFrame.writeUInt32BE(20 * 1024 * 1024 + 1, 0);

    parser.onError = (err) => {
      expect(err.message).toContain('Frame too large');
      resolve();
    };
    parser.onFrame = () => reject(new Error('Should not receive frame'));

    parser.feed(badFrame);
  }));

  it('emits error on invalid frame type', () => new Promise((resolve, reject) => {
    const parser = new ProtocolParser();
    const frame = encodeFrame(0xFF, Buffer.from('{}'));

    parser.onError = (err) => {
      expect(err.message).toContain('Unknown frame type');
      resolve();
    };
    parser.onFrame = () => reject(new Error('Should not receive frame'));

    parser.feed(frame);
  }));
});