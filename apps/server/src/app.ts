/**
 * Lumen sync server (AGPL-3.0-or-later).
 *
 * Data-minimal by design: no email, no password, no profile. A client sends a
 * random sync code; the server only ever stores SHA-256(code) and the
 * append-only learning events. Merging is idempotent (event UUIDs), so XP and
 * streaks stay deterministic on every device.
 */
import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import type { EventStore } from './store.ts';
import { parseTutorRequest, tutorReply, type TutorConfig } from './tutor.ts';
import { clientToday } from './social/logic.ts';
import { registerSocialRoutes, socialService } from './social/routes.ts';
import type { SocialStore } from './social/store.ts';
import { adminOk } from './admin.ts';
import { parseTutorReport, type TutorReportStore } from './reports.ts';

const EVENT_TYPES = new Set(['attempt', 'concept_completed', 'review', 'review_session_completed', 'placement_completed']);
const MAX_EVENTS_PER_REQUEST = 1000;
const MAX_EVENT_BYTES = 8 * 1024;
const PAGE = 2000;

export interface ServerOptions {
  store: EventStore;
  /** Allowed CORS origins ('*' or a list). */
  corsOrigins?: string[] | '*';
  /** Requests per minute per client IP. */
  rateLimit?: number;
  logger?: boolean;
  /** Lux tutor model; null answers with the rule tutor only. */
  tutor?: TutorConfig | null;
  /** Tutor requests per minute per client IP. */
  tutorRateLimit?: number;
  fetchImpl?: typeof fetch;
  /** Social features (profiles, friends, leagues, feed); null or absent disables them. */
  social?: SocialStore | null;
  /** Reports of Lux replies; null or absent disables reporting. */
  reports?: TutorReportStore | null;
  /** Secret for the moderation endpoints under /v1/admin. */
  adminToken?: string | null;
  now?: () => number;
}

export function accountKey(token: string): string {
  return createHash('sha256').update(`lumen-sync:${token}`).digest('hex');
}

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer ([A-Z0-9-]{24,64})$/.exec(h);
  return m ? m[1].replace(/-/g, '') : null;
}

export function validateEvent(e: unknown): string | null {
  if (!e || typeof e !== 'object' || Array.isArray(e)) return 'event must be an object';
  const ev = e as Record<string, unknown>;
  if (typeof ev.id !== 'string' || !/^[A-Za-z0-9-]{8,64}$/.test(ev.id)) return 'invalid id';
  if (typeof ev.type !== 'string' || !EVENT_TYPES.has(ev.type)) return 'invalid type';
  if (typeof ev.ts !== 'number' || !Number.isFinite(ev.ts)) return 'invalid ts';
  if (typeof ev.day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(ev.day)) return 'invalid day';
  if (JSON.stringify(ev).length > MAX_EVENT_BYTES) return 'event too large';
  return null;
}

