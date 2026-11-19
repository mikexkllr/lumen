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
      reply.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

  const tutor = opts.tutor ?? null;
  const tutorLimit = opts.tutorRateLimit ?? 30;
  const tutorBuckets = new Map<string, { count: number; reset: number }>();
  app.get('/v1/tutor', async () => ({ enabled: true, model: tutor ? tutor.model : null, local: tutor ? /localhost|127\.0\.0\.1/.test(tutor.url) : false }));
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
    const body = req.body as { events?: unknown; since?: unknown } | undefined;
    const events = Array.isArray(body?.events) ? body!.events : [];
    const since = typeof body?.since === 'number' && body.since >= 0 ? Math.floor(body.since) : 0;
    if (events.length > MAX_EVENTS_PER_REQUEST) return reply.code(413).send({ error: 'too_many_events', max: MAX_EVENTS_PER_REQUEST });
    for (const e of events) {
      const err = validateEvent(e);
      if (err) return reply.code(400).send({ error: 'invalid_event', detail: err });
    }
    const account = accountKey(token);
    opts.store.insert(account, events as { id: string }[]);
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
    const removed = opts.store.deleteAccount(accountKey(token));
    return { deleted: removed };
  });

  return app;
}
