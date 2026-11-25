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
// E2E_TUTOR=fake: a stand-in language model that answers like Lux (for the store screenshots)
const fakeTutor = process.env.E2E_TUTOR === 'fake';
const fakeModel = (async (_url: string | URL | Request, init?: RequestInit) => {
  const body = String(init?.body ?? '');
  const de = /Roboter|Aufgabe|Feld|Flagge|ä|ö|ü/.test(body);
  const content = de
    ? 'Zähl erst mal die Felder bis zur Flagge. Wie oft muss der Roboter dafür »vorwärts« fahren – und wann muss er sich drehen?'
    : 'First count the squares to the flag. How many times does the robot have to move forward – and when does it need to turn?';
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
}) as typeof fetch;
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
  tutor: fakeTutor ? { url: 'https://model.e2e.test/v1', model: 'lux-demo', provider: 'Demo', maxTokens: 300, temperature: 0.3, timeoutMs: 5000 } : null,
  fetchImpl: fakeTutor ? fakeModel : undefined,
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
