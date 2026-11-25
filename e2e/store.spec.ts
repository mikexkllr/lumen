/**
 * App Store screenshots: the real app against the e2e server with a believable learner (12-day
 * streak, friends, a league), framed like the device (safe areas emulated, iOS status bar).
 * Writes store-screenshots/<locale>/<displayType>/NN-name.png for `asc.ts screenshots`.
 *
 *   npm run build:e2e && E2E_TUTOR=fake npm run e2e -- --project store-iphone --project store-ipad --workers 1
 */
import type { APIRequestContext, Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { API, apiAccount, auth, createProfile, expect, openSignedIn, solve, test } from './helpers.ts';

const OUT = resolve(import.meta.dirname, '../store-screenshots');
const DEVICES = {
  'store-iphone': { type: 'APP_IPHONE_67', insets: { top: 62, bottom: 34 }, bar: 'phone' },
  'store-ipad': { type: 'APP_IPAD_PRO_3GEN_129', insets: { top: 24, bottom: 20 }, bar: 'pad' },
} as const;

const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(18, 0, 0, 0); return d; };

const PATH = ['math.placevalue.digits', 'math.placevalue.big', 'math.placevalue.rounding', 'math.placevalue.powers', 'math.mental.split', 'math.mental.tricks', 'math.mental.estimate', 'math.mental.percent', 'math.mental.check', 'math.mental.lab', 'math.negative.line', 'math.negative.add'];
const topicOf = (c: string) => c.split('.').slice(0, 2).join('.');

/** Same id for the same lesson, so the cast can be set up again without counting twice. */
const eventId = (...parts: (string | number)[]) => {
  const h = createHash('sha256').update(parts.join('|')).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};

/** One lesson on each of the last `days` days, plus `today` more today – as if learned in the app. */
async function learn(request: APIRequestContext, who: string, token: string, days: number, today = 0, concepts = PATH) {
  const events: Record<string, unknown>[] = [];
  const lessons = [...Array.from({ length: days }, (_, i) => days - 1 - i), ...Array.from({ length: today }, () => 0)];
  lessons.forEach((ago, i) => {
    const when = daysAgo(ago);
    when.setMinutes(i);
    const conceptId = concepts[i % concepts.length];
    events.push({ id: eventId(who, 'c', i), type: 'concept_completed', ts: when.getTime(), day: dayKey(when), conceptId, topicId: topicOf(conceptId), problems: 6, firstTryCorrect: 5, durationMs: 300_000 });
    for (let k = 0; k < 4; k++) events.push({ id: eventId(who, 'a', i, k), type: 'attempt', ts: when.getTime() - k * 60_000, day: dayKey(when), stepId: `${conceptId}/s${k}`, conceptId, topicId: topicOf(conceptId), context: 'lesson', problem: true, seed: k, correct: k !== 2, final: true, attemptNo: 1, hintsUsed: 0, durationMs: 40_000, difficulty: 1, state: null });
  });
  const r = await request.post(`${API}/v1/sync`, { headers: auth(token), data: { events, since: 0, today: dayKey(new Date()) } });
  expect(r.ok()).toBe(true);
}

/** A learner of the cast: always the same account, handle and history. */
async function person(request: APIRequestContext, name: string, days: number, today: number, avatar: string, concepts = PATH.slice(days % 5)) {
  const { token } = await apiAccount(request, `store-${name.toLowerCase()}@e2e.test`);
  const p = await createProfile(request, token, name, `${name.toLowerCase()}_${name.length}96`, avatar);
  await learn(request, name, token, days, today, concepts);
  return { token, ...p };
}

/** iOS status bar and home indicator over the emulated safe areas. */
async function frame(page: Page, bar: 'phone' | 'pad', insets: { top: number; bottom: number }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: insets.top, bottom: insets.bottom, left: 0, right: 0 } });
  await page.addInitScript(({ bar, insets }) => {
    const add = () => {
      if (document.getElementById('store-frame')) return;
      const el = document.createElement('div');
      el.id = 'store-frame';
      const icons = `<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
        <svg width="17" height="12" viewBox="0 0 17 12"><path d="M8.5 2.2c2.4 0 4.6.9 6.2 2.5l1.3-1.3A10.6 10.6 0 0 0 8.5.4 10.6 10.6 0 0 0 1 3.4l1.3 1.3a8.8 8.8 0 0 1 6.2-2.5Zm0 3.6c1.4 0 2.8.6 3.7 1.5l1.3-1.3a7 7 0 0 0-10 0l1.3 1.3c.9-.9 2.3-1.5 3.7-1.5Zm0 3.6c.5 0 .9.2 1.2.5L8.5 11 7.3 9.9c.3-.3.7-.5 1.2-.5Z"/></svg>
        <svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2"/><path d="M25 4.5v4a2 2 0 0 0 0-4Z" opacity=".4"/></svg>`;
      el.innerHTML = `<div class="sf-bar"><span class="sf-time">9:41</span>${bar === 'pad' ? '<span class="sf-date"></span>' : ''}<span class="sf-icons">${icons}</span></div><div class="sf-home"></div>`;
      const style = document.createElement('style');
      style.textContent = `#store-frame .sf-bar { position: fixed; top: 0; left: 0; right: 0; height: ${insets.top}px; z-index: 99999; display: flex; align-items: ${bar === 'phone' ? 'center' : 'center'}; justify-content: space-between; padding: ${bar === 'phone' ? '10px 34px 0 52px' : '0 22px'}; font: 600 ${bar === 'phone' ? 17 : 14}px -apple-system, 'SF Pro Text', Inter, system-ui; color: var(--ink, #111); pointer-events: none; }
        /* headless Chromium draws no backdrop blur; on the device the tab bar is frosted, here opaque */
        .tabbar, .onb-foot, .foot { background: var(--bg) !important; }
        #store-frame .sf-icons { display: flex; gap: 6px; align-items: center; fill: currentColor; }
        #store-frame .sf-home { position: fixed; bottom: 8px; left: 50%; transform: translateX(-50%); width: ${bar === 'phone' ? 140 : 320}px; height: 5px; border-radius: 3px; background: var(--ink, #111); z-index: 99999; pointer-events: none; }`;
      document.documentElement.append(style, el);
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add);
    else add();
  }, { bar, insets });
}

