import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authorize = vi.fn();
vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ authorize }) }));
const { appleSignIn, emailStart, emailVerify, googleSignIn, linkedSignIns, signInMethods, SignInError, unlinkSignIn } = await import('../src/lib/signIn.ts');

type Call = { url: string; init?: RequestInit };
function stubFetch(reply: (url: string, init?: RequestInit) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return reply(url, init);
  }));
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const asApp = (platform: 'ios' | 'android' | null) => vi.stubGlobal('Capacitor', platform ? { isNativePlatform: () => true, getPlatform: () => platform } : undefined);
const asIOS = (on: boolean) => asApp(on ? 'ios' : null);

beforeEach(() => { authorize.mockReset(); });
afterEach(() => vi.unstubAllGlobals());

describe('sign-in methods', () => {
  it('offers Apple only inside the iOS app, email wherever the server has it', async () => {
    stubFetch(() => json({ apple: true, email: true }));
    asIOS(false);
    expect(await signInMethods('/api')).toEqual({ apple: false, google: null, email: true });
    asIOS(true);
    expect(await signInMethods('/api/')).toEqual({ apple: true, google: null, email: true });
  });

  it('offers Google with the client this platform needs', async () => {
    stubFetch(() => json({ email: true, google: { web: 'web.apps', ios: 'ios.apps' } }));
    asApp(null);
    expect((await signInMethods('/api')).google).toBe('web.apps');
    asApp('android');
    expect((await signInMethods('/api')).google).toBe('web.apps');
    asApp('ios');
    expect((await signInMethods('/api')).google).toBe('ios.apps');
    stubFetch(() => json({ email: true, google: { web: 'web.apps', ios: null } }));
    expect((await signInMethods('/api')).google).toBeNull();
  });

  it('offers nothing when the server is unreachable or old', async () => {
    stubFetch(() => { throw new TypeError('offline'); });
    expect(await signInMethods('/api')).toEqual({ apple: false, google: null, email: false });
    stubFetch(() => json({}, 500));
    expect(await signInMethods('/api')).toEqual({ apple: false, google: null, email: false });
  });
});

describe('email codes', () => {
  it('sends the address and the UI language', async () => {
    const calls = stubFetch(() => json({ sent: true }));
    await emailStart('/api', 'ada@example.org', 'de');
    expect(calls[0].url).toBe('/api/v1/auth/email/start');
    expect(JSON.parse(String(calls[0].init!.body))).toEqual({ email: 'ada@example.org', locale: 'de' });
  });

  it('maps server answers to sign-in errors', async () => {
    const cases: [Response, string][] = [
      [json({ error: 'code_wrong' }, 401), 'wrong_code'],
      [json({ error: 'code_expired' }, 410), 'expired'],
      [json({ error: 'code_locked' }, 410), 'expired'],
      [json({ error: 'rate_limited' }, 429), 'rate_limited'],
      [json({ error: 'linked_elsewhere' }, 409), 'linked_elsewhere'],
      [json({ error: 'account_has_other_identity' }, 409), 'other_identity'],
      [new Response('oops', { status: 502 }), 'failed'],
    ];
    for (const [res, code] of cases) {
      stubFetch(() => res);
      await expect(emailVerify('/api', 'a@b.de', '123456')).rejects.toMatchObject({ code });
    }
    stubFetch(() => json({}, 429));
    await expect(emailStart('/api', 'a@b.de', 'en')).rejects.toMatchObject({ code: 'rate_limited' });
  });

  it('signs in without a token and links with one', async () => {
    let calls = stubFetch(() => json({ token: 'NEWC-ODE0', created: true }));
    expect(await emailVerify('/api', 'a@b.de', '123456')).toEqual({ token: 'NEWC-ODE0', created: true });
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBeUndefined();
    calls = stubFetch(() => json({ linked: true }));
    await emailVerify('/api', 'a@b.de', '123456', 'ABCD');
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer ABCD');
  });
});

