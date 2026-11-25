import { API, apiAccount, auth, openSignedIn, playToEnd, solve, uniqueEmail, expect, test } from './helpers.ts';

test.describe('lessons', () => {
  test('the first lesson can be played to the end, earns XP and is backed up', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('lesson'));
    await openSignedIn(page, token);
    await expect(page.getByRole('heading', { name: 'Ziffern und Stellen' })).toBeVisible();
    await page.getByRole('button', { name: 'Starten' }).click();
    const solved = await playToEnd(page);
    expect(solved).toBeGreaterThan(2);

    // a flawless run is celebrated as such, with the first badges and the streak
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Fehlerfrei|Lektion abgeschlossen/);
    await expect(page.getByText('Erster Schritt')).toBeVisible();
    await expect(page.getByText('Serie verlängert', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Zur Übersicht' }).click();
    // streak and XP on the home screen, the next lesson is up
    await expect(page.getByRole('heading', { name: 'Ziffern und Stellen' })).toHaveCount(0);
    await page.goto('/#/profile');
    await expect(page.locator('.stat-tile').filter({ hasText: 'Lektionen' }).locator('strong')).toHaveText('1');
    await expect(page.locator('.stat-tile').filter({ hasText: 'Tage in Folge' }).locator('strong')).toHaveText('1');

    // the background backup reaches the server within a few seconds
    await expect.poll(async () => {
      const r = await request.get(`${API}/v1/export`, { headers: auth(token) });
      return ((await r.json()) as { events: { type: string }[] }).events.some((e) => e.type === 'concept_completed');
    }, { timeout: 15_000 }).toBe(true);

    // its cards are due for review later, the review tab explains that
    await page.goto('/#/review');
    await expect(page.getByRole('heading', { name: 'Wiederholen' }).first()).toBeVisible();
  });

  test('a wrong answer gets feedback, a hint and the solution', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('wrong'));
    await openSignedIn(page, token);
    await page.goto('/#/learn/math.placevalue.digits');
    // first the hook problem, then an explanation; the choice "value of the 7 in 4 728" follows
    const target = page.getByRole('heading', { name: 'Welchen Wert hat die 7 in 4 728?' });
    for (let i = 0; i < 12 && !(await target.isVisible()); i++) {
      await expect(page.getByRole('button', { name: /^(Prüfen|Weiter|Überspringen)$/ }).first()).toBeVisible();
      if (await page.getByRole('button', { name: 'Prüfen' }).isVisible()) {
        await solve(page);
        await page.getByRole('button', { name: 'Prüfen' }).click();
      } else if (await page.locator('.recall-opt:not([disabled])').first().isVisible()) {
        await page.locator('.recall-opt').first().click();
      }
      await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: 'Welchen Wert hat die 7 in 4 728?' })).toBeVisible();

    await page.getByRole('button', { name: 'Hinweis' }).click();
    await expect(page.getByText('Zähl die Stellen von rechts', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: /^7000$|7000/ }).click();
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await expect(page.getByText('Noch nicht ganz.')).toBeVisible();
    await expect(page.getByText('Die Tausender stehen ganz links', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Lösung zeigen' }).click();
    await expect(page.getByText('So geht’s')).toBeVisible();
    await expect(page.getByText('Die 7 steht bei den Hundertern', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  });

  test('Lux answers with the lesson hints when no AI model is configured', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('lux'));
    await openSignedIn(page, token);
    await page.goto('/#/learn/math.placevalue.digits');
    await page.getByRole('button', { name: 'Frag Lux' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // the rule tutor offers its starters and never names an AI provider
    await expect(dialog.getByText(/DeepSeek|OpenRouter/)).toHaveCount(0);
    await dialog.getByRole('button').filter({ hasText: /Tipp|Worum/ }).first().click();
    await expect(dialog.locator('.lux-msg, .msg, [class*="bubble"]').last()).toBeVisible();
    await page.keyboard.press('Escape');
  });

  test('leaving a lesson asks first', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('leave'));
    await openSignedIn(page, token);
    await page.goto('/#/learn/math.placevalue.digits');
    await solve(page);
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();

    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'Lektion verlassen' }).click();
    await expect(page.getByRole('button', { name: 'Lektion verlassen' })).toBeVisible();
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Lektion verlassen' }).click();
    await expect(page.locator('.tabbar')).toBeVisible();
  });

  test('the daily puzzle can be solved from the home screen', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('daily'));
    await openSignedIn(page, token);
    await page.getByText('Rätsel des Tages').first().click();
    await playToEnd(page);
    await expect(page.locator('.complete')).toBeVisible();
  });
});
