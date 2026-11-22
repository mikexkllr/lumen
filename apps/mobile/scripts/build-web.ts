// Builds content bundles + the PWA (apps/web/dist) for the native apps.
// Inside the apps the web code is served from capacitor://localhost (iOS) or
// https://localhost (Android), so a relative API URL like /api cannot work:
// VITE_LUMEN_API_URL must be the absolute URL of your Lumen server.
//
//   VITE_LUMEN_API_URL=https://lumen.example.org/api npm run build:web -w @lumen/mobile
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const api = process.env.VITE_LUMEN_API_URL ?? '';
let url: URL | null = null;
try { url = new URL(api); } catch { /* reported below */ }
if (!url || (url.protocol !== 'https:' && !(url.protocol === 'http:' && process.env.LUMEN_ALLOW_HTTP === '1'))) {
  console.error('VITE_LUMEN_API_URL must be an absolute https URL, e.g. https://lumen.example.org/api');
  console.error('(set LUMEN_ALLOW_HTTP=1 to allow http:// for local device tests – the stores require https)');
  process.exit(1);
}
for (const v of ['VITE_LUMEN_OPERATOR', 'VITE_LUMEN_CONTACT']) {
  if (!process.env[v]) console.warn(`warning: ${v} is not set – the in-app legal pages will be incomplete`);
}

const root = resolve(import.meta.dirname, '../../..');
const r = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
process.exit(r.status ?? 1);