export function buildServer(opts: ServerOptions): FastifyInstance {
  const app = Fastify({
    logger: opts.logger ? { level: 'warn', redact: ['req.headers.authorization'] } : false,
    bodyLimit: 4 * 1024 * 1024,
    trustProxy: true,
  });
  const origins = opts.corsOrigins ?? '*';
  const limit = opts.rateLimit ?? 120;
  const buckets = new Map<string, { count: number; reset: number }>();

  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && (origins === '*' || origins.includes(origin))) {
      reply.header('Access-Control-Allow-Origin', origins === '*' ? '*' : origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      reply.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      reply.header('Access-Control-Max-Age', '600');
    }
    reply.header('Cache-Control', 'no-store');
    reply.header('X-Content-Type-Options', 'nosniff');
    if (req.method === 'OPTIONS') return reply.code(204).send();
    // simple fixed-window rate limit per IP (kept in memory, nothing persisted)
    const now = Date.now();
    const b = buckets.get(req.ip);
    if (!b || b.reset < now) buckets.set(req.ip, { count: 1, reset: now + 60_000 });
    else if (++b.count > limit) return reply.code(429).send({ error: 'rate_limited' });
    if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  });

  app.get('/healthz', async () => ({ ok: true }));

  const social = opts.social ?? null;
  const now = opts.now ?? Date.now;
  const deps = social ? { events: opts.store, social, account: (req: FastifyRequest) => { const t = bearer(req); return t ? accountKey(t) : null; }, adminToken: opts.adminToken, now } : null;
  const service = deps ? socialService(deps) : null;
  app.get('/v1/features', async () => ({ sync: true, tutor: true, social: !!social }));
  if (deps && service) registerSocialRoutes(app, deps, service);

  const tutor = opts.tutor ?? null;
  const tutorLimit = opts.tutorRateLimit ?? 30;
  const tutorBuckets = new Map<string, { count: number; reset: number }>();
  app.get('/v1/tutor', async () => {
    const local = tutor ? /localhost|127\.0\.0\.1|host\.docker\.internal|ollama/.test(tutor.url) : false;
    // Shown in the app's consent dialog before Lux first uses the model.
    let provider: string | null = null;
    if (tutor && !local) provider = tutor.provider || (() => { try { return new URL(tutor.url).hostname; } catch { return null; } })();
    return { enabled: true, model: tutor ? tutor.model : null, local, provider, reports: !!opts.reports };
  });

  const reportBuckets = new Map<string, { count: number; reset: number }>();
  app.post('/v1/tutor/reports', async (req, reply) => {
    if (!opts.reports) return reply.code(404).send({ error: 'not_found' });
    const t = Date.now();
    const b = reportBuckets.get(req.ip);
    if (!b || b.reset < t) reportBuckets.set(req.ip, { count: 1, reset: t + 3_600_000 });
    else if (++b.count > 20) return reply.code(429).send({ error: 'rate_limited' });
    const parsed = parseTutorReport(req.body);
    if (typeof parsed === 'string') return reply.code(400).send({ error: 'invalid_report', detail: parsed });
    return { id: opts.reports.add(parsed) };
  });
  app.get('/v1/admin/tutor-reports', async (req, reply) => {
    if (!opts.reports || !adminOk(req, opts.adminToken)) return reply.code(opts.adminToken ? 401 : 404).send({ error: opts.adminToken ? 'unauthorized' : 'not_found' });
    const resolved = (req.query as Record<string, unknown>)?.resolved === '1';
    return { reports: opts.reports.list(resolved).map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })) };
  });
  app.post('/v1/admin/tutor-reports/:id/resolve', async (req, reply) => {
    if (!opts.reports || !adminOk(req, opts.adminToken)) return reply.code(opts.adminToken ? 401 : 404).send({ error: opts.adminToken ? 'unauthorized' : 'not_found' });
    return { resolved: opts.reports.resolve(Number((req.params as { id: string }).id)) };
  });
  app.post('/v1/tutor', async (req, reply) => {
    const now = Date.now();
    const b = tutorBuckets.get(req.ip);
    if (!b || b.reset < now) tutorBuckets.set(req.ip, { count: 1, reset: now + 60_000 });
    else if (++b.count > tutorLimit) return reply.code(429).send({ error: 'rate_limited' });
    const parsed = parseTutorRequest(req.body);
    if (typeof parsed === 'string') return reply.code(400).send({ error: 'invalid_request', detail: parsed });
    const out = await tutorReply(tutor, parsed, opts.fetchImpl);
    // reason only – never the learner's messages
    if (out.fallback && out.fallback !== 'disabled') req.log.warn({ tutorFallback: out.fallback, intent: parsed.intent }, 'tutor fell back to rules');
    return out;
  });

  app.post('/v1/sync', async (req, reply) => {
    const token = bearer(req);
    if (!token) return reply.code(401).send({ error: 'missing_or_invalid_sync_code' });
    const body = req.body as { events?: unknown; since?: unknown; today?: unknown } | undefined;
    const events = Array.isArray(body?.events) ? body!.events : [];
    const since = typeof body?.since === 'number' && body.since >= 0 ? Math.floor(body.since) : 0;
    if (events.length > MAX_EVENTS_PER_REQUEST) return reply.code(413).send({ error: 'too_many_events', max: MAX_EVENTS_PER_REQUEST });
    for (const e of events) {
      const err = validateEvent(e);
      if (err) return reply.code(400).send({ error: 'invalid_event', detail: err });
    }
    const account = accountKey(token);
    const inserted = opts.store.insert(account, events as { id: string }[]);
    if (service && social) {
      const today = clientToday(body?.today, now());
      const p = social.profile(account);
      if (p && (inserted > 0 || !p.lastToday || p.lastToday < today)) service.refresh(account, today);
    }
    const { events: out, cursor } = opts.store.since(account, since, PAGE);
    return { events: out, cursor, more: out.length === PAGE };
  });

  app.get('/v1/export', async (req, reply) => {
    const token = bearer(req);
    if (!token) return reply.code(401).send({ error: 'missing_or_invalid_sync_code' });
    const { events } = opts.store.since(accountKey(token), 0, Number.MAX_SAFE_INTEGER);
    return { format: 'lumen-events', version: 1, events };
  });

  app.delete('/v1/account', async (req, reply) => {
    const token = bearer(req);
    if (!token) return reply.code(401).send({ error: 'missing_or_invalid_sync_code' });
    const account = accountKey(token);
    const removed = opts.store.deleteAccount(account);
    social?.deleteAccount(account);
    return { deleted: removed };
  });

  return app;
}
