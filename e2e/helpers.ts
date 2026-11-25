import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

/** Like Playwright's test, but a JavaScript error in the page fails the test. */
export const test = base.extend<{ page: Page }>({
  page: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      // failed requests are expected in some tests (aborted on purpose, 404 probes)
      if (m.type() === 'error' && !/Failed to load resource|net::ERR_/.test(m.text())) errors.push(`console: ${m.text()}`);
    });
    await use(page);
    expect(errors, 'errors in the page').toEqual([]);
  },
});
export { expect };
import { randomUUID } from 'node:crypto';

export const API = `http://127.0.0.1:${process.env.E2E_API_PORT ?? 8790}`;

let counter = 0;
/** A fresh address per test, so tests can run in parallel against one server. */
export const uniqueEmail = (tag: string) => `${tag}-${Date.now().toString(36)}-${process.pid}-${counter++}@e2e.test`;

/** The latest login code the test server "mailed" to the address. */
export async function codeFor(request: APIRequestContext, email: string): Promise<string> {
  let code = '';
  await expect.poll(async () => {
    const r = await request.get(`${API}/__e2e/code`, { params: { email } });
    code = r.ok() ? ((await r.json()) as { code: string }).code : '';
    return code;
  }, { message: `login code for ${email}` }).not.toBe('');
  return code;
}