describe('Sign in with Apple', () => {
  it('passes a hashed nonce to Apple and the raw one to the server', async () => {
    authorize.mockResolvedValue({ identityToken: 'id-token', authorizationCode: 'auth-code', user: 'u' });
    const calls = stubFetch(() => json({ token: 'DEVI-CE00', created: false }));
    expect(await appleSignIn('/api')).toEqual({ token: 'DEVI-CE00', created: false });
    const hashed = authorize.mock.calls[0][0].nonce as string;
    const body = JSON.parse(String(calls[0].init!.body)) as { nonce: string; identityToken: string };
    expect(body.identityToken).toBe('id-token');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.nonce));
    expect(hashed).toBe([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''));
  });

  it('a closed Apple sheet is a quiet cancel', async () => {
    authorize.mockImplementation(async () => { throw Object.assign(new Error('closed'), { code: 'canceled' }); });
    await expect(appleSignIn('/api')).rejects.toMatchObject({ code: 'canceled' });
  });

  it('other Apple failures become a sign-in error', async () => {
    authorize.mockImplementation(async () => { throw new Error('boom'); });
    const e = (await appleSignIn('/api').catch((x: unknown) => x)) as InstanceType<typeof SignInError>;
    expect(e instanceof SignInError).toBe(true);
    expect([e.code, e.message, e.detail]).toEqual(['failed', 'boom', 'apple · sheet · boom']);
  });

  it('a failure says where it broke: the server and its reason, or the network', async () => {
    authorize.mockResolvedValue({ identityToken: 'id-token', user: 'u' });
    stubFetch(() => json({ error: 'invalid_apple_token', reason: 'wrong audience' }, 401));
    expect(await appleSignIn('/api').catch((x: unknown) => x)).toMatchObject({ code: 'failed', detail: 'apple · server 401 invalid_apple_token (wrong audience)' });
    stubFetch(() => json({ statusCode: 500, error: 'Internal Server Error', message: 'database is locked' }, 500));
    expect(await appleSignIn('/api').catch((x: unknown) => x)).toMatchObject({ detail: 'apple · server 500 Internal Server Error (database is locked)' });
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Load failed'); }));
    expect(await appleSignIn('/api').catch((x: unknown) => x)).toMatchObject({ code: 'failed', detail: 'apple · network · Load failed' });
  });
});

describe('Sign in with Google in the apps', () => {
  it('passes the client id and a hashed nonce to the plugin and the raw nonce to the server', async () => {
    asApp('android');
    authorize.mockResolvedValue({ idToken: 'google-id-token' });
    const calls = stubFetch(() => json({ token: 'DEVI-CE01', created: true }));
    expect(await googleSignIn('/api', 'web.apps', 'LINK')).toEqual({ token: 'DEVI-CE01', created: true });
    const { clientId, nonce: hashed } = authorize.mock.calls[0][0] as { clientId: string; nonce: string };
    expect(clientId).toBe('web.apps');
    expect(calls[0].url).toBe('/api/v1/auth/google');
    expect((calls[0].init!.headers as Record<string, string>).Authorization).toBe('Bearer LINK');
    const body = JSON.parse(String(calls[0].init!.body)) as { idToken: string; nonce: string };
    expect(body.idToken).toBe('google-id-token');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.nonce));
    expect(hashed).toBe([...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join(''));
  });

  it('a closed Google sheet is a quiet cancel', async () => {
    asApp('ios');
    authorize.mockImplementation(async () => { throw Object.assign(new Error('closed'), { code: 'canceled' }); });
    await expect(googleSignIn('/api', 'ios.apps')).rejects.toMatchObject({ code: 'canceled' });
  });
});

describe('linked sign-ins', () => {
  it('lists, and unlinks with the device code', async () => {
    let calls = stubFetch(() => json({ apple: true, email: false }));
    expect(await linkedSignIns('/api', 'T')).toEqual({ apple: true, google: false, email: false });
    stubFetch(() => json({ apple: false, google: true, email: true }));
    expect(await linkedSignIns('/api', 'T')).toEqual({ apple: false, google: true, email: true });
    stubFetch(() => json({}, 401));
    expect(await linkedSignIns('/api', 'T')).toBeNull();
    calls = stubFetch(() => json({ linked: false }));
    await unlinkSignIn('/api', 'T', 'email');
    expect(calls[0]).toMatchObject({ url: '/api/v1/auth/email', init: { method: 'DELETE' } });
  });
});
