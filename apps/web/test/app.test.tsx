// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog, LumenEvent, ProgressSummary } from '@lumen/engine';

const catalog = {
  topics: [
    { id: 'math.a', title: 'A', area: 'math', prerequisites: [], units: [{ id: 'math.a.u1', title: 'U1', concepts: ['c1', 'c2'], review: true }] },
    { id: 'phys.a', title: 'P', area: 'physics', prerequisites: [], units: [{ id: 'phys.a.u1', title: 'P1', concepts: ['p1'] }] },
  ],
  paths: [
    { id: 'path.physics', area: 'physics', title: 'Physik', topics: ['phys.a'] },
    { id: 'path.math', area: 'math', title: 'Mathe', topics: ['math.a'] },
  ],
  concepts: { c1: { title: 'Eins', srsCards: ['c1#1'] }, c2: { title: 'Zwei', srsCards: [] }, p1: { title: 'Kraft', srsCards: [] } },
  placement: null,
} as unknown as Catalog;

vi.mock('@capacitor/core', () => ({ registerPlugin: () => ({ authorize: vi.fn() }) }));
vi.mock('../src/lib/content.ts', () => ({ ContentLibrary: { load: async () => ({ catalog, prefetchAll() {} }) } }));
const { App } = await import('../src/App.tsx');
const { AppProvider } = await import('../src/lib/store.tsx');
const { SocialProvider } = await import('../src/lib/socialContext.tsx');
const { buildPath, defaultPathId } = await import('../src/screens/Home.tsx');

const seed = (s: Record<string, unknown>) => localStorage.setItem('lumen.settings.v1', JSON.stringify({ locale: 'de', ...s }));
const mount = () => render(<AppProvider><SocialProvider><App /></SocialProvider></AppProvider>);
const account = { serverUrl: '/api', token: 'ABCD-EFGH', lastSync: null, cursor: 0, method: 'email' };

// happy-dom's Web Animations reject when an animation is cancelled; the app works without them.
(Element.prototype as { animate?: unknown }).animate = undefined;

beforeEach(() => {
  localStorage.clear();
  seed({});
  location.hash = '';
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(String(url).includes('/v1/features') ? { email: true } : String(url).includes('/v1/sync') ? { events: [], cursor: 0 } : {}), { status: String(url).includes('/social/me') ? 404 : 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the way into the app', () => {
  it('a first start lands on the welcome screen, whatever the link', async () => {
    location.hash = '#/profile';
    mount();
    expect(await screen.findByRole('button', { name: /Los geht/ })).toBeTruthy();
    expect(location.hash).toBe('#/welcome');
  });

  it('someone who learned without an account is asked to sign in, not to start over', async () => {
    seed({ onboarded: true });
    mount();
    expect(await screen.findByText(/Lumen sichert deinen Fortschritt jetzt in einem Konto/)).toBeTruthy();
    expect(location.hash).toBe('#/login');
  });

  it('signed in but not set up yet: the onboarding continues', async () => {
    seed({ account, onboarded: false });
    location.hash = '#/discover';
    mount();
    expect(await screen.findByRole('heading', { name: 'Was möchtest du lernen?' })).toBeTruthy();
    expect(location.hash).toBe('#/onboarding');
  });

  it('signed in and set up: welcome and login lead home', async () => {
    seed({ account, onboarded: true, age: '16+', pathId: 'path.math' });
    location.hash = '#/welcome';
    mount();
    await waitFor(() => expect(location.hash).toBe('#/'));
    expect(await screen.findByRole('heading', { name: 'Eins' })).toBeTruthy();
  });

  it('kids see no community tab', async () => {
    seed({ account, onboarded: true, age: 'u13', pathId: 'path.math' });
    mount();
    await screen.findByRole('heading', { name: 'Eins' });
    expect(screen.queryAllByRole('link', { name: /Community/ })).toHaveLength(0);
  });

  it('legal pages open without an account and without the app navigation', async () => {
    location.hash = '#/legal/imprint';
    mount();
    expect(await screen.findByRole('heading', { name: 'Impressum', level: 1 })).toBeTruthy();
    expect(document.querySelector('.tabbar')).toBeNull();
  });
});

describe('learning path', () => {
  const progress = (done: string[]) => ({ completedConcepts: new Set(done), lastCompleted: {} }) as unknown as ProgressSummary;
  const completed = (topicId: string): LumenEvent => ({ id: 'e', type: 'concept_completed', ts: 1, day: '2026-11-25', conceptId: 'p1', topicId, problems: 1, firstTryCorrect: 1, durationMs: 1 });

  it('without a chosen path: the one of the latest lesson, else math', () => {
    expect(defaultPathId(catalog, [])).toBe('path.math');
    expect(defaultPathId(catalog, [completed('phys.a')])).toBe('path.physics');
    expect(defaultPathId(catalog, [completed('unknown')])).toBe('path.math');
  });

  it('marks done lessons and picks the next one', () => {
    const fresh = buildPath(catalog, 'path.math', progress([]), null, new Set());
    expect(fresh.next).toBe('c1');
    expect(fresh.units[0].nodes.map((n) => n.state)).toEqual(['next', 'later']);
    const half = buildPath(catalog, 'path.math', progress(['c1']), null, new Set());
    expect(half.next).toBe('c2');
    expect(half.units[0].nodes.map((n) => n.state)).toEqual(['done', 'next']);
    expect(half.units[0].review).toEqual({ state: 'later', cards: ['c1#1'] });
    const all = buildPath(catalog, 'path.math', progress(['c1', 'c2']), null, new Set());
    expect(all.units[0].review!.state).toBe('open');
    expect(buildPath(catalog, 'path.math', progress(['c1', 'c2']), null, new Set(['math.a.u1'])).units[0].review!.state).toBe('done');
  });
});
