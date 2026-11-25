import { codeFor, onboardToAccount, signInWithEmail, uniqueEmail, expect, test } from './helpers.ts';

test.describe('first start: onboarding and sign-in', () => {
  test('a new learner signs up with an email code and the community is set up with it', async ({ page, request }) => {
    await onboardToAccount(page);
    // terms are accepted with signing in, links open the legal pages
    await expect(page.getByRole('link', { name: 'Nutzungsbedingungen samt Community-Regeln' })).toBeVisible();
    await signInWithEmail(page, request, uniqueEmail('new'));

    await expect(page.getByRole('heading', { name: 'Wie sollen dich andere sehen?' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeDisabled();
    await page.getByLabel('Anzeigename').fill('Ada Lovelace');
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Kurzer Einstufungstest?' })).toBeVisible();
    await page.getByRole('button', { name: /Überspringen/ }).click();
    await expect(page.getByRole('button', { name: 'Starten' })).toBeVisible();

    // no separate community sign-up: the league is right there
    await page.getByRole('link', { name: /Community/ }).first().click();
    await expect(page.getByRole('heading', { name: /^Liga / })).toBeVisible();
    await expect(page.getByLabel('Anzeigename')).toHaveCount(0);

    await page.getByRole('link', { name: 'Profil' }).first().click();
    await expect(page.getByText('Angemeldet per E-Mail')).toBeVisible();
    await expect(page.getByText('Ada Lovelace')).toBeVisible();
    // no sync codes anywhere any more
    await expect(page.getByText(/Sync-Code|Synchronisation/)).toHaveCount(0);
  });

  test('learners under 16 need a parent and get no community', async ({ page, request }) => {
    await onboardToAccount(page, 'unter 13');
    await page.getByLabel('E-Mail-Adresse').fill(uniqueEmail('kid'));
    const send = page.getByRole('button', { name: 'Code per E-Mail senden' });
    await expect(send).toBeDisabled();
    await page.getByLabel(/Ein Elternteil ist einverstanden/).check();
    await expect(send).toBeEnabled();
    await page.getByLabel('E-Mail-Adresse').clear();
    await signInWithEmail(page, request, uniqueEmail('kid'));

    // no name step for the community
    await expect(page.getByRole('heading', { name: 'Kurzer Einstufungstest?' })).toBeVisible();
    await page.getByRole('button', { name: /Überspringen/ }).click();
    await expect(page.locator('.tabbar')).toBeVisible();
    await expect(page.locator('.tabbar').getByRole('link', { name: /Community/ })).toHaveCount(0);

    await page.goto('/#/community');
    await expect(page.getByText('Freunde, Ligen und Neuigkeiten gibt es ab 16 Jahren.')).toBeVisible();
    await page.goto('/#/profile');
    await expect(page.getByRole('heading', { name: 'Community-Profil' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'KI-Modell für Lux' })).toHaveCount(0);
  });

  test('a wrong code is explained and another address can be used', async ({ page, request }) => {
    await onboardToAccount(page);
    const email = uniqueEmail('wrong');
    await page.getByLabel('E-Mail-Adresse').fill(email);
    await page.getByRole('button', { name: 'Code per E-Mail senden' }).click();
    const right = await codeFor(request, email);
    await page.getByLabel('6-stelliger Code').fill(right === '000000' ? '111111' : '000000');
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Der Code stimmt nicht.');
    await page.getByRole('button', { name: 'Andere Adresse' }).click();
    await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
  });

  test('the community can be skipped and joined later with one name', async ({ page, request }) => {
    await onboardToAccount(page);
    await signInWithEmail(page, request, uniqueEmail('skip'));
    await page.getByRole('button', { name: 'Ohne Community weiter' }).click();
    await page.getByRole('button', { name: /Überspringen/ }).click();

    await page.getByRole('link', { name: /Community/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Gemeinsam lernen' })).toBeVisible();
    await page.getByLabel('Anzeigename').fill('Grace');
    await page.getByRole('button', { name: /Community beitreten/ }).click();
    await expect(page.getByRole('heading', { name: /^Liga / })).toBeVisible();
  });

  test('going back keeps the answers, and the legal pages open from the sign-in step', async ({ page }) => {
    await onboardToAccount(page);
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page.getByRole('radio', { name: '16 oder älter' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Zurück' }).click();
    await expect(page.getByRole('radio', { name: /15 Min/ })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();

    await page.getByRole('link', { name: 'Datenschutzhinweise' }).click();
    await expect(page.getByRole('heading', { name: 'Datenschutz', exact: true })).toBeVisible();
    await expect(page.getByText(/Vorlage|Sync-Code/)).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Dein Lumen-Konto' })).toBeVisible();
  });

  test('without a connection the sign-in step says so and can retry', async ({ page }) => {
    await page.route('**/api/v1/features', (route) => route.abort());
    await onboardToAccount(page);
    await expect(page.getByText('Die Anmeldung ist gerade nicht erreichbar.', { exact: false })).toBeVisible();
    await page.unroute('**/api/v1/features');
    await page.getByRole('button', { name: 'Erneut versuchen' }).click();
    await expect(page.getByLabel('E-Mail-Adresse')).toBeVisible();
  });

  test('the app cannot be used without signing in', async ({ page }) => {
    for (const route of ['/#/', '/#/profile', '/#/community', '/#/learn/math.placevalue.digits']) {
      await page.goto(route);
      await expect(page.getByRole('button', { name: /Los geht/ })).toBeVisible();
    }
    await page.goto('/#/legal/imprint');
    await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  });
});
