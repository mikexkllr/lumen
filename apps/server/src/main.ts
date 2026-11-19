import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildServer } from './app.ts';
import { sqliteStore } from './store.ts';
import { tutorConfigFromEnv, warmUp } from './tutor.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = resolve(process.env.LUMEN_DB ?? resolve(import.meta.dirname, '../data/lumen.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const origins = process.env.LUMEN_CORS_ORIGINS ? process.env.LUMEN_CORS_ORIGINS.split(',').map((s) => s.trim()) : '*';

const tutor = tutorConfigFromEnv();
const app = buildServer({ store: sqliteStore(dbPath), corsOrigins: origins, rateLimit: Number(process.env.LUMEN_RATE_LIMIT ?? 120), logger: true, tutor, tutorRateLimit: Number(process.env.LUMEN_TUTOR_RATE_LIMIT ?? 30) });
app.listen({ port, host }).then(() => console.log(`Lumen server on http://${host}:${port} (db: ${dbPath}; tutor: ${tutor ? `${tutor.model} @ ${tutor.url}` : 'rules only'})`));

if (tutor && /localhost|127\.0\.0\.1/.test(tutor.url)) void warmUp(tutor).then((ok) => console.log(ok ? `Lux: ${tutor.model} geladen` : `Lux: ${tutor.url} nicht erreichbar – Regel-Tutor aktiv`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.close().then(() => process.exit(0)));
