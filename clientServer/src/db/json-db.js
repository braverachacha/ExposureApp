import fs from 'fs';
import { readFile, access } from 'fs/promises';
import path from 'path';

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export class JsonDb {
  constructor(filePath, { encryptFn, decryptFn } = {}) {
    this.filePath = filePath;
    this.dir = path.dirname(filePath);
    this.encrypt = encryptFn;
    this.decrypt = decryptFn;
    this.data = null;
  }

  async read(defaultValue = {}) {
    if (!(await fileExists(this.filePath))) {
      this.data = structuredClone(defaultValue);
      return this;
    }

    const raw = await readFile(this.filePath, 'utf8');
    if (!raw.trim()) {
      this.data = structuredClone(defaultValue);
      return this;
    }

    const text = this.decrypt ? this.decrypt(raw) : raw;
    this.data = JSON.parse(text);
    return this;
  }

  write() {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }
    const json = JSON.stringify(this.data);
    const text = this.encrypt ? this.encrypt(json) : json;
    fs.writeFileSync(this.filePath, text, 'utf8');
  }

  get() {
    return this.data;
  }

  set(value) {
    this.data = value;
  }
}
