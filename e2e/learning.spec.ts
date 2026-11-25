import { apiAccount, onboardToAccount, openSignedIn, playToEnd, pushCompletedLesson, signInWithEmail, uniqueEmail, expect, test } from './helpers.ts';

test.describe('placement, courses, review and streak', () => {
  test('the placement check suggests where to start', async ({ page, request }) => {
    await onboardToAccount(page);
    await signInWithEmail(page, request, uniqueEmail('place'));
    await page.getByRole('button', { name: 'Ohne Community weiter' }).click();
    await page.getByRole('button', { name: /Test starten/ }).click();
    // five real problems, one try each, no hints
    for (let i = 0; i < 5; i++) {
      await expect(page.getByText('Einstufung: keine Hinweise, ein Versuch pro Aufgabe.')).toBeVisible();
      const options = page.locator('.option');
      if (await options.count()) await options.first().click();
      else {
        const input = page.locator('.num-input input, input[type="text"]').first();
        if (await input.isVisible()) await input.fill('1');
        else await page.evaluate(() => (window as { __lumenSolve?: () => boolean }).__lumenSolve?.());
      }
      await page.getByRole('button', { name: 'Prüfen' }).click();
    }
    await expect(page.getByText('Einstufung fertig')).toBeVisible();
    await page.getByRole('button', { name: /Los|Starten|Zur Übersicht|Weiter/ }).first().click();
    await expect(page.locator('.tabbar')).toBeVisible();
  });

  test('courses: subjects, a course page and its first lesson', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('browse'));
    await openSignedIn(page, token);
    await page.locator('.tabbar').getByRole('link', { name: 'Kurse' }).click();
    await expect(page.getByRole('heading', { name: 'Kurse', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Fächer' })).toBeVisible();

    await page.getByRole('button', { name: /Physik/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Physik', exact: false }).first()).toBeVisible();
    await page.locator('a[href^="#/topic/"]').first().click();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByRole('button', { name: /Starten|Fortsetzen/ }).first().click();
    await expect(page.getByRole('button', { name: 'Lektion verlassen' })).toBeVisible();
  });

  test('search finds courses and lessons', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('search'));
    await openSignedIn(page, token);
    await page.goto('/#/discover');
    await page.getByRole('searchbox').or(page.getByPlaceholder('Thema, Begriff …')).first().fill('Bruch');
    await expect(page.getByRole('heading', { name: 'Kurse', level: 2 })).toBeVisible();
    await page.getByRole('searchbox').or(page.getByPlaceholder('Thema, Begriff …')).first().fill('xqzxqz');
    await expect(page.getByText('Nichts gefunden.')).toBeVisible();
  });

  test('review is empty at first and offers practice after a lesson', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('review'));
    await openSignedIn(page, token);
    await page.goto('/#/review');
    await expect(page.getByRole('heading', { name: 'Noch nichts zu wiederholen' })).toBeVisible();

    await page.goto('/#/learn/math.placevalue.digits');
    await playToEnd(page);
    await page.getByRole('button', { name: 'Zur Übersicht' }).click();
    await page.goto('/#/review');
    await expect(page.getByRole('heading', { name: 'Aufgaben im Gedächtnis' })).toBeVisible();
    await page.getByRole('button', { name: /Freiwillig üben|Wiederholung starten/ }).click();
    await playToEnd(page);
    await expect(page.locator('.complete')).toBeVisible();
  });

  test('the streak screen shows today and the calendar', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('streak'));
    await pushCompletedLesson(request, token);
    await openSignedIn(page, token);
    await page.goto('/#/streak');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('1 Tag in Folge');
    await expect(page.locator('.streak-hero')).toContainText('Heute geschafft');
    await expect(page.getByText(/November|Dezember|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober/).first()).toBeVisible();
  });

  test('the learning path can be switched on the home screen', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('path'));
    await openSignedIn(page, token);
    await page.goto('/#/discover/physics');
    await page.getByRole('button', { name: 'Als meinen Lernpfad wählen' }).click();
    await expect(page.locator('.tabbar')).toBeVisible();
    await page.goto('/#/discover/physics');
    await expect(page.getByRole('button', { name: 'Dein Lernpfad' })).toBeDisabled();
  });
});
