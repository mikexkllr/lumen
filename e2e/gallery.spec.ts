/**
 * Screenshots of every screen in light and dark mode for a visual review (no assertions on
 * pixels). Run with `npm run e2e -- --project gallery`; the images land in test-results/e2e.
 */
import type { Page } from '@playwright/test';
import { apiAccount, createProfile, onboardToAccount, openSignedIn, pushCompletedLesson, solve, uniqueEmail, expect, test } from './helpers.ts';

const shot = async (page: Page, name: string, fullPage = true) => {
  await page.waitForTimeout(350);
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage });
};

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`gallery ${scheme} @gallery`, () => {
    test.use({ colorScheme: scheme });

    test(`signed out (${scheme})`, async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('button', { name: /Los geht/ })).toBeVisible();
      await shot(page, '01-welcome', false);
      await page.getByRole('button', { name: /Los geht/ }).click();
      await shot(page, '02-interests');
      await onboardToAccount(page);
      await shot(page, '03-account');
      await page.goto('/#/onboarding/age');
      await page.getByRole('radio', { name: 'unter 13' }).click();
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await shot(page, '04-account-kid');
      await page.goto('/#/login');
      await shot(page, '05-login');
      await page.goto('/#/legal/privacy');
      await shot(page, '06-legal-signed-out');
    });

    test(`signed in (${scheme})`, async ({ page, request }) => {
      const { token } = await apiAccount(request, uniqueEmail('gallery'));
      const p = await createProfile(request, token, 'Ada Lovelace', `ada_${Math.floor(Math.random() * 1e6)}`);
      await pushCompletedLesson(request, token);
      await openSignedIn(page, token, { social: { userId: p.id, handle: p.handle }, communityName: 'Ada Lovelace' });
      await shot(page, '10-home');
      for (const [route, name] of [['discover', '11-discover'], ['discover/physics', '12-subject'], ['topic/math.placevalue', '13-topic'], ['review', '14-review'], ['profile', '15-profile'], ['community/league', '16-league'], ['community/friends', '17-friends'], ['community/feed', '18-feed'], ['community/edit', '19-edit-profile'], [`u/${p.id}`, '20-user'], ['streak', '21-streak'], ['legal/terms', '22-terms'], ['legal/imprint', '23-imprint']] as const) {
        await page.goto(`/#/${route}`);
        await page.waitForLoadState('networkidle');
        await shot(page, name);
      }
    });

    test(`lesson (${scheme})`, async ({ page, request }) => {
      const { token } = await apiAccount(request, uniqueEmail('gallery-lesson'));
      await openSignedIn(page, token);
      await page.goto('/#/learn/math.placevalue.digits');
      await expect(page.getByRole('button', { name: 'Prüfen' })).toBeVisible();
      await shot(page, '30-problem', false);
      await solve(page);
      await page.getByRole('button', { name: 'Prüfen' }).click();
      await shot(page, '31-correct', false);
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
      await shot(page, '32-explain', false);
      await page.getByRole('button', { name: 'Frag Lux' }).first().click().catch(() => {});
      await shot(page, '33-lux', false);
      await page.keyboard.press('Escape');
      await page.goto('/#/placement');
      await shot(page, '34-placement', false);
    });
  });
}
