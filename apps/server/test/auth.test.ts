import { createHash, createSign, generateKeyPairSync } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.ts';
import { authStore, resetAppleKeyCache, type AppleConfig, type GoogleConfig } from '../src/auth.ts';
import { sqliteStore } from '../src/store.ts';
import type { Mail } from '../src/mail.ts';
import { socialStore } from '../src/social/store.ts';

const BUNDLE = 'cloud.mikekeller.lumen';
const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...(rsa.publicKey.export({ format: 'jwk' }) as object), kid: 'test-kid', alg: 'RS256', use: 'sig' };
const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' });

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
function appleToken(claims: Record<string, unknown>, kid = 'test-kid'): string {
  const head = b64({ alg: 'RS256', kid });
  const body = b64({ iss: 'https://appleid.apple.com', aud: BUNDLE, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), ...claims });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(rsa.privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const nonceHash = (n: string) => createHash('sha256').update(n).digest('hex');
const signIn = (sub: string, nonce = 'n-123', extra: Record<string, unknown> = {}) => ({ identityToken: appleToken({ sub, nonce: nonceHash(nonce), ...extra }), nonce, authorizationCode: 'code-1' });

function fakeApple() {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    calls.push(`${init?.method ?? 'GET'} ${u}`);
    if (u.endsWith('/auth/keys')) return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    if (u.endsWith('/auth/token')) return new Response(JSON.stringify({ refresh_token: 'refresh-1' }), { status: 200 });
    if (u.endsWith('/auth/revoke')) return new Response('', { status: 200 });
    if (u === 'https://www.googleapis.com/oauth2/v3/certs') return new Response(JSON.stringify({ keys: [{ ...jwk, kid: 'google-kid' }] }), { status: 200 });
    return new Response('', { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

const WEB = 'web-client.apps.googleusercontent.com';
const IOS = 'ios-client.apps.googleusercontent.com';
function googleToken(claims: Record<string, unknown>, kid = 'google-kid'): string {
  const head = b64({ alg: 'RS256', kid });
  const body = b64({ iss: 'https://accounts.google.com', aud: WEB, exp: Math.floor(Date.now() / 1000) + 600, iat: Math.floor(Date.now() / 1000), email: 'someone@gmail.com', name: 'Some One', ...claims });
  const sig = createSign('RSA-SHA256').update(`${head}.${body}`).sign(rsa.privateKey).toString('base64url');
  return `${head}.${body}.${sig}`;
}
const google = (sub: string, nonce = 'g-123', extra: Record<string, unknown> = {}) => ({ idToken: googleToken({ sub, nonce: nonceHash(nonce), ...extra }), nonce });

function server(apple: AppleConfig = { clientIds: [BUNDLE] }, googleCfg: GoogleConfig | null = { webClientId: WEB, iosClientId: IOS }) {
  const fake = fakeApple();
  const mails: Mail[] = [];
  const send = async (m: Mail) => void mails.push(m);
  const app = buildServer({ store: sqliteStore(':memory:'), social: socialStore(':memory:'), auth: authStore(':memory:'), apple, google: googleCfg, email: { send, pepper: 'test-pepper-0123456789' }, fetchImpl: fake.fetchImpl, rateLimit: 1000 });
  return { app, calls: fake.calls, mails };
}
const codeIn = (m: Mail) => /\b(\d{6})\b/.exec(m.text)![1];
const ev = (id: string) => ({ id: `evt-${id}-0000`, type: 'attempt', ts: Date.parse('2026-11-20T10:00:00Z'), day: '2026-11-20', stepId: 's', problem: true, correct: true, final: true });
const bearer = (code: string) => ({ authorization: `Bearer ${code}` });

describe('Sign in with Apple', () => {
  beforeEach(() => resetAppleKeyCache());

  it('is advertised only when configured', async () => {
    expect((await server().app.inject({ url: '/v1/features' })).json().apple).toBe(true);
    const off = buildServer({ store: sqliteStore(':memory:') });
    expect((await off.inject({ url: '/v1/features' })).json().apple).toBe(false);
    expect((await off.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('x') })).statusCode).toBe(404);
  });

  it('creates an account for a new Apple ID and signs the next device into the same one', async () => {
    const { app } = server();
    const first = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-1') })).json();
    expect(first.created).toBe(true);
    expect(first.token).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){4}$/);
    await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(first.token), payload: { events: [ev('a')] } });

    const second = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-1', 'other-nonce') })).json();
    expect(second.created).toBe(false);
    expect(second.token).not.toBe(first.token);
    const pulled = (await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(second.token), payload: { events: [] } })).json();
    expect(pulled.events.map((e: { id: string }) => e.id)).toEqual(['evt-a-0000']);
  });

  it('links Apple to an existing sync code, so a new device gets that account', async () => {
    const { app } = server();
    const code = 'ABCD-EFGH-JKLM-NPQR-STUV';
    await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(code), payload: { events: [ev('b')] } });
    const link = await app.inject({ method: 'POST', url: '/v1/auth/apple', headers: bearer(code), payload: signIn('apple-user-2') });
    expect(link.json()).toEqual({ linked: true });
    expect((await app.inject({ url: '/v1/auth', headers: bearer(code) })).json()).toEqual({ apple: true, google: false, email: false });

    const device = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-2') })).json();
    const pulled = (await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(device.token), payload: { events: [] } })).json();
    expect(pulled.events.map((e: { id: string }) => e.id)).toEqual(['evt-b-0000']);
  });

  it('refuses to move an Apple ID that belongs to another account', async () => {
    const { app } = server();
    await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-3') });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/apple', headers: bearer('ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ'), payload: signIn('apple-user-3') });
    expect(res.statusCode).toBe(409);
  });

  it('rejects forged, expired, foreign and replayed tokens', async () => {
    const { app } = server();
    const post = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/v1/auth/apple', payload });
    expect((await post({ ...signIn('u'), nonce: 'wrong' })).statusCode).toBe(401);
    expect((await post(signIn('u', 'n', { aud: 'com.other.app' }))).statusCode).toBe(401);
    expect((await post(signIn('u', 'n', { exp: Math.floor(Date.now() / 1000) - 10 }))).statusCode).toBe(401);
    expect((await post(signIn('u', 'n', { iss: 'https://evil.example' }))).statusCode).toBe(401);
    const good = signIn('u');
    const [h, b] = good.identityToken.split('.');
    expect((await post({ ...good, identityToken: `${h}.${b}.${'A'.repeat(342)}` })).statusCode).toBe(401);
    expect((await post({ identityToken: 'x' })).statusCode).toBe(400);
  });

  it('says which check a rejected token failed, and names no token', async () => {
    const { app } = server();
    const post = async (payload: Record<string, unknown>) => (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload })).json();
    expect(await post({ ...signIn('u'), nonce: 'wrong' })).toEqual({ error: 'invalid_apple_token', reason: 'nonce mismatch' });
    expect(await post(signIn('u', 'n', { aud: 'com.other.app' }))).toEqual({ error: 'invalid_apple_token', reason: 'wrong audience' });
    expect(await post(signIn('u', 'n', { exp: Math.floor(Date.now() / 1000) - 10 }))).toEqual({ error: 'invalid_apple_token', reason: 'expired' });
    expect(await post({ ...signIn('u'), identityToken: appleToken({ sub: 'u', nonce: nonceHash('n') }, 'unknown-kid') })).toEqual({ error: 'invalid_apple_token', reason: 'unknown key' });
  });

  it('a failing refresh token exchange does not stop a new Apple account', async () => {
    // a broken key in the config: the client secret for Apple can't be signed
    const { app } = server({ clientIds: [BUNDLE], teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: 'not a key' });
    const res = await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-5') });
    expect(res.statusCode).toBe(200);
    expect(res.json().created).toBe(true);
  });

  it('deleting the account removes the link and revokes the Apple token', async () => {
    const pem = ec.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const { app, calls } = server({ clientIds: [BUNDLE], teamId: 'TEAM123456', keyId: 'KEY1234567', privateKey: pem });
    const { token } = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-4') })).json();
    expect(calls).toContain('POST https://appleid.apple.com/auth/token');
    await app.inject({ method: 'DELETE', url: '/v1/account', headers: bearer(token) });
    expect(calls).toContain('POST https://appleid.apple.com/auth/revoke');
    const again = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-4') })).json();
    expect(again.created).toBe(true);
  });
});

