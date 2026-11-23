import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildServer } from './app.ts';
import { sqliteStore } from './store.ts';
import { tutorConfigFromEnv, warmUp } from './tutor.ts';
import { socialStore } from './social/store.ts';
import { tutorReportStore } from './reports.ts';

const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = resolve(process.env.LUMEN_DB ?? resolve(import.meta.dirname, '../data/lumen.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const origins = process.env.LUMEN_CORS_ORIGINS ? process.env.LUMEN_CORS_ORIGINS.split(',').map((s) => s.trim()) : '*';

const tutor = tutorConfigFromEnv();
const social = process.env.LUMEN_SOCIAL === 'off' ? null : socialStore(dbPath);
const adminToken = process.env.LUMEN_ADMIN_TOKEN || null;
if (adminToken && adminToken.length < 16) console.warn('LUMEN_ADMIN_TOKEN is shorter than 16 characters – moderation endpoints stay disabled.');
const app = buildServer({ store: sqliteStore(dbPath), corsOrigins: origins, rateLimit: Number(process.env.LUMEN_RATE_LIMIT ?? 120), logger: true, tutor, tutorRateLimit: Number(process.env.LUMEN_TUTOR_RATE_LIMIT ?? 30), social, reports: tutorReportStore(dbPath), adminToken });
app.listen({ port, host }).then(() => console.log(`Lumen server on http://${host}:${port} (db: ${dbPath}; tutor: ${tutor ? `${tutor.model} @ ${tutor.url}` : 'rules only'}; social: ${social ? 'on' : 'off'}; moderation: ${adminToken && adminToken.length >= 16 ? 'on' : 'off'})`));

if (tutor && /localhost|127\.0\.0\.1/.test(tutor.url)) void warmUp(tutor).then((ok) => console.log(ok ? `Lux: ${tutor.model} geladen` : `Lux: ${tutor.url} nicht erreichbar – Regel-Tutor aktiv`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.close().then(() => process.exit(0)));
