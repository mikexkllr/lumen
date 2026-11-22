/**
 * Base URL of the Lumen server (sync, Lux tutor, social). Same origin `/api`
 * by default; native apps and split deployments set VITE_LUMEN_API_URL to an
 * absolute URL, e.g. https://lumen.example.org/api.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const API_BASE = (env.VITE_LUMEN_API_URL || env.VITE_LUMEN_TUTOR_URL || '/api').replace(/\/$/, '');

/** Default sync server shown in the profile. */
export const DEFAULT_SYNC_URL = (env.VITE_LUMEN_SYNC_URL || API_BASE).replace(/\/$/, '');

export const apiUrl = (base: string, path: string) => `${base.replace(/\/$/, '')}${path}`;