describe('Sign-in log', () => {
  beforeEach(() => resetAppleKeyCache());

  it('logs successful and rejected sign-ins with provider and outcome, never an id or token', async () => {
    const lines: string[] = [];
    const fake = fakeApple();
    const app = buildServer({ store: sqliteStore(':memory:'), auth: authStore(':memory:'), apple: { clientIds: [BUNDLE] }, google: { webClientId: WEB }, fetchImpl: fake.fetchImpl, rateLimit: 1000, logger: true, logStream: { write: (l) => void lines.push(l) } });
    const payload = signIn('apple-user-log');
    await app.inject({ method: 'POST', url: '/v1/auth/apple', payload });
    await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-log', 'n-2') });
    await app.inject({ method: 'POST', url: '/v1/auth/google', payload: google('g-log', 'g-1', { aud: 'someone-else' }) });
    const logged = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(logged.filter((l) => l.msg === 'sign-in ok').map((l) => [l.provider, l.signIn])).toEqual([['apple', 'created'], ['apple', 'existing']]);
    expect(logged.find((l) => l.msg === 'google sign-in rejected')?.googleAuth).toBe('wrong audience');
    const all = lines.join('');
    for (const secret of ['apple-user-log', 'g-log', payload.identityToken, payload.nonce]) expect(all).not.toContain(secret);
  });
});

