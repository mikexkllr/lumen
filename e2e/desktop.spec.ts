import { apiAccount, codeFor, openSignedIn, pushCompletedLesson, uniqueEmail, expect, test } from './helpers.ts';

test.describe('desktop, English @desktop', () => {
  test('sign-up in English and navigation through the sidebar', async ({ page, request }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Understand by doing.' })).toBeVisible();
    await page.getByRole('button', { name: 'Get started' }).click();
    await page.getByRole('button', { name: /Mathematics/ }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('radio', { name: /Out of curiosity/ }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('radio', { name: '16 or older' }).click();
    await page.getByRole('button', { name: 'Next', exact: true }).click();

    const email = uniqueEmail('desk');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Email me a code' }).click();
    await page.getByLabel('6-digit code').fill(await codeFor(request, email));
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Display name').fill('Lin');
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('button', { name: /Skip/ }).click();

    const side = page.locator('.sidebar');
    await expect(side).toBeVisible();
    await expect(page.locator('.tabbar')).toBeHidden();
    for (const [label, heading] of [['Discover', 'Discover'], ['Review', 'Review'], ['Community', 'Community'], ['Profile', 'Profile']]) {
      await side.getByRole('link', { name: new RegExp(`^${label}`) }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 }).first()).toBeVisible();
    }
    await expect(page.getByText('Signed in with email')).toBeVisible();
  });

  test('profile statistics and the lesson summary are in English', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('en'));
    await pushCompletedLesson(request, token);
    await openSignedIn(page, token, { locale: 'en' });
    await page.goto('/#/profile');
    await expect(page.locator('.stat-tile').filter({ hasText: 'Lessons' }).locator('strong')).toHaveText('1');
    await expect(page.getByText(/1 active day in 18 weeks/).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Lektion|Einstellungen|Sync/);
  });
});