for (const locale of ['en-US', 'de-DE'] as const) {
  const lang = locale.slice(0, 2) as 'en' | 'de';
  const de = lang === 'de';
  test.describe(`store screenshots ${locale} @store`, () => {
    test.use({ locale, colorScheme: 'light', timezoneId: 'Europe/Berlin' });

    test(`all screens (${locale})`, async ({ page, request }, info) => {
      const device = DEVICES[info.project.name as keyof typeof DEVICES];
      const dir = join(OUT, locale, device.type);
      mkdirSync(dir, { recursive: true });
      const shot = async (name: string) => {
        await page.waitForTimeout(600);
        await page.screenshot({ path: join(dir, `${name}.png`), animations: 'disabled' });
      };
      await frame(page, device.bar, device.insets);

      // 1. welcome (signed out)
      await page.addInitScript((l) => { if (!localStorage.getItem('lumen.settings.v1')) localStorage.setItem('lumen.settings.v1', JSON.stringify({ locale: l, reduceMotion: 'reduce', sound: false })); }, lang);
      await page.goto('/#/welcome');
      await expect(page.locator('.welcome-hero .lux')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await shot('01-welcome');
      await page.evaluate(() => localStorage.clear());

      // the learner and their friends (idempotent, so every device and language sees the same league)
      const friends = [];
      for (const [n, d, t, a] of [['Mia', 9, 6, 'c4-i8'], ['Jonas', 6, 2, 'c5-i1'], ['Aylin', 14, 4, 'c2-i14'], ['Noah', 4, 1, 'c8-i5'], ['Ella', 7, 2, 'c6-i11'], ['Luca', 3, 0, 'c3-i4'], ['Sofia', 10, 3, 'c7-i9']] as const) friends.push(await person(request, n, d, t, a));
      const lina = await person(request, 'Lina', 12, 3, 'c0-i0', PATH);
      const { token } = lina;
      const me = lina;
      for (const f of friends.slice(0, 4)) {
        await request.post(`${API}/v1/social/friends?today=${dayKey(new Date())}`, { headers: auth(token), data: { userId: f.id } });
        await request.post(`${API}/v1/social/friends/${me.id}/accept?today=${dayKey(new Date())}`, { headers: auth(f.token) });
      }
      // everybody joins this week's league by opening the community once
      for (const f of friends) await request.get(`${API}/v1/social/me?today=${dayKey(new Date())}`, { headers: auth(f.token) });
      await request.post(`${API}/v1/social/feed?today=${dayKey(new Date())}`, { headers: auth(friends[0].token), data: { kind: 'course', ref: 'math.placevalue' } });

      await page.evaluate(() => sessionStorage.clear());
      await openSignedIn(page, token, { locale: lang, social: { userId: me.id, handle: me.handle }, communityName: 'Lina' });
      await page.evaluate(() => {
        const s = JSON.parse(localStorage.getItem('lumen.settings.v1')!);
        localStorage.setItem('lumen.settings.v1', JSON.stringify({ ...s, reduceMotion: 'reduce', sound: false, dailyGoal: 10, tutorConsent: true }));
      });

      // 2. home with the path and the streak
      await page.goto('/#/');
      await page.reload();
      // the background sync pulls the 12 days of lessons
      await expect(page.getByRole('link', { name: de ? '12 Tage in Folge' : '12 day streak' }).first()).toBeAttached({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      await shot('02-home');

      // 3. an interactive problem
      await page.goto('/#/learn/ai.neural.boundary');
      await expect(page.getByRole('button', { name: de ? 'Prüfen' : 'Check' })).toBeVisible();
      const slider = page.getByRole('slider').first();
      if (await slider.isVisible()) {
        await slider.focus();
        for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowRight');
      }
      await shot('03-lesson');

      const phone = device.bar === 'phone';
      if (phone) {
        // 4. Lux helps without giving the answer away
        await page.goto('/#/learn/cs.code.sequence');
        await expect(page.getByRole('button', { name: de ? 'Prüfen' : 'Check' })).toBeVisible();
        await page.getByRole('button', { name: de ? 'Frag Lux' : 'Ask Lux' }).first().click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await dialog.getByRole('button', { name: de ? 'Tipp' : 'Hint', exact: true }).first().click();
        await expect(dialog.getByText(de ? /Zähl erst mal/ : /First count/)).toBeVisible();
        await shot('04-lux');
        await page.keyboard.press('Escape');

        // 5. a correct answer
        await page.goto('/#/learn/logic.sets.basics');
        await solve(page, de ? 'Prüfen' : 'Check');
        await page.getByRole('button', { name: de ? 'Prüfen' : 'Check' }).click();
        await shot('05-correct');
      } else {
        // 4. all subjects (the wide layout shines on the iPad)
        await page.goto('/#/discover');
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await shot('04-discover');
      }

      // weekly league
      await page.goto('/#/community/league');
      await expect(page.locator('.rank-row').first()).toBeVisible();
      await shot(phone ? '06-league' : '05-league');

      // streak calendar
      await page.goto('/#/streak');
      await expect(page.locator('.streak-hero')).toBeVisible();
      await shot(phone ? '07-streak' : '06-streak');
    });
  });
}