describe('Sign in with Google', () => {
  beforeEach(() => resetAppleKeyCache());

  it('is advertised with its public client ids only when configured', async () => {
    expect((await server().app.inject({ url: '/v1/features' })).json().google).toEqual({ web: WEB, ios: IOS });
    const off = server(undefined, null).app;
    expect((await off.inject({ url: '/v1/features' })).json().google).toBeNull();
    expect((await off.inject({ method: 'POST', url: '/v1/auth/google', payload: google('x') })).statusCode).toBe(404);
  });

  it('creates an account for a new Google account and signs the next device into it, also from iOS', async () => {
    const { app, calls } = server();
    const first = (await app.inject({ method: 'POST', url: '/v1/auth/google', payload: google('google-user-1') })).json();
    expect(first.created).toBe(true);
    expect(calls).toContain('GET https://www.googleapis.com/oauth2/v3/certs');
    await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(first.token), payload: { events: [ev('g')] } });

    const ios = (await app.inject({ method: 'POST', url: '/v1/auth/google', payload: google('google-user-1', 'n2', { aud: IOS, iss: 'accounts.google.com' }) })).json();
    expect(ios.created).toBe(false);
    const pulled = (await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(ios.token), payload: { events: [] } })).json();
    expect(pulled.events.map((e: { id: string }) => e.id)).toEqual(['evt-g-0000']);
    expect((await app.inject({ url: '/v1/auth', headers: bearer(ios.token) })).json()).toEqual({ apple: false, google: true, email: false });
  });

  it('rejects forged, foreign, expired and replayed tokens', async () => {
    const { app } = server();
    const post = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/v1/auth/google', payload });
    expect((await post({ ...google('u'), nonce: 'wrong' })).statusCode).toBe(401);
    expect((await post(google('u', 'n', { aud: 'other.apps.googleusercontent.com' }))).statusCode).toBe(401);
    expect((await post(google('u', 'n', { iss: 'https://appleid.apple.com' }))).statusCode).toBe(401);
    expect((await post(google('u', 'n', { exp: Math.floor(Date.now() / 1000) - 10 }))).statusCode).toBe(401);
    // an Apple token is no Google token, even with the right audience
    expect((await post({ idToken: appleToken({ sub: 'u', aud: WEB, nonce: nonceHash('n') }), nonce: 'n' })).statusCode).toBe(401);
    expect((await post({ idToken: 'x' })).statusCode).toBe(400);
    expect((await post(google('u', 'n', { aud: 'other.apps.googleusercontent.com' }))).json()).toEqual({ error: 'invalid_google_token', reason: 'wrong audience' });
  });

  it('links Google next to Apple and keeps the last sign-in method', async () => {
    const { app } = server();
    const { token } = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-g') })).json();
    expect((await app.inject({ method: 'POST', url: '/v1/auth/google', headers: bearer(token), payload: google('google-user-2') })).json()).toEqual({ linked: true });
    expect((await app.inject({ method: 'DELETE', url: '/v1/auth/apple', headers: bearer(token) })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/v1/auth/google', headers: bearer(token) })).statusCode).toBe(409);
    expect((await app.inject({ url: '/v1/auth', headers: bearer(token) })).json()).toEqual({ apple: false, google: true, email: false });
    // the same Google account can't be linked to a second Lumen account
    const other = (await app.inject({ method: 'POST', url: '/v1/auth/apple', payload: signIn('apple-user-h') })).json().token;
    expect((await app.inject({ method: 'POST', url: '/v1/auth/google', headers: bearer(other), payload: google('google-user-2') })).statusCode).toBe(409);
  });

  it('deleting the account removes the Google link', async () => {
    const { app } = server();
    const { token } = (await app.inject({ method: 'POST', url: '/v1/auth/google', payload: google('google-user-3') })).json();
    await app.inject({ method: 'DELETE', url: '/v1/account', headers: bearer(token) });
    expect((await app.inject({ method: 'POST', url: '/v1/auth/google', payload: google('google-user-3') })).json().created).toBe(true);
  });
});

