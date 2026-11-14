import fs from 'node:fs';
import path from 'node:path';

/** Minimal .env reader so the Node server needs no dependency. Real environment variables win. */
export function loadEnv(dir = process.cwd()) {
  const env = {};
  for (const name of ['.env', '.env.local']) {
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!match || line.trim().startsWith('#')) continue;
      env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...env, ...process.env };
}
