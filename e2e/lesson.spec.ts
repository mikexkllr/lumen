import { API, apiAccount, auth, conceptWithParts, firstLesson, lessonOfStep, loadCatalog, openSignedIn, playToEnd, pushCompletedLesson, solve, uniqueEmail, expect, test, skipIntro } from './helpers.ts';

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe('lessons', () => {
  test('the first lesson can be played to the end, earns XP and is backed up', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('lesson'));
    await openSignedIn(page, token);
    const first = firstLesson(await loadCatalog(request));
    await expect(page.getByRole('heading', { name: first.title, level: 2 })).toBeVisible();
    await page.getByRole('button', { name: 'Starten' }).click();
    // a lesson is a handful of steps, one segment each
    await expect(page.locator('.seg-progress .seg')).toHaveCount(first.steps);
    expect(first.steps).toBeLessThanOrEqual(6);
    const solved = await playToEnd(page);
    expect(solved).toBe(first.problems);

    // a flawless run is celebrated as such, with the first badges and the streak
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Fehlerfrei|Lektion abgeschlossen/);
    await expect(page.getByText('Erster Schritt')).toBeVisible();
    await expect(page.getByText('Serie verlängert', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Zur Übersicht' }).click();
    // streak and XP on the home screen, the next lesson is up
    await expect(page.locator('.streak-hero-card')).toContainText('Heute geschafft');
    await expect(page.locator('.cc-meta')).toContainText(/Lektion 2 von \d+/);
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
    // the lesson with the choice "value of the 7 in 4 728"; whatever comes before it in that lesson is played through
    await page.goto(`/#/learn/${await lessonOfStep(request, 'math.placevalue', 'math.placevalue.digits/c2')}`);
    await skipIntro(page);
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
    await skipIntro(page);
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
    await skipIntro(page);
    await solve(page);
    await page.getByRole('button', { name: 'Prüfen' }).click();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();

    await page.getByRole('button', { name: 'Lektion verlassen' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Weiterlernen' }).click();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Lektion verlassen' })).toBeVisible();
    await page.getByRole('button', { name: 'Lektion verlassen' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Verlassen', exact: true }).click();
    await expect(page.locator('.tabbar')).toBeVisible();
  });

  test('the daily puzzle can be solved from the home screen', async ({ page, request }) => {
    const { token } = await apiAccount(request, uniqueEmail('daily'));
    await openSignedIn(page, token);
    await page.getByText('Rätsel des Tages').first().click();
    await playToEnd(page);
    await expect(page.locator('.complete')).toBeVisible();
  });

  test('lessons are short: the parts of a concept follow each other and its bonus lessons are offered at the end', async ({ page, request }) => {
    const cat = await loadCatalog(request);
    const { core, deeper, expert } = conceptWithParts(cat, 'math.placevalue');
    const { token } = await apiAccount(request, uniqueEmail('parts'));
    await openSignedIn(page, token);
    await page.goto(`/#/learn/${core[0]}`);
    await expect(page.locator('.seg-progress .seg')).toHaveCount(cat.concepts[core[0]].steps);
    await playToEnd(page);
    await expect(page.locator('.complete')).toContainText('Teil 1 von 2');
    await expect(page.getByRole('button', { name: /^Bonus/ })).toHaveCount(0);

    await page.getByRole('button', { name: 'Nächste Lektion' }).click();
    await expect(page).toHaveURL(new RegExp(`learn/${escapeRe(core[1])}$`));
    // no intro screen in the second part: Lux says where we are
    await expect(page.locator('.lux-pop')).toContainText('Teil 2 von 2');
    await playToEnd(page);
    // the core of the concept is done: going deeper is on offer, the next lesson stays the main way
    await expect(page.getByRole('button', { name: 'Nächste Lektion' })).toBeVisible();
    await page.getByRole('button', { name: /^Bonus: Tiefer gehen/ }).click();
    await expect(page).toHaveURL(new RegExp(`learn/${escapeRe(deeper)}$`));
    await expect(page.locator('.lux-pop')).toContainText('tiefer');
    await playToEnd(page);
    await expect(page.locator('.complete')).toContainText('Tiefer-Lektion gemeistert');
    await page.getByRole('button', { name: /^Bonus: Experten-Runde/ }).click();
    await expect(page).toHaveURL(new RegExp(`learn/${escapeRe(expert)}$`));
  });

  test('the first session of a day celebrates the streak, later ones go straight to the summary', async ({ page, request }) => {
    const cat = await loadCatalog(request);
    const { core } = conceptWithParts(cat, 'math.placevalue');
    const { token } = await apiAccount(request, uniqueEmail('party'));
    await openSignedIn(page, token);
    await expect(page.locator('.streak-hero-card')).toContainText('Starte heute deine Serie');
    await page.goto(`/#/learn/${core[0]}`);
    await playToEnd(page, { stopAtStreak: true });
    const party = page.locator('.streak-party');
    await expect(party).toContainText('Serie gestartet!');
    await expect(page.getByRole('heading', { name: '1 Tag in Folge' })).toBeVisible();
    await expect(party).toContainText('Noch 2 Tage bis zur 3-Tage-Serie');
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await expect(page.locator('.complete')).toContainText('Serie verlängert');

    await page.getByRole('button', { name: 'Nächste Lektion' }).click();
    await expect(page.locator('.lesson-stage')).toBeVisible();
    await playToEnd(page, { stopAtStreak: true });
    await expect(party).toHaveCount(0);
    await expect(page.locator('.complete')).toBeVisible();
  });

  test('progress from before the short lessons counts for the core of a concept, and old links still work', async ({ page, request }) => {
    const cat = await loadCatalog(request);
    const { group, core, deeper } = conceptWithParts(cat, 'math.placevalue');
    const { token } = await apiAccount(request, uniqueEmail('legacy'));
    // an event as the app wrote it when a lesson was a whole concept
    await pushCompletedLesson(request, token, group);
    await openSignedIn(page, token);
    await page.goto('/#/topic/math.placevalue');
    for (const id of core) await expect(page.locator(`a.lesson-row[href="#/learn/${id}"]`)).toHaveAttribute('data-state', 'done');
    await expect(page.locator(`a.extra-chip[href="#/learn/${deeper}"]`)).toHaveAttribute('data-state', 'open');
    await page.goto(`/#/learn/${group}`);
    await expect(page).toHaveURL(new RegExp(`learn/${escapeRe(core[0])}$`));
    await expect(page.locator('.lesson-stage')).toBeVisible();
  });

  test('a deeper learning depth puts the bonus lessons on the path', async ({ page, request }) => {
    const cat = await loadCatalog(request);
    const { core, deeper } = conceptWithParts(cat, 'math.placevalue');
    const { token } = await apiAccount(request, uniqueEmail('depth'));
    for (const id of core) await pushCompletedLesson(request, token, id);
    await openSignedIn(page, token);
    const chip = page.locator(`a.extra-chip[href="#/learn/${deeper}"]`);
    await page.goto('/#/topic/math.placevalue');
    await expect(chip).toHaveAttribute('data-state', 'open');
    await page.goto('/#/profile');
    await page.getByRole('group', { name: 'Lerntiefe' }).getByRole('button', { name: 'Tiefer' }).click();
    await page.goto('/#/topic/math.placevalue');
    await expect(chip).toHaveAttribute('data-state', 'next');
  });
});
