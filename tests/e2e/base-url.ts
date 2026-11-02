import { existsSync, readFileSync } from 'node:fs';

/**
 * The running app to test: BASE_URL if set, then the address Layerwise's dev
 * server logged (its port differs per project), then Vite's default.
 */
function findBaseUrl() {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, '');
  const log = '.layerwise/dev-server.log';
  if (existsSync(log)) {
    const local = /Local:\s+(http:\/\/\S+?)\/?\s/.exec(readFileSync(log, 'utf8'));
    if (local) return local[1]!;
  }
  return 'http://127.0.0.1:5173';
}

export const BASE_URL = findBaseUrl();
