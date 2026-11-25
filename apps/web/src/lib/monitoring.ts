/**
 * Crash reports with Sentry (EU region), set up to be as data-sparse as possible: errors only –
 * no tracing, no session replay, no user, no IP address (dataCollection off, and IPs are not
 * stored in the Sentry project), and no request data. Email addresses and device codes are
 * removed from messages and breadcrumbs before anything is sent. Only active when the build
 * has a DSN (VITE_SENTRY_DSN), so self-hosted builds send nothing unless their operator sets one.
 */
import * as Sentry from '@sentry/react';
import type { ErrorEvent, Breadcrumb } from '@sentry/react';

const env = import.meta.env as Record<string, string | undefined>;
const DSN = env.VITE_SENTRY_DSN ?? '';

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string };
const platform = () => {
  const c = (globalThis as { Capacitor?: Cap }).Capacitor;
  return c?.isNativePlatform?.() ? (c.getPlatform?.() ?? 'native') : 'web';
};

const EMAIL = /[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}/gi;
/** Device and sync codes: five groups of four from the code alphabet. */
const CODE = /\b[A-HJ-NP-Z2-9]{4}(?:-?[A-HJ-NP-Z2-9]{4}){4}\b/g;
export const scrub = (s: string) => s.replace(EMAIL, '[email]').replace(CODE, '[code]');

function scrubDeep<T>(v: T, depth = 0): T {
  if (depth > 6 || v == null) return v;
  if (typeof v === 'string') return scrub(v) as T;
  if (Array.isArray(v)) return v.map((x) => scrubDeep(x, depth + 1)) as T;
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = /^(authorization|token|cookie|password|email|code)$/i.test(k) ? '[removed]' : scrubDeep(x, depth + 1);
    return out as T;
  }
  return v;
}

/** What leaves the device: the error, the stack, the app version and the screen – nothing about the learner. */
export function cleanEvent(event: ErrorEvent): ErrorEvent | null {
  delete event.user;
  delete event.request;
  delete event.server_name;
  if (event.message) event.message = scrub(event.message);
  for (const ex of event.exception?.values ?? []) if (ex.value) ex.value = scrub(ex.value);
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map((b) => cleanBreadcrumb(b)).filter((b): b is Breadcrumb => !!b);
  if (event.extra) event.extra = scrubDeep(event.extra);
  if (event.contexts) event.contexts = scrubDeep(event.contexts);
  return event;
}

export function cleanBreadcrumb(b: Breadcrumb): Breadcrumb | null {
  // Console output may contain anything the app logged; keep only its level.
  if (b.category === 'console') return { ...b, message: undefined, data: undefined };
  const out = { ...b };
  if (out.message) out.message = scrub(out.message);
  if (out.data) {
    const data = { ...out.data };
    if (typeof data.url === 'string') data.url = scrub(data.url.split('?')[0]);
    delete data.body;
    out.data = scrubDeep(data);
  }
  return out;
}

let on = false;

export function initMonitoring(release: string): boolean {
  if (!DSN || env.VITE_LUMEN_E2E === '1') return false;
  on = true;
  Sentry.init({
    dsn: DSN,
    release,
    // stack traces for messages too, deeper extra data, a longer trail of what happened before
    attachStacktrace: true,
    normalizeDepth: 6,
    maxBreadcrumbs: 100,
    initialScope: { tags: { platform: platform(), version: __LUMEN_VERSION__ } },
    environment: platform() === 'web' ? (import.meta.env.PROD ? 'web' : 'development') : platform(),
    // nothing about the person: no user fields, cookies, headers, bodies or query strings
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false },
    tracesSampleRate: 0,
    // the default integrations without the ones that would collect more than errors
    integrations: (defaults) => defaults.filter((i) => !['BrowserSession', 'Replay', 'BrowserTracing'].includes(i.name)),
    beforeSend: cleanEvent,
    beforeBreadcrumb: (b) => cleanBreadcrumb(b),
    // network errors of an offline phone are not bugs
    ignoreErrors: [/Failed to fetch/, /NetworkError/, /Load failed/, /The network connection was lost/, /AbortError/, /TimeoutError/],
  });
  return true;
}

type Tags = Record<string, string | number | boolean | null | undefined>;

/** Tags on every later report, e.g. the screen, locale or the lesson step (never personal data). */
export function setMonitoringContext(tags: Tags): void {
  if (!on) return;
  for (const [k, v] of Object.entries(tags)) Sentry.setTag(k, v == null ? undefined : String(v));
}

/** The screen as a pattern: content ids stay (they help to reproduce), learner ids don't. */
export function screenOf(route: string[]): string {
  const [head = 'home', a, b] = route;
  if (head === 'u') return 'u/:user';
  if (head === 'practice') return a === 'unit' ? `practice/unit/${b ?? ''}` : 'practice/items';
  return [head, a, b].filter(Boolean).join('/');
}

/** Records a screen change: a navigation breadcrumb and the `screen` tag. */
export function trackScreen(route: string[]): void {
  if (!on) return;
  const screen = screenOf(route);
  Sentry.addBreadcrumb({ category: 'navigation', message: screen, level: 'info' });
  Sentry.setTag('screen', screen);
}

/** Reports an error the app handled (and the learner may not have noticed), with context. */
export function reportHandled(e: unknown, area: string, extra: Record<string, unknown> = {}): void {
  if (!on) return;
  Sentry.withScope((scope) => {
    scope.setTag('area', area);
    scope.setContext('details', extra);
    Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
  });
}

export const ErrorBoundary = Sentry.ErrorBoundary;
export const reactErrorHandler = Sentry.reactErrorHandler;
