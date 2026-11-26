// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({}) }));
const { captureGoogleRedirect, googleRedirectUri, googleSignIn, takeGoogleRedirect } = await import('../src/lib/signIn.ts');

const sha256Hex = async (s: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

let assigned: string[] = [];
beforeEach(() => {
  assigned = [];
  sessionStorage.clear();
  history.replaceState(null, '', '/app/#/onboarding/account');
  vi.spyOn(location, 'assign').mockImplementation((u: string | URL) => void assigned.push(String(u)));
});
afterEach(() => vi.restoreAllMocks());

/** Starts the sign-in and plays Google's answer back into the address. */
async function roundTrip(answer: (q: URLSearchParams) => string, link = false) {
  const n = assigned.length;
  void googleSignIn('/api', 'web.apps', link ? 'TOKEN' : undefined);
  await vi.waitFor(() => expect(assigned).toHaveLength(n + 1));
  const q = new URL(assigned[n]).searchParams;
  history.replaceState(null, '', `/app/#${answer(q)}`);
  captureGoogleRedirect();
  return q;
}

describe('Sign in with Google on the web', () => {
  it('sends the page to Google with a hashed nonce and comes back to the same screen', async () => {
    const q = await roundTrip((q) => `state=${q.get('state')}&id_token=header.body.sig&authuser=0`);
    expect(assigned[0].startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true);
    expect(Object.fromEntries([...q].filter(([k]) => ['client_id', 'redirect_uri', 'response_type', 'scope'].includes(k)))).toEqual({
      client_id: 'web.apps', redirect_uri: `${location.origin}/app/`, response_type: 'id_token', scope: 'openid',
    });
    // the token is gone from the address, the screen is back
    expect(location.hash).toBe('#/onboarding/account');
    expect(takeGoogleRedirect('/api', true)).toBeNull();
    const back = takeGoogleRedirect('/api', false);
    expect(back).toMatchObject({ serverUrl: '/api', link: false, idToken: 'header.body.sig' });
    expect(q.get('nonce')).toBe(await sha256Hex((back as { nonce: string }).nonce));
    expect(takeGoogleRedirect('/api', false)).toBeNull();
  });

  it('drops answers with a foreign state and passes on refusals', async () => {
    await roundTrip(() => 'state=forged&id_token=x.y.z');
    expect(location.hash).toBe('#/onboarding/account');
    expect(takeGoogleRedirect('/api', false)).toBeNull();

    await roundTrip((q) => `error=access_denied&state=${q.get('state')}`, true);
    expect(takeGoogleRedirect('/api', true)).toMatchObject({ error: 'access_denied', link: true });
  });

  it('leaves ordinary routes alone and uses the app address as redirect URI', () => {
    history.replaceState(null, '', '/app/index.html#/legal/privacy');
    captureGoogleRedirect();
    expect(location.hash).toBe('#/legal/privacy');
    expect(googleRedirectUri()).toBe(`${location.origin}/app/`);
  });
});
