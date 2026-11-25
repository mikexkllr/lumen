/**
 * Server crash reports with Sentry (EU region), only when SENTRY_DSN is set. Errors only – no
 * tracing – and nothing about learners: no user, IP, headers (Authorization carries the device
 * code), cookies, query strings or request bodies (they can hold an email address or a Lux
 * message). Emails and device codes are also removed from messages.
 */
import * as Sentry from '@sentry/node';
import type { FastifyInstance } from 'fastify';

const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi;
const CODE = /\b[A-HJ-NP-Z2-9]{4}(?:-?[A-HJ-NP-Z2-9]{4}){4}\b/g;
export const scrub = (s: string) => s.replace(EMAIL, '[email]').replace(CODE, '[code]');

export function cleanServerEvent<T extends Sentry.ErrorEvent>(event: T): T {
  delete event.user;
  if (event.request) event.request = { method: event.request.method, url: event.request.url?.split('?')[0] };
  delete event.server_name;
  if (event.message) event.message = scrub(event.message);
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrub(ex.value);
  event.breadcrumbs = event.breadcrumbs?.map((b) => ({ ...b, message: b.message ? scrub(b.message) : b.message, data: undefined }));
  return event;
}

let on = false;

export function initServerMonitoring(env = process.env): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT || 'production',
    release: env.SENTRY_RELEASE || undefined,
    tracesSampleRate: 0,
    // errors come from the onError hook below (only 5xx); the automatic instrumentation stays off
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Fastify'),
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    beforeSend: cleanServerEvent,
  });
  on = true;
  return true;
}

/** Reports unexpected errors (HTTP 5xx) of the API; client errors (4xx) are normal and stay out. */
export function monitorFastify(app: FastifyInstance): void {
  if (!on) return;
  app.addHook('onError', async (req, _reply, error) => {
    if (((error as { statusCode?: number }).statusCode ?? 500) < 500) return;
    Sentry.captureException(error, { tags: { route: req.routeOptions?.url ?? 'unknown', method: req.method } });
  });
}

export const captureServerError = (e: unknown) => on && Sentry.captureException(e);
