/**
 * Optional sign-in on top of the sync code: "Sign in with Apple" (iOS app, native plugin
 * AppleSignIn in apps/mobile/ios) and six-digit codes by email (everywhere). Both link to the
 * sync account, so a new device gets the same progress. Apple shares no name and no email;
 * the server keeps only a hash of the email address.
 */
import { registerPlugin } from '@capacitor/core';

interface AppleSignInPlugin {
  authorize(opts: { nonce: string }): Promise<{ identityToken: string; authorizationCode?: string; user: string }>;
}
const Native = registerPlugin<AppleSignInPlugin>('AppleSignIn');

type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string };
export function isIOSApp(): boolean {
  const c = (globalThis as { Capacitor?: Cap }).Capacitor;
  return c?.isNativePlatform?.() === true && c.getPlatform?.() === 'ios';
}

const base = (u: string) => u.replace(/\/$/, '');

/** Which sign-in methods this device and server offer (Apple only in the iOS app). */
export async function signInMethods(serverUrl: string): Promise<{ apple: boolean; email: boolean }> {
  try {
    const r = await fetch(`${base(serverUrl)}/v1/features`, { signal: AbortSignal.timeout(4000) });
    const f = r.ok ? ((await r.json()) as { apple?: boolean; email?: boolean }) : {};
    return { apple: isIOSApp() && f.apple === true, email: f.email === true };
  } catch {
    return { apple: false, email: false };
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

/**
 * Shows Apple's sheet and sends the result to the server. With `token` (the current sync code)
 * Apple is linked to that account; without it the server signs in and returns a device code.
 */
export async function appleSignIn(serverUrl: string, token?: string): Promise<{ token?: string; created?: boolean }> {
  const nonce = [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
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

export async function unlinkSignIn(serverUrl: string, token: string, provider: 'apple' | 'email'): Promise<void> {
  await fetch(`${base(serverUrl)}/v1/auth/${provider}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

/** Which sign-in methods are linked to this account; null if the server can't say. */
export async function linkedSignIns(serverUrl: string, token: string): Promise<{ apple: boolean; email: boolean } | null> {
  try {
    const r = await fetch(`${base(serverUrl)}/v1/auth`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(4000) });
    return r.ok ? ((await r.json()) as { apple: boolean; email: boolean }) : null;
  } catch {
    return null;
  }
}
