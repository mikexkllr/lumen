/**
 * Lumen server for the end-to-end tests: the real API (accounts, sync, community, Lux rules,
 * moderation) on in-memory SQLite. Login mails are kept in memory instead of being sent, and
 * two test-only routes expose them: GET /__e2e/code?email=… returns the latest code.
 */
import { buildServer } from '../apps/server/src/app.ts';
import { authStore } from '../apps/server/src/auth.ts';
import { tutorReportStore } from '../apps/server/src/reports.ts';
import { socialStore } from '../apps/server/src/social/store.ts';
import { sqliteStore } from '../apps/server/src/store.ts';
import type { Mail } from '../apps/server/src/mail.ts';

const port = Number(process.env.E2E_API_PORT ?? 8790);
const codes = new Map<string, string>();

const app = buildServer({
  store: sqliteStore(':memory:'),
  social: socialStore(':memory:'),
  auth: authStore(':memory:'),
  reports: tutorReportStore(':memory:'),
  adminToken: 'e2e-admin-token-0123456789',
  rateLimit: 100_000,
  tutorRateLimit: 100_000,
  signInLimits: { mailPerHour: 10_000, verifyPer10Min: 10_000, applePer10Min: 10_000 },
  tutor: null,
  email: {
    pepper: 'e2e-pepper-0123456789',
    send: async (m: Mail) => {
      const code = /\b(\d{6})\b/.exec(m.text)?.[1];
      if (code) codes.set(m.to.toLowerCase(), code);
    },
  },
});

app.get('/__e2e/code', async (req, reply) => {
  const email = String((req.query as { email?: string }).email ?? '').toLowerCase();
  const code = codes.get(email);
  return code ? { code } : reply.code(404).send({ error: 'no_code' });
});

app.listen({ port, host: '127.0.0.1' }).then(() => console.log(`e2e api on http://127.0.0.1:${port}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => app.close().then(() => process.exit(0)));
