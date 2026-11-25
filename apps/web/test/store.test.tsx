// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LumenEvent } from '@lumen/engine';

vi.mock('../src/lib/content.ts', () => ({
  ContentLibrary: { load: async () => ({ catalog: { topics: [], paths: [], concepts: {} }, prefetchAll() {} }) },
}));
const { AppProvider, useApp } = await import('../src/lib/store.tsx');
const { clearEvents, loadEvents, putEvents } = await import('../src/lib/db.ts');

type App = ReturnType<typeof useApp>;
let app: App;
function Probe() {
  app = useApp();
  return null;
}
async function mount() {
  render(<AppProvider><Probe /></AppProvider>);
  await waitFor(() => expect(app.loaded).toBe(true));
}

const ev = (id: string): LumenEvent & { synced: 0 } => ({ id: `evt-${id}-0000`, type: 'concept_completed', ts: Date.now(), day: '2026-11-25', conceptId: 'c', topicId: 't', problems: 1, firstTryCorrect: 1, durationMs: 1, synced: 0 });
const account = { serverUrl: '/api', token: 'ABCD-EFGH', lastSync: null, cursor: 0, method: 'email' as const };

/** Answers like the server: echo pushed events, nothing more to pull. */
function server(status = 200) {
  const calls: { url: string; method: string; body?: { events: LumenEvent[] } }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (status !== 200) return new Response('{}', { status });
    if (url.endsWith('/v1/sync')) return new Response(JSON.stringify({ events: [], cursor: 7, more: false }), { status: 200 });
    return new Response('{}', { status: 200 });
  }));
  return calls;
}

beforeEach(async () => {
  localStorage.clear();
  await clearEvents();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('account in the app store', () => {
  it('signing in stores the account and backs up what was learned before', async () => {
    await putEvents([ev('before')]);
    const calls = server();
    await mount();
    await act(() => app.signIn(account));
    expect(app.settings.account).toMatchObject({ token: 'ABCD-EFGH', cursor: 7 });
    expect(app.settings.account!.lastSync).not.toBeNull();
    const pushed = calls.find((c) => c.url === '/api/v1/sync')!;
    expect(pushed.body!.events.map((e) => e.id)).toEqual(['evt-before-0000']);
    expect((await loadEvents()).every((e) => e.synced === 1)).toBe(true);
    expect(JSON.parse(localStorage.getItem('lumen.settings.v1')!).account.token).toBe('ABCD-EFGH');
  });

  it('signing out backs up first, then clears the device but keeps its preferences', async () => {
    server();
    await mount();
    await act(async () => {
      app.updateSettings({ account, onboarded: true, locale: 'en', theme: 'dark', age: '16+', communityName: 'Ada' });
    });
    act(() => void app.addEvents([{ type: 'concept_completed', conceptId: 'c', topicId: 't', problems: 1, firstTryCorrect: 1, durationMs: 1 }]));
    await waitFor(async () => expect((await loadEvents()).length).toBe(1));
    await act(() => app.signOut());
    expect(app.events).toEqual([]);
    expect(await loadEvents()).toEqual([]);
    expect(app.settings).toMatchObject({ account: null, onboarded: false, age: null, communityName: null, locale: 'en', theme: 'dark' });
  });

  it('does not sign out while new progress can’t be backed up', async () => {
    server(503);
    await mount();
    await act(async () => app.updateSettings({ account, onboarded: true }));
    await act(async () => { await putEvents([ev('pending')]); });
    await expect(act(() => app.signOut())).rejects.toThrow('sync_failed');
    expect(app.settings.account).not.toBeNull();
    expect((await loadEvents()).length).toBe(1);
  });

  it('deleting the account deletes it on the server and wipes the device', async () => {
    const calls = server();
    await mount();
    await act(async () => app.updateSettings({ account, onboarded: true }));
    await act(() => app.deleteAccount());
    expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/v1/account')).toBe(true);
    expect(app.settings.account).toBeNull();
  });

  it('a device code the server rejects signs this device out', async () => {
    server(401);
    await mount();
    await act(async () => app.updateSettings({ account, onboarded: true }));
    await act(async () => { await app.runSync(); });
    await waitFor(() => expect(app.settings.account).toBeNull());
  });

  it('without an account nothing is sent', async () => {
    const calls = server();
    await mount();
    expect(await act(() => app.runSync())).toBe(false);
    expect(calls).toEqual([]);
  });
});
