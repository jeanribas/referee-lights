import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config } from './config.js';

const ID_FILE = path.join(config.DATA_DIR, 'instance.id');

export function getInstanceId(): string {
  try {
    if (fs.existsSync(ID_FILE)) {
      const id = fs.readFileSync(ID_FILE, 'utf-8').trim();
      if (id) return id;
    }
  } catch {
    // ignore read errors
  }

  const id = randomUUID();
  try {
    fs.mkdirSync(path.dirname(ID_FILE), { recursive: true });
    fs.writeFileSync(ID_FILE, id, 'utf-8');
  } catch {
    // if we can't persist, still return the generated id
  }
  return id;
}
