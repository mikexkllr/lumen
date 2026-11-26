/**
 * Sign-in on top of the sync code: "Sign in with Apple" (iOS app, native plugin AppleSignIn in
 * apps/mobile/ios), "Sign in with Google" (everywhere) and six-digit codes by email
 * (everywhere). All link to the sync account, so a new device gets the same progress. Apple and
 * Google share no name and no email with the server; it keeps only hashes of their user ids
 * and of the email address.
 *
 * Google: the iOS app opens Google in the system sign-in sheet (plugin GoogleSignIn, PKCE), the
 * Android app uses Credential Manager (plugin GoogleSignIn), and the web app sends the whole
 * page to Google and back (OpenID Connect, response_type=id_token) – no Google script on the page.
 */
import { registerPlugin } from '@capacitor/core';

interface AppleSignInPlugin {
  authorize(opts: { nonce: string }): Promise<{ identityToken: string; authorizationCode?: string; user: string }>;
}
const Native = registerPlugin<AppleSignInPlugin>('AppleSignIn');

interface GoogleSignInPlugin {
  /** clientId: the iOS client (iOS) or the web client as server client id (Android). */
  authorize(opts: { clientId: string; nonce: string }): Promise<{ idToken: string }>;
}
const NativeGoogle = registerPlugin<GoogleSignInPlugin>('GoogleSignIn');

export type Provider = 'apple' | 'google' | 'email';
export type Linked = Record<Provider, boolean>;
export const PROVIDERS: Provider[] = ['apple', 'google', 'email'];

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string };
function nativePlatform(): 'ios' | 'android' | null {
  const c = (globalThis as { Capacitor?: Cap }).Capacitor;
  if (c?.isNativePlatform?.() !== true) return null;
  const p = c.getPlatform?.();
  return p === 'ios' || p === 'android' ? p : null;
}
export function isIOSApp(): boolean {
  return nativePlatform() === 'ios';
}

const base = (u: string) => u.replace(/\/$/, '');

/**
 * Which sign-in methods this device and server offer: Apple only in the iOS app; Google with
 * the OAuth client this platform needs (`google` is that client id, or null).
 */
export async function signInMethods(serverUrl: string): Promise<{ apple: boolean; google: string | null; email: boolean }> {
  try {
    const r = await fetch(`${base(serverUrl)}/v1/features`, { signal: AbortSignal.timeout(4000) });
    const f = r.ok ? ((await r.json()) as { apple?: boolean; email?: boolean; google?: { web?: string | null; ios?: string | null } | null }) : {};
    const g = f.google ?? null;
    const google = (nativePlatform() === 'ios' ? g?.ios : g?.web) || null;
    return { apple: isIOSApp() && f.apple === true, google, email: f.email === true };
  } catch {
    return { apple: false, google: null, email: false };
  }
}

export class SignInError extends Error {
  code: 'canceled' | 'linked_elsewhere' | 'other_identity' | 'wrong_code' | 'expired' | 'rate_limited' | 'failed';
  constructor(code: SignInError['code'], message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
const randomHex = (bytes: number) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Shows Apple's sheet and sends the result to the server. With `token` (the current sync code)
 * Apple is linked to that account; without it the server signs in and returns a device code.
 */
export async function appleSignIn(serverUrl: string, token?: string): Promise<{ token?: string; created?: boolean }> {
  const nonce = randomHex(24);
  let res;
  try {
    res = await Native.authorize({ nonce: await sha256Hex(nonce) });
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new SignInError(code === 'canceled' ? 'canceled' : 'failed', (e as Error).message);
  }
  const r = await fetch(`${base(serverUrl)}/v1/auth/apple`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ identityToken: res.identityToken, authorizationCode: res.authorizationCode, nonce }),
  });
  return signInResult(r);
}

/**
 * "Sign in with Google" with the client id from signInMethods. In the apps it resolves like
 * appleSignIn; on the web the page goes to Google and comes back, and the promise never
 * resolves – SignInOptions picks the result up with takeGoogleRedirect.
 */
export async function googleSignIn(serverUrl: string, clientId: string, token?: string): Promise<{ token?: string; created?: boolean }> {
  const nonce = randomHex(24);
  if (!nativePlatform()) {
    await startGoogleRedirect(serverUrl, clientId, nonce, !!token);
    return new Promise(() => {});
  }
  let idToken: string;
  try {
    ({ idToken } = await NativeGoogle.authorize({ clientId, nonce: await sha256Hex(nonce) }));
  } catch (e) {
    const code = (e as { code?: string }).code;
    throw new SignInError(code === 'canceled' ? 'canceled' : 'failed', (e as Error).message);
  }
  return googleFinish(serverUrl, idToken, nonce, token);
}

