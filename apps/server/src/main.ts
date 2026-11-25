import { captureServerError, captureServerWarning, initServerMonitoring, monitorFastify } from './monitoring.ts';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { buildServer } from './app.ts';
import { sqliteStore } from './store.ts';
import { tutorConfigFromEnv, warmUp } from './tutor.ts';
import { socialStore } from './social/store.ts';
import { tutorReportStore } from './reports.ts';
import { appleConfigFromEnv, authStore, normalizeEmail } from './auth.ts';
import { mailConfigFromEnv, smtpSender } from './mail.ts';

const monitoring = initServerMonitoring();
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '0.0.0.0';
const dbPath = resolve(process.env.LUMEN_DB ?? resolve(import.meta.dirname, '../data/lumen.sqlite'));
mkdirSync(dirname(dbPath), { recursive: true });
const origins = process.env.LUMEN_CORS_ORIGINS ? process.env.LUMEN_CORS_ORIGINS.split(',').map((s) => s.trim()) : '*';

const tutor = tutorConfigFromEnv();
const social = process.env.LUMEN_SOCIAL === 'off' ? null : socialStore(dbPath);
const adminToken = process.env.LUMEN_ADMIN_TOKEN || null;
if (adminToken && adminToken.length < 16) console.warn('LUMEN_ADMIN_TOKEN is shorter than 16 characters – moderation endpoints stay disabled.');
/** Store review login: LUMEN_REVIEW_EMAIL signs in with the six-digit LUMEN_REVIEW_CODE, no mail. */
function reviewLogin() {
  const email = process.env.LUMEN_REVIEW_EMAIL ?? '';
  const code = process.env.LUMEN_REVIEW_CODE ?? '';
  if (!email && !code) return null;
  if (!normalizeEmail(email) || !/^\d{6}$/.test(code)) {
    console.warn('LUMEN_REVIEW_EMAIL and a six-digit LUMEN_REVIEW_CODE are both needed – the review login stays off.');
    return null;
  }
  return { email, code };
}
function emailLogin() {
  const mail = mailConfigFromEnv();
  const pepper = process.env.LUMEN_EMAIL_PEPPER ?? '';
  // Development only: print login codes instead of sending mail.
  if (!mail && process.env.LUMEN_MAIL_LOG === '1') {
    return { send: async (m: { to: string; subject: string }) => console.log(`[mail] to ${m.to}: ${m.subject}`), pepper: pepper || 'development-pepper-only', review: reviewLogin() };
  }
  if (!mail) return null;
  if (pepper.length < 16) {
    console.warn('LUMEN_EMAIL_PEPPER (at least 16 characters) is missing – email sign-in stays off.');
    return null;
  }
  return { send: smtpSender(mail), pepper, review: reviewLogin() };
}
const app = buildServer({ store: sqliteStore(dbPath), corsOrigins: origins, rateLimit: Number(process.env.LUMEN_RATE_LIMIT ?? 120), logger: true, tutor, tutorRateLimit: Number(process.env.LUMEN_TUTOR_RATE_LIMIT ?? 30), social, reports: tutorReportStore(dbPath), adminToken, auth: authStore(dbPath), apple: appleConfigFromEnv(), email: emailLogin(), setup: monitorFastify, reportError: captureServerError, reportWarning: captureServerWarning });
app.listen({ port, host }).then(() => console.log(`Lumen server on http://${host}:${port} (db: ${dbPath}; tutor: ${tutor ? `${tutor.model} @ ${tutor.url}` : 'rules only'}; social: ${social ? 'on' : 'off'}; moderation: ${adminToken && adminToken.length >= 16 ? 'on' : 'off'}; apple sign-in: ${appleConfigFromEnv() ? 'on' : 'off'}; email sign-in: ${mailConfigFromEnv() ? 'on' : 'off'}; crash reports: ${monitoring ? 'on' : 'off'})`));

if (tutor && /localhost|127\.0\.0\.1/.test(tutor.url)) void warmUp(tutor).then((ok) => console.log(ok ? `Lux: ${tutor.model} geladen` : `Lux: ${tutor.url} nicht erreichbar – Regel-Tutor aktiv`));

for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.close().then(() => process.exit(0)));
