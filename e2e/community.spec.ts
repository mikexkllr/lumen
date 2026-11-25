import type { APIRequestContext } from '@playwright/test';
import { API, apiAccount, auth, createProfile, testHandle, openSignedIn, pushCompletedLesson, today, uniqueEmail, expect, test } from './helpers.ts';

/** A second learner who exists only through the API. */
async function otherLearner(request: APIRequestContext, name: string) {
  const { token } = await apiAccount(request, uniqueEmail('friend'));
  const handle = testHandle(name);
  const profile = await createProfile(request, token, name, handle);
  return { token, handle, id: profile.id };
}

async function me(request: APIRequestContext, name: string) {
  const { token } = await apiAccount(request, uniqueEmail('me'));
  const handle = testHandle(name);
  const profile = await createProfile(request, token, name, handle);
  return { token, handle, id: profile.id, social: { userId: profile.id, handle } };
}

test.describe('community', () => {
  test('friends: request by username, accepted, friend streak and nudge', async ({ page, request }) => {
    const a = await me(request, 'Ada');
    const b = await otherLearner(request, 'Bea');
    await openSignedIn(page, a.token, { social: a.social, communityName: 'Ada' });

    await page.goto('/#/community/friends');
    await page.getByRole('textbox', { name: 'Benutzername' }).fill(`@${b.handle}`);
    await page.getByRole('button', { name: 'Anfrage senden' }).click();
    await expect(page.getByText('Anfrage an Bea gesendet.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gesendet' })).toBeVisible();

    // Bea accepts on her device
    expect((await request.post(`${API}/v1/social/friends/${a.id}/accept?today=${today()}`, { headers: auth(b.token) })).ok()).toBe(true);
    await page.reload();
    const row = page.locator('.friend-row').filter({ hasText: 'Bea' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /Anstupsen/ }).click();
    await expect(page.getByText('Angestupst!')).toBeVisible();

    // the friends board in the league tab lists both
    await page.goto('/#/community/league');
    await page.getByRole('button', { name: 'Freunde', exact: true }).click();
    await expect(page.locator('.rank-row')).toHaveCount(2);
  });

  test('an incoming request can be accepted in the app', async ({ page, request }) => {
    const a = await me(request, 'Cleo');
    const b = await otherLearner(request, 'Dan');
    expect((await request.post(`${API}/v1/social/friends?today=${today()}`, { headers: auth(b.token), data: { handle: a.handle } })).ok()).toBe(true);
    await openSignedIn(page, a.token, { social: a.social, communityName: 'Cleo' });
    // the tab shows a badge for the request
    await expect(page.locator('.tabbar').getByRole('link', { name: /Community/ }).locator('.badge')).toHaveText('1');
    await page.goto('/#/community/friends');
    await page.getByRole('button', { name: 'Annehmen' }).click();
    await expect(page.getByText('Du und Dan seid jetzt befreundet.')).toBeVisible();
    await expect(page.locator('.friend-row').filter({ hasText: 'Dan' })).toBeVisible();
  });

  test('the feed shows a friend’s lesson and takes a reaction', async ({ page, request }) => {
    const a = await me(request, 'Eli');
    const b = await otherLearner(request, 'Fay');
    await request.post(`${API}/v1/social/friends?today=${today()}`, { headers: auth(a.token), data: { handle: b.handle } });
    await request.post(`${API}/v1/social/friends/${a.id}/accept?today=${today()}`, { headers: auth(b.token) });
    await pushCompletedLesson(request, b.token);
    await request.post(`${API}/v1/social/feed?today=${today()}`, { headers: auth(b.token), data: { kind: 'course', ref: 'math.placevalue' } });

    await openSignedIn(page, a.token, { social: a.social, communityName: 'Eli' });
    await page.goto('/#/community/feed');
    const card = page.locator('.feed-card').filter({ hasText: 'Fay' }).first();
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'fire' }).click();
    await expect(card.getByRole('button', { name: 'fire' })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await expect(page.locator('.feed-card').filter({ hasText: 'Fay' }).first().getByRole('button', { name: 'fire' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('another learner can be reported and blocked from their profile', async ({ page, request }) => {
    const a = await me(request, 'Gus');
    const b = await otherLearner(request, 'Hal');
    await openSignedIn(page, a.token, { social: a.social, communityName: 'Gus' });
    await page.goto(`/#/u/@${b.handle}`);
    await expect(page.getByRole('heading', { name: 'Hal' })).toBeVisible();
    await page.getByRole('button', { name: /Melden/ }).click();
    await page.getByRole('dialog').getByLabel(/Spam/).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Meldung senden' }).click();
    await expect(page.getByText('Danke für deine Meldung.', { exact: false })).toBeVisible();

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: /Blockieren/ }).click();
    await expect(page).toHaveURL(/#\/community\/friends/);
    await page.goto('/#/profile');
    await page.getByRole('button', { name: 'Blockierte Personen' }).click();
    const blocked = page.locator('.list-row').filter({ hasText: `@${b.handle}` });
    await expect(blocked).toBeVisible();
    await blocked.getByRole('button', { name: 'Freigeben' }).click();
    await expect(blocked).toHaveCount(0);
  });

  test('the profile can be edited, leagues switched off and the profile deleted', async ({ page, request }) => {
    const a = await me(request, 'Ivy');
    await openSignedIn(page, a.token, { social: a.social, communityName: 'Ivy' });
    await page.goto('/#/profile');
    await page.getByRole('link', { name: 'Profil bearbeiten' }).click();
    await page.getByLabel('Anzeigename').fill('Ivy Sun');
    await page.getByRole('radiogroup', { name: 'Farbe' }).getByRole('radio').nth(3).click();
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Gespeichert.')).toBeVisible();

    await page.goto('/#/profile');
    await expect(page.getByText('Ivy Sun')).toBeVisible();
    await page.getByRole('switch', { name: /An Ligen teilnehmen/ }).click();
    await page.goto('/#/community/league');
    await expect(page.getByText('Du nimmst nicht an Ligen teil.', { exact: false })).toBeVisible();

    await page.goto('/#/profile');
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'Community-Profil löschen' }).click();
    await page.goto('/#/community');
    // deleted on purpose: not recreated automatically, joining again is one step
    await expect(page.getByRole('button', { name: /Community beitreten/ })).toBeVisible();
  });

  test('the league lists the learner after earning XP this week', async ({ page, request }) => {
    const a = await me(request, 'Jo');
    await pushCompletedLesson(request, a.token);
    await openSignedIn(page, a.token, { social: a.social, communityName: 'Jo' });
    await page.goto('/#/community/league');
    await expect(page.locator('.rank-row.me')).toContainText('10 XP');
  });
});
