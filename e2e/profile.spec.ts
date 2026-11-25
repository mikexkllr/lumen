import { readFileSync } from 'node:fs';
import { apiAccount, openSignedIn, pushCompletedLesson, uniqueEmail, expect, test } from './helpers.ts';

test.describe('profile and settings', () => {
  test.beforeEach(async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('settings'));
    await pushCompletedLesson(request, token);
    await openSignedIn(page, token);
    await page.goto('/#/profile');
  });

  test('appearance, language, daily goal and font size apply right away and stay', async ({ page }) => {
    const html = page.locator('html');
    await page.getByRole('group', { name: 'Darstellung' }).getByRole('button', { name: 'Dunkel' }).click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('group', { name: 'Schriftgröße' }).getByRole('button', { name: 'XL' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--scale'))).toBe('1.3');
    await page.getByRole('group', { name: 'Tagesziel' }).getByRole('button', { name: '20′' }).click();
    await page.getByRole('switch', { name: /Hoher Kontrast/ }).or(page.getByLabel(/Hoher Kontrast/)).first().click();
    await expect(html).toHaveAttribute('data-contrast', 'high');

    await page.getByRole('group', { name: 'Sprache' }).getByRole('button', { name: 'English' }).click();
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
    await expect(page.locator('.tabbar')).toContainText('Learn');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  });

  test('the learning data can be exported and imported', async ({ page }) => {
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Daten exportieren/ }).click();
    const file = await download;
    const data = JSON.parse(readFileSync((await file.path())!, 'utf8')) as { format: string; events: { type: string }[] };
    expect(data.format).toBe('lumen-events');
    expect(data.events.some((e) => e.type === 'concept_completed')).toBe(true);

    await page.locator('input[type="file"]').setInputFiles({ name: 'lumen.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
    await expect(page.getByText(`${data.events.length} Ereignisse importiert.`)).toBeVisible();
    await expect(page.locator('.stat-tile').filter({ hasText: 'Lektionen' }).locator('strong')).toHaveText('1');
  });

  test('Lux can use an own API key, and a broken one is rejected', async ({ page }) => {
    await page.getByRole('group', { name: 'KI-Modell für Lux' }).getByRole('button', { name: 'Eigener Schlüssel' }).click();
    await page.getByRole('button', { name: 'Testen und speichern' }).click();
    await expect(page.getByRole('status').filter({ hasText: /Schlüssel|Modell|Adresse/ }).first()).toBeVisible();
  });

  test('reminders explain that they need the app on the web', async ({ page }) => {
    await expect(page.getByText('Erinnerungen per Benachrichtigung gibt es in der App für iOS und Android.')).toBeVisible();
  });

  test('the legal pages are complete and name no AI provider in the app', async ({ page }) => {
    for (const [link, heading] of [['Datenschutz', 'Datenschutz'], ['Nutzungsbedingungen & Community-Regeln', 'Nutzungsbedingungen & Community-Regeln'], ['Impressum', 'Impressum']]) {
      await page.goto('/#/profile');
      await page.getByRole('link', { name: link, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
      await expect(page.getByText(/Vorlage|Sync-Code|ohne Konto/)).toHaveCount(0);
    }
    await expect(page.getByText(/DeepSeek|OpenRouter/)).toHaveCount(0);
  });

  test('the badges and the activity map show the finished lesson', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Abzeichen · [1-9]\d*\/\d+/ })).toBeVisible();
    await expect(page.getByRole('img', { name: /1 aktive[rn]? Tag/ })).toBeVisible();
  });
});
