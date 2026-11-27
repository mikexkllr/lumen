// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AppContext } from '../src/lib/context.ts';
import { translate } from '../src/lib/i18n.ts';
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts';
import { SignInOptions } from '../src/components/SignIn.tsx';
import { captureGoogleRedirect } from '../src/lib/signIn.ts';

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ authorize: vi.fn() }) }));

const app = { settings: { ...DEFAULT_SETTINGS, locale: 'de' }, t: (k: Parameters<typeof translate>[1], v?: Record<string, string | number>) => translate('de', k, v) };
const wrap = (ui: ReactNode) => render(<AppContext.Provider value={app}>{ui}</AppContext.Provider>);

function serverReplies(routes: Record<string, (body: Record<string, unknown>) => Response>) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace(/^\/api/, '');
    calls.push(`${init.method ?? 'GET'} ${path}`);
    const handler = routes[path];
    if (!handler) throw new TypeError('offline');
    return handler(init.body ? JSON.parse(String(init.body)) : {});
  }));
  return calls;
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('sign-in form', () => {
  it('signs in with an emailed code', async () => {
    const onSignedIn = vi.fn();
    serverReplies({
      '/v1/features': () => json({ email: true, apple: true }),
      '/v1/auth/email/start': () => json({ sent: true }),
      '/v1/auth/email/verify': (b) => (b.code === '123456' ? json({ token: 'ABCD', created: true }) : json({ error: 'code_wrong' }, 401)),
    });
    wrap(<SignInOptions serverUrl="/api" onSignedIn={onSignedIn} />);
    // not in the iOS app: no Apple button
    const email = await screen.findByLabelText('E-Mail-Adresse');
    expect(screen.queryByText('Mit Apple anmelden')).toBeNull();
    const send = screen.getByRole('button', { name: 'Code per E-Mail senden' });
    fireEvent.change(email, { target: { value: 'not-an-email' } });
    expect(send).toHaveProperty('disabled', true);
    fireEvent.change(email, { target: { value: 'ada@example.org' } });
    fireEvent.click(send);
    const code = await screen.findByLabelText('6-stelliger Code');
    fireEvent.change(code, { target: { value: '12a3x4' } });
    expect((code as HTMLInputElement).value).toBe('1234');
    fireEvent.change(code, { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Der Code stimmt nicht.');
    fireEvent.change(code, { target: { value: '123456' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Anmelden' })));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ token: 'ABCD', created: true, method: 'email' }));
  });

  it('says when sign-in is unreachable and tries again', async () => {
    const calls = serverReplies({});
    wrap(<SignInOptions serverUrl="/api" onSignedIn={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('nicht erreichbar'));
    serverReplies({ '/v1/features': () => json({ email: true }) });
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByLabelText('E-Mail-Adresse')).toBeTruthy();
    expect(calls).toEqual(['GET /v1/features']);
  });

  it('linking: shows linked methods and keeps the last one', async () => {
    serverReplies({
      '/v1/features': () => json({ email: true }),
      '/v1/auth': () => json({ apple: false, email: true }),
    });
    const onLinked = vi.fn();
    wrap(<SignInOptions serverUrl="/api" token="TOKEN" onLinked={onLinked} />);
    expect(await screen.findByText('Mit E-Mail verknüpft')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Trennen' })).toBeNull();
    expect(onLinked).toHaveBeenCalledWith({ apple: false, google: false, email: true });
    // nothing else to link on the web: no email form either
    expect(screen.queryByLabelText('E-Mail-Adresse')).toBeNull();
  });

  it('linking: with two methods either one can be unlinked', async () => {
    const calls = serverReplies({
      '/v1/features': () => json({ email: true, google: { web: 'web.apps', ios: null } }),
      '/v1/auth': () => json({ apple: false, google: true, email: true }),
      '/v1/auth/google': () => json({ linked: false }),
    });
    wrap(<SignInOptions serverUrl="/api" token="TOKEN" />);
    expect(await screen.findByText('Mit Google verknüpft')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Trennen' })).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Mit Google verknüpfen' })).toBeNull();
    await act(async () => fireEvent.click(screen.getAllByRole('button', { name: 'Trennen' })[0]));
    expect(calls).toContain('DELETE /v1/auth/google');
    expect(await screen.findByRole('button', { name: 'Mit Google verknüpfen' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Trennen' })).toBeNull();
  });

  it('offers Google next to email and finishes the sign-in after Google sends the page back', async () => {
    const onSignedIn = vi.fn();
    serverReplies({
      '/v1/features': () => json({ email: true, google: { web: 'web.apps', ios: null } }),
      '/v1/auth/google': (b) => (b.idToken === 'id.token.sig' && b.nonce === 'raw-nonce' ? json({ token: 'GOOG', created: true }) : json({ error: 'invalid_google_token' }, 401)),
    });
    // what googleSignIn left behind before the page went to Google, and Google's answer
    sessionStorage.setItem('lumen.google', JSON.stringify({ state: 'st', nonce: 'raw-nonce', serverUrl: '/api', link: false, route: '#/login', at: Date.now() }));
    history.replaceState(null, '', '/#state=st&id_token=id.token.sig');
    captureGoogleRedirect();
    expect(location.hash).toBe('#/login');
    wrap(<SignInOptions serverUrl="/api" onSignedIn={onSignedIn} />);
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith({ token: 'GOOG', created: true, method: 'google' }));
    expect(screen.getByRole('button', { name: 'Mit Google anmelden' })).toBeTruthy();
    expect(screen.getByText(/nur eine anonyme Kennung/)).toBeTruthy();
  });

  it('a refused sign-in shows the message and, small below it, where it broke', async () => {
    serverReplies({
      '/v1/features': () => json({ email: true, google: { web: 'web.apps', ios: null } }),
      '/v1/auth/google': () => json({ error: 'invalid_google_token', reason: 'wrong audience' }, 401),
    });
    sessionStorage.setItem('lumen.google', JSON.stringify({ state: 'st2', nonce: 'raw', serverUrl: '/api', link: false, route: '#/login', at: Date.now() }));
    history.replaceState(null, '', '/#state=st2&id_token=id.token.sig');
    captureGoogleRedirect();
    wrap(<SignInOptions serverUrl="/api" onSignedIn={vi.fn()} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Die Anmeldung hat nicht geklappt');
    expect(alert.textContent).toContain('Fehler: google · server 401 invalid_google_token (wrong audience)');
  });

  it('disabled (missing parental consent) blocks sending a code', async () => {
    serverReplies({ '/v1/features': () => json({ email: true }) });
    wrap(<SignInOptions serverUrl="/api" disabled onSignedIn={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('E-Mail-Adresse'), { target: { value: 'kid@example.org' } });
    expect(screen.getByRole('button', { name: 'Code per E-Mail senden' })).toHaveProperty('disabled', true);
  });
});
