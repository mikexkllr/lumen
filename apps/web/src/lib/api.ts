/**
 * Base URL of the Lumen server (sync, Lux tutor, social). The build sets the
 * default – same origin `/api` for the website, the operator's server
 * (VITE_LUMEN_API_URL, absolute https) for the store apps. Learners can point
 * the app to another Lumen server in the profile; that override wins.
 */
const env = import.meta.env as Record<string, string | undefined>;

/** Default server baked into this build. */
export const API_BASE = (env.VITE_LUMEN_API_URL || env.VITE_LUMEN_TUTOR_URL || '/api').replace(/\/$/, '');

let override: string | null = null;
const listeners = new Set<() => void>();

export function normalizeServerUrl(u: string): string {
  return u.trim().replace(/\/+$/, '');
}

/** https everywhere; plain http only for a server on this machine (development). */
export function isValidServerUrl(u: string): boolean {
  try {
    const url = new URL(normalizeServerUrl(u));
    return url.protocol === 'https:' || (url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname));
  } catch {
    return false;
  }
}

/** Set by the app store from the learner's settings (null: use the build default). */
export function setServerOverride(u: string | null): void {
  const next = u ? normalizeServerUrl(u) : null;
  if (next === override) return;
  override = next;
  listeners.forEach((f) => f());
}

export function onServerChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** The server the app talks to right now. */
export function apiBase(): string {
  return override ?? API_BASE;
}

/** Default sync server shown in the profile. */
export function defaultSyncUrl(): string {
  return override ?? (env.VITE_LUMEN_SYNC_URL || API_BASE).replace(/\/$/, '');
}

export const apiUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;

/** Checks that a URL is a Lumen server and what it offers. */
export async function probeServer(u: string): Promise<{ sync: boolean; tutor: boolean; social: boolean } | null> {
  try {
    const res = await fetch(apiUrl(normalizeServerUrl(u), '/v1/features'), { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const f = (await res.json()) as { sync?: boolean; tutor?: boolean; social?: boolean };
    return f.sync ? { sync: !!f.sync, tutor: !!f.tutor, social: !!f.social } : null;
  } catch {
    return null;
  }
}