describe('Sign in with email', () => {
  it('signs in with an emailed code and stores no address', async () => {
    const { app, mails } = server();
    expect((await app.inject({ url: '/v1/features' })).json().email).toBe(true);
    const start = await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: ' Ada@Example.org ', locale: 'de' } });
    expect(start.json()).toEqual({ sent: true });
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe('ada@example.org');
    expect(mails[0].subject).toMatch(/Lumen-Code/);
    const first = (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'ada@example.org', code: codeIn(mails[0]) } })).json();
    expect(first.created).toBe(true);
    await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(first.token), payload: { events: [ev('m')] } });

    // second device, same address
    await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'ADA@example.org' } });
    const second = (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'ada@example.org', code: codeIn(mails[1]) } })).json();
    expect(second.created).toBe(false);
    const pulled = (await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(second.token), payload: { events: [] } })).json();
    expect(pulled.events.map((e: { id: string }) => e.id)).toEqual(['evt-m-0000']);
  });

  it('rejects wrong and reused codes and locks after five tries', async () => {
    const { app, mails } = server();
    await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'bob@example.org' } });
    const code = codeIn(mails[0]);
    const wrong = code === '000000' ? '111111' : '000000';
    const verify = (c: string) => app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email: 'bob@example.org', code: c } });
    expect((await verify(wrong)).statusCode).toBe(401);
    expect((await verify(code)).statusCode).toBe(200);
    expect((await verify(code)).statusCode).toBe(410); // used up
    await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'bob@example.org' } });
    for (let i = 0; i < 5; i++) await verify(wrong);
    expect((await verify(codeIn(mails[1]))).json().error).toBe('code_locked');
    expect((await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'not-an-email' } })).statusCode).toBe(400);
  });

  it('links an email to an existing account and unlinks it again', async () => {
    const { app, mails } = server();
    const code = 'ABCD-EFGH-JKLM-NPQR-STUV';
    await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'cy@example.org' } });
    const link = await app.inject({ method: 'POST', url: '/v1/auth/email/verify', headers: bearer(code), payload: { email: 'cy@example.org', code: codeIn(mails[0]) } });
    expect(link.json()).toEqual({ linked: true });
    expect((await app.inject({ url: '/v1/auth', headers: bearer(code) })).json()).toEqual({ apple: false, google: false, email: true });
    // the only way to sign in stays
    const last = await app.inject({ method: 'DELETE', url: '/v1/auth/email', headers: bearer(code) });
    expect(last.statusCode).toBe(409);
    expect(last.json().error).toBe('last_sign_in');
    await app.inject({ method: 'POST', url: '/v1/auth/apple', headers: bearer(code), payload: signIn('apple-cy') });
    expect((await app.inject({ url: '/v1/auth', headers: bearer(code) })).json()).toEqual({ apple: true, google: false, email: true });
    expect((await app.inject({ method: 'DELETE', url: '/v1/auth/email', headers: bearer(code) })).statusCode).toBe(200);
    expect((await app.inject({ url: '/v1/auth', headers: bearer(code) })).json()).toEqual({ apple: true, google: false, email: false });
  });

  it('limits codes per address', async () => {
    const { app } = server();
    const start = () => app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'dee@example.org' } });
    for (let i = 0; i < 5; i++) expect((await start()).statusCode).toBe(200);
    expect((await start()).statusCode).toBe(429);
  });
});
