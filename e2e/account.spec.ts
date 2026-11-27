import { randomBytes } from 'node:crypto';
import { API, apiAccount, auth, openSignedIn, pushCompletedLesson, signInWithEmail, today, uniqueEmail, expect, test } from './helpers.ts';

test.describe('account', () => {
  test('a returning learner signs in on a new device and gets their progress', async ({ page, request }) => {
    const email = uniqueEmail('back');
    const { token } = await apiAccount(request, email);
    await pushCompletedLesson(request, token);

    await page.goto('/');
    await page.getByRole('button', { name: 'Ich habe schon ein Konto' }).click();
    await expect(page.getByRole('heading', { name: 'Anmelden' })).toBeVisible();
    await signInWithEmail(page, request, email);
    // straight to the home screen, with the lesson from the other device done
    await expect(page.locator('.tabbar')).toBeVisible();
    await page.goto('/#/profile');
    await expect(page.locator('.stat-tile').filter({ hasText: 'XP gesamt' }).locator('strong')).toHaveText('10');
    await expect(page.locator('.stat-tile').filter({ hasText: 'Lektionen' }).locator('strong')).toHaveText('1');
  });

  test('signs in with Google on the web: to Google and back, new account first, then a second device', async ({ page, request, browser }) => {
    const sub = `google-${randomBytes(6).toString('hex')}`;
    // Stands in for Google's account page: answers with a signed ID token, as Google would.
    const google = async (p: typeof page) => p.route('https://accounts.google.com/**', async (route) => {
      const q = new URL(route.request().url()).searchParams;
      expect([q.get('response_type'), q.get('scope')]).toEqual(['id_token', 'openid']);
      const r = await request.get(`${API}/__e2e/google-token`, { params: { sub, nonce: q.get('nonce')!, aud: q.get('client_id')! } });
      const { idToken } = (await r.json()) as { idToken: string };
      await route.fulfill({ status: 302, headers: { location: `${q.get('redirect_uri')}#state=${q.get('state')}&id_token=${idToken}&authuser=0&prompt=none` } });
    });
    await google(page);
    await page.goto('/#/login');
    await page.getByRole('button', { name: 'Mit Google anmelden' }).click();
    await expect(page.getByRole('heading', { name: 'Was möchtest du lernen?' })).toBeVisible();
    expect(page.url()).not.toContain('id_token');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lumen.settings.v1') ?? '{}'));
    expect(stored.account.method).toBe('google');

    // a second device with the same Google account lands in that account
    const other = await browser.newContext();
    const second = await other.newPage();
    await google(second);
    await second.goto('/#/login');
    await second.getByRole('button', { name: 'Mit Google anmelden' }).click();
    await expect(second.locator('.tabbar')).toBeVisible();
    const token = await second.evaluate(() => JSON.parse(localStorage.getItem('lumen.settings.v1') ?? '{}').account.token as string);
    const linked = await request.get(`${API}/v1/auth`, { headers: auth(token) });
    expect(await linked.json()).toEqual({ apple: false, google: true, email: false });
    await other.close();
  });

  test('a new account from "I already have an account" still gets the onboarding', async ({ page, request }) => {
    await page.goto('/#/login');
    await signInWithEmail(page, request, uniqueEmail('fresh'));
    await expect(page.getByRole('heading', { name: 'Was möchtest du lernen?' })).toBeVisible();
  });

  test('signing out keeps the progress in the account and clears the device', async ({ page, request }) => {
    const email = uniqueEmail('out');
    const { token } = await apiAccount(request, email);
    await pushCompletedLesson(request, token);
    await openSignedIn(page, token);
    await page.goto('/#/profile');
    await expect(page.locator('.stat-tile').filter({ hasText: 'XP gesamt' }).locator('strong')).toHaveText('10');

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Abmelden' }).click();
    await expect(page.getByRole('button', { name: /Los geht/ })).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('lumen.settings.v1') ?? '{}'));
    expect(stored.account).toBeNull();
    expect(stored.onboarded).toBe(false);

    await page.getByRole('button', { name: 'Ich habe schon ein Konto' }).click();
    await signInWithEmail(page, request, email);
    await expect(page.locator('.tabbar')).toBeVisible();
    // the path follows the account's lessons, not a random one
    await expect(page.getByText(/Stellenwerte/).first()).toBeVisible();
    await page.goto('/#/profile');
    await expect(page.locator('.stat-tile').filter({ hasText: 'XP gesamt' }).locator('strong')).toHaveText('10');
  });

  test('deleting the account removes it on the server and on the device', async ({ page, request }) => {
    const email = uniqueEmail('delete');
    const { token } = await apiAccount(request, email);
    await pushCompletedLesson(request, token);
    await openSignedIn(page, token);
    await page.goto('/#/profile');

    await page.getByRole('button', { name: 'Konto löschen' }).click();
    await expect(page.getByRole('alertdialog')).toContainText('endgültig');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Konto löschen' }).click();
    await expect(page.getByRole('button', { name: /Los geht/ })).toBeVisible();

    // the old device code is refused now, so other devices sign out too
    const exported = await request.get(`${API}/v1/export`, { headers: auth(token) });
    expect(exported.status()).toBe(401);
    // the email is free again: signing in creates a new, empty account
    expect((await apiAccount(request, email)).created).toBe(true);
  });

  test('cancelling the sign-out dialog keeps the learner signed in', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('stay'));
    await openSignedIn(page, token);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'Abmelden' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Abbrechen' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Konto' })).toBeVisible();
  });

  test('a sync code from before sign-in keeps working as the account', async ({ page, request }) => {
    const code = [...randomBytes(20)].map((b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32]).join('').match(/.{4}/g)!.join('-');
    await pushCompletedLesson(request, code);
    await page.addInitScript((c) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('lumen.settings.v1', JSON.stringify({ onboarded: true, locale: 'de', age: '16+', pathId: 'path.math', sync: { serverUrl: '/api', token: c, lastSync: null, cursor: 0, consent: true } }));
    }, code);
    await page.goto('/#/profile');
    await expect(page.locator('.stat-tile').filter({ hasText: 'XP gesamt' }).locator('strong')).toHaveText('10');
    await expect(page.getByText('Verknüpfe eine Anmeldung', { exact: false })).toBeVisible();
  });

  test('progress learned before sign-in became necessary comes along into the new account', async ({ page, request }) => {
    // an old local-only learner: onboarded, events in IndexedDB, no account
    await page.goto('/#/legal/imprint');
    await page.evaluate(async (day) => {
      localStorage.setItem('lumen.settings.v1', JSON.stringify({ onboarded: true, locale: 'de', age: '16+', pathId: 'path.math' }));
      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('lumen', 1);
        open.onupgradeneeded = () => {
          const s = open.result.createObjectStore('events', { keyPath: 'id' });
          s.createIndex('synced', 'synced');
        };
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const tx = open.result.transaction('events', 'readwrite');
          tx.objectStore('events').put({ id: crypto.randomUUID(), type: 'concept_completed', ts: Date.now(), day, conceptId: 'math.placevalue.digits', topicId: 'math.placevalue', problems: 3, firstTryCorrect: 3, durationMs: 60000, synced: 0 });
          tx.oncomplete = () => { open.result.close(); resolve(); };
        };
      });
    }, today());
    await page.goto('/');
    await page.reload();
    await expect(page.getByText('Lumen sichert deinen Fortschritt jetzt in einem Konto.', { exact: false })).toBeVisible();
    const email = uniqueEmail('local');
    await signInWithEmail(page, request, email);
    await expect(page.locator('.tabbar')).toBeVisible();

    // the local lesson is now in the account: a second device sees it
    const { token } = await apiAccount(request, email);
    await expect.poll(async () => ((await (await request.get(`${API}/v1/export`, { headers: auth(token) })).json()) as { events: unknown[] }).events.length).toBe(1);
  });
});