/** Creates (or signs in to) an account through the API and returns its device code. */
export async function apiAccount(request: APIRequestContext, email: string): Promise<{ token: string; created: boolean }> {
  expect((await request.post(`${API}/v1/auth/email/start`, { data: { email, locale: 'de' } })).ok()).toBe(true);
  const code = await codeFor(request, email);
  const r = await request.post(`${API}/v1/auth/email/verify`, { data: { email, code } });
  expect(r.ok()).toBe(true);
  return (await r.json()) as { token: string; created: boolean };
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * A unique handle for a test learner. Only the digits 2, 6 and 9: the name filter reads other
 * digits as leetspeak (55 → "ss"), so random numbers would now and then be refused.
 */
export function testHandle(name: string): string {
  const n = Date.now() * 1000 + process.pid * 37 + counter++;
  const digits = n.toString(3).slice(-11).replace(/[012]/g, (d) => ({ '0': '2', '1': '6', '2': '9' })[d]!);
  return `${name.toLowerCase().slice(0, 6)}_${digits}`;
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A finished lesson (10 XP) on the server, as if learned on another device. */
export async function pushCompletedLesson(request: APIRequestContext, token: string, conceptId = 'math.placevalue.digits', topicId = 'math.placevalue') {
  const event = { id: randomUUID(), type: 'concept_completed', ts: Date.now(), day: today(), conceptId, topicId, problems: 5, firstTryCorrect: 5, durationMs: 120_000 };
  const r = await request.post(`${API}/v1/sync`, { headers: auth(token), data: { events: [event], since: 0, today: today() } });
  expect(r.ok()).toBe(true);
}

export async function createProfile(request: APIRequestContext, token: string, name: string, handle: string, avatar = 'c1-i2') {
  const r = await request.put(`${API}/v1/social/me?today=${today()}`, { headers: auth(token), data: { name, handle, avatar, leagues: true, ageConfirmed: true } });
  expect(r.ok(), await r.text()).toBe(true);
  return ((await r.json()) as { profile: { id: string; handle: string } }).profile;
}

export interface SeedOptions {
  age?: '16+' | '13-15' | 'u13';
  locale?: 'de' | 'en';
  communityName?: string | null;
  social?: { userId: string; handle: string } | null;
}

/**
 * Opens the app as an onboarded learner signed in to `token` (skips the onboarding UI, which
 * has its own tests).
 */
export async function openSignedIn(page: Page, token: string, opts: SeedOptions = {}) {
  const settings = {
    locale: opts.locale ?? 'de',
    onboarded: true,
    interests: ['math'],
    goal: 'curious',
    age: opts.age ?? '16+',
    pathId: 'path.math',
    dailyGoal: 10,
    sound: false,
    haptics: false,
    reduceMotion: 'reduce',
    account: { serverUrl: '/api', token, lastSync: null, cursor: 0, method: 'email' },
    communityName: opts.communityName ?? null,
    social: opts.social ?? null,
  };
  await page.addInitScript((s) => {
    if (!sessionStorage.getItem('e2e-seeded')) {
      localStorage.setItem('lumen.settings.v1', s);
      sessionStorage.setItem('e2e-seeded', '1');
    }
  }, JSON.stringify(settings));
  await page.goto('/');
  await expect(page.locator('.shell')).toBeVisible();
}

/** Signs in through the UI with an emailed code (the form on the onboarding and login screens). */
export async function signInWithEmail(page: Page, request: APIRequestContext, email: string) {
  await page.getByLabel('E-Mail-Adresse').fill(email);
  await page.getByRole('button', { name: 'Code per E-Mail senden' }).click();
  await expect(page.getByText(`Code an ${email} gesendet`)).toBeVisible();
  const code = await codeFor(request, email);
  await page.getByLabel('6-stelliger Code').fill(code);
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
}

/** Walks the onboarding up to the sign-in step. */
export async function onboardToAccount(page: Page, age: 'unter 13' | '13 bis 15' | '16 oder älter' = '16 oder älter') {
  await page.goto('/');
  await page.getByRole('button', { name: /Los geht/ }).click();
  await page.getByRole('button', { name: /Mathematik/ }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('radio', { name: /Aus Neugier/ }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('radio', { name: /15 Min/ }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await page.getByRole('radio', { name: age }).click();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Dein Lumen-Konto' })).toBeVisible();
}

/** Lessons open with an intro screen: continue past it (nothing happens when the lesson starts without one). */
export async function skipIntro(page: Page) {
  await expect(page.locator('.lesson-stage')).toBeVisible();
  if (await page.locator('.intro-hero').isVisible()) await page.getByRole('button', { name: /^(Los geht|Let’s go)/ }).click();
  await expect(page.locator('.intro-hero')).toHaveCount(0);
}

/** Fills in the reference solution of the current problem (hook of the e2e build). */
export async function solve(page: Page, check = 'Prüfen') {
  await expect.poll(() => page.evaluate(() => (window as { __lumenSolve?: () => boolean }).__lumenSolve?.() ?? false), { message: 'solve hook' }).toBe(true);
  await expect(page.getByRole('button', { name: check })).toBeEnabled();
}

/**
 * Plays the open lesson to the end: explanations are continued (or revealed), problems get
 * the reference solution through the e2e build's hook. Returns how many problems it solved.
 */
export async function playToEnd(page: Page, opts: { max?: number; deeper?: boolean } = {}): Promise<number> {
  let solved = 0;
  for (let i = 0; i < (opts.max ?? 120); i++) {
    // Depth gate after the core: stop here unless the test wants the deeper levels.
    const stop = page.getByRole('button', { name: 'Für heute reicht’s' });
    if (await stop.isVisible()) {
      await (opts.deeper ? page.getByRole('button', { name: /^Tiefer gehen/ }) : stop).click();
      continue;
    }
    if (await page.locator('.complete').isVisible()) return solved;
    // quick recall check on an explanation: pick a term, then continue
    const recall = page.locator('.recall-opt:not([disabled])').first();
    if (await recall.isVisible()) {
      await recall.click();
      continue;
    }
    const check = page.getByRole('button', { name: 'Prüfen' });
    if (await check.isVisible()) {
      await solve(page);
      await check.click();
      solved++;
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      continue;
    }
    // the lesson intro: play with it or not, then go
    const go = page.getByRole('button', { name: /^Los geht/ });
    if (await page.locator('.intro-hero').isVisible() && (await go.isVisible())) {
      await go.click();
      continue;
    }
    const reveal = page.getByRole('button', { name: 'Aufdecken' }).first();
    if (await reveal.isVisible()) {
      await reveal.click();
      continue;
    }
    const more = page.getByRole('button', { name: 'Weiter', exact: true }).first();
    if (await more.isVisible()) {
      await more.click();
      continue;
    }
    await page.waitForTimeout(150);
  }
  throw new Error('lesson did not finish');
}
