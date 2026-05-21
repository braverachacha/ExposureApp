// relayServer/src/protocol.js 

const MAX_FRAME_SIZE = 16 * 1024 * 1024; // 16MB
const MAX_ID_LENGTH = 256;

export const FRAME_TYPES = {
  JSON_CONTROL: 0x01,
  REQUEST_START: 0x02,
  RESPONSE_START: 0x03,
  BODY_CHUNK: 0x04,
  BODY_END: 0x05,
  PING: 0x06,
  PONG: 0x07,
};

export function encodeFrame(type, payload = Buffer.alloc(0)) {
  if (payload.length > MAX_FRAME_SIZE - 1) {
    throw new Error(`Payload too large: ${payload.length}`);
  }
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(payload.length + 1, 0);
  const typeByte = Buffer.from([type]);
  return Buffer.concat([length, typeByte, payload]);
}

export function encodeJson(obj) {
  return encodeFrame(FRAME_TYPES.JSON_CONTROL, Buffer.from(JSON.stringify(obj), 'utf8'));
}

export function encodeRequestStart(obj) {
  return encodeFrame(FRAME_TYPES.REQUEST_START, Buffer.from(JSON.stringify(obj), 'utf8'));
}

export function encodeResponseStart(obj) {
  return encodeFrame(FRAME_TYPES.RESPONSE_START, Buffer.from(JSON.stringify(obj), 'utf8'));
}

export function encodeBodyChunk(requestId, data) {
  const idBuf = Buffer.from(String(requestId), 'utf8');
  if (idBuf.length > MAX_ID_LENGTH) throw new Error('Request ID too long');
  const idLen = Buffer.allocUnsafe(4);
  idLen.writeUInt32BE(idBuf.length, 0);
  return encodeFrame(FRAME_TYPES.BODY_CHUNK, Buffer.concat([idLen, idBuf, data]));
}

export function encodeBodyEnd(requestId) {
  const idBuf = Buffer.from(String(requestId), 'utf8');
  if (idBuf.length > MAX_ID_LENGTH) throw new Error('Request ID too long');
  const idLen = Buffer.allocUnsafe(4);
  idLen.writeUInt32BE(idBuf.length, 0);
  return encodeFrame(FRAME_TYPES.BODY_END, Buffer.concat([idLen, idBuf]));
}

export function encodePing() {
  return encodeFrame(FRAME_TYPES.PING);
}

export function encodePong() {
  return encodeFrame(FRAME_TYPES.PONG);
}

export class ProtocolParser {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.state = 'LENGTH';
    this.expectedLength = 0;
    this.frameType = null;
    this.onFrame = null;
    this.onError = null;
  }

  feed(data) {
    this.buffer = Buffer.concat([this.buffer, data]);
    this._process();
  }

  _process() {
    while (true) {
      if (this.state === 'LENGTH') {
        if (this.buffer.length < 4) return;
        this.expectedLength = this.buffer.readUInt32BE(0);
        if (this.expectedLength > MAX_FRAME_SIZE) {
          this.onError?.(new Error(`Frame too large: ${this.expectedLength}`));
          return;
        }
        if (this.expectedLength < 1) {
          this.onError?.(new Error('Invalid frame length: 0'));
          return;
        }
        this.buffer = this.buffer.subarray(4);
        this.state = 'TYPE';
      }

      if (this.state === 'TYPE') {
        if (this.buffer.length < 1) return;
        this.frameType = this.buffer[0];
        this.buffer = this.buffer.subarray(1);
        this.state = 'PAYLOAD';
      }

      if (this.state === 'PAYLOAD') {
        const payloadLength = this.expectedLength - 1;
        if (this.buffer.length < payloadLength) return;
        const payload = this.buffer.subarray(0, payloadLength);
        this.buffer = this.buffer.subarray(payloadLength);
        this.state = 'LENGTH';

        try {
          this._handleFrame(this.frameType, payload);
        } catch (err) {
          this.onError?.(err);
        }
      }
    }
  }

  _handleFrame(type, payload) {
    switch (type) {
      case FRAME_TYPES.JSON_CONTROL:
      case FRAME_TYPES.REQUEST_START:
      case FRAME_TYPES.RESPONSE_START: {
        const json = JSON.parse(payload.toString('utf8'));
        this.onFrame?.(type, json);
        break;
      }
      case FRAME_TYPES.BODY_CHUNK: {
        if (payload.length < 4) throw new Error('BODY_CHUNK too short');
        const idLen = payload.readUInt32BE(0);
        if (idLen > MAX_ID_LENGTH || idLen + 4 > payload.length) {
          throw new Error('Invalid BODY_CHUNK ID length');
        }
        const id = payload.subarray(4, 4 + idLen).toString('utf8');
        const data = payload.subarray(4 + idLen);
        this.onFrame?.(type, { id, data });
        break;
      }
      case FRAME_TYPES.BODY_END: {
        if (payload.length < 4) throw new Error('BODY_END too short');
        const idLen = payload.readUInt32BE(0);
        if (idLen > MAX_ID_LENGTH || idLen + 4 > payload.length) {
          throw new Error('Invalid BODY_END ID length');
        }
        const id = payload.subarray(4, 4 + idLen).toString('utf8');
        this.onFrame?.(type, { id });
        break;
      }
      case FRAME_TYPES.PING:
      case FRAME_TYPES.PONG:
        this.onFrame?.(type, null);
        break;
      default:
        throw new Error(`Unknown frame type: ${type}`);
    }
  }
}