/** Sends Google's ID token to the server (with `token` it links, without it signs in). */
export async function googleFinish(serverUrl: string, idToken: string, nonce: string, token?: string): Promise<{ token?: string; created?: boolean }> {
  const r = await fetch(`${base(serverUrl)}/v1/auth/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ idToken, nonce }),
  });
  return signInResult(r);
}

const PENDING = 'lumen.google';
type Pending = { state: string; nonce: string; serverUrl: string; link: boolean; route: string; at: number };
export type GoogleRedirect = { serverUrl: string; link: boolean } & ({ idToken: string; nonce: string } | { error: string });

/** Google sends the browser back to the app's own address (registered as redirect URI). */
export const googleRedirectUri = () => location.origin + location.pathname.replace(/index\.html$/, '');

async function startGoogleRedirect(serverUrl: string, clientId: string, nonce: string, link: boolean): Promise<void> {
  const state = randomHex(16);
  const pending: Pending = { state, nonce, serverUrl, link, route: location.hash, at: Date.now() };
  sessionStorage.setItem(PENDING, JSON.stringify(pending));
  const q = new URLSearchParams({ client_id: clientId, redirect_uri: googleRedirectUri(), response_type: 'id_token', scope: 'openid', nonce: await sha256Hex(nonce), state, prompt: 'select_account' });
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
}

let redirect: GoogleRedirect | null = null;

/**
 * Called once before the app renders (and before crash reporting starts): takes Google's answer
 * out of the address (#id_token=…&state=…), puts the screen the user started from back and
 * keeps the answer for takeGoogleRedirect. Answers that don't match the started sign-in are dropped.
 */
export function captureGoogleRedirect(): void {
  const h = location.hash;
  if (!/[#&]state=/.test(h) || !/[#&](id_token|error)=/.test(h)) return;
  const params = new URLSearchParams(h.slice(1));
  let pending: Pending | null = null;
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING) ?? 'null') as Pending | null;
    sessionStorage.removeItem(PENDING);
  } catch {
    pending = null;
  }
  history.replaceState(null, '', `${location.pathname}${location.search}${pending?.route || '#/'}`);
  if (!pending || params.get('state') !== pending.state || Date.now() - pending.at > 30 * 60_000) return;
  const idToken = params.get('id_token');
  const common = { serverUrl: pending.serverUrl, link: pending.link };
  redirect = idToken ? { ...common, idToken, nonce: pending.nonce } : { ...common, error: params.get('error') ?? 'failed' };
}

/** Google's answer for this sign-in form (same server, signing in vs. linking), once. */
export function takeGoogleRedirect(serverUrl: string, link: boolean): GoogleRedirect | null {
  if (!redirect || redirect.serverUrl !== serverUrl || redirect.link !== link) return null;
  const r = redirect;
  redirect = null;
  return r;
}

async function signInResult(r: Response): Promise<{ token?: string; created?: boolean }> {
  const body = (await r.json().catch(() => ({}))) as { error?: string; token?: string; created?: boolean };
  if (r.ok) return body;
  if (r.status === 409) throw new SignInError(body.error === 'account_has_other_identity' ? 'other_identity' : 'linked_elsewhere');
  if (r.status === 429) throw new SignInError('rate_limited');
  if (body.error === 'code_wrong') throw new SignInError('wrong_code');
  if (body.error === 'code_expired' || body.error === 'code_locked') throw new SignInError('expired');
  throw new SignInError('failed', `HTTP ${r.status}`);
}

/** Sends a six-digit sign-in code to the address. */
export async function emailStart(serverUrl: string, email: string, locale: string): Promise<void> {
  const r = await fetch(`${base(serverUrl)}/v1/auth/email/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, locale }) });
  if (r.status === 429) throw new SignInError('rate_limited');
  if (!r.ok) throw new SignInError('failed', `HTTP ${r.status}`);
}

/** Checks the code; with `token` it links the address to that account, without it signs in. */
export async function emailVerify(serverUrl: string, email: string, code: string, token?: string): Promise<{ token?: string; created?: boolean }> {
  const r = await fetch(`${base(serverUrl)}/v1/auth/email/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ email, code }),
  });
  return signInResult(r);
}

export async function unlinkSignIn(serverUrl: string, token: string, provider: Provider): Promise<void> {
  await fetch(`${base(serverUrl)}/v1/auth/${provider}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

/** Which sign-in methods are linked to this account; null if the server can't say. */
export async function linkedSignIns(serverUrl: string, token: string): Promise<Linked | null> {
  try {
    const r = await fetch(`${base(serverUrl)}/v1/auth`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const l = (await r.json()) as Partial<Linked>;
    return { apple: l.apple === true, google: l.google === true, email: l.email === true };
  } catch {
    return null;
  }
}
