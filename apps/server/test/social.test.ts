import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.ts';
import { sqliteStore } from '../src/store.ts';
import { socialStore } from '../src/social/store.ts';
import { clientToday, friendStreak, nextTier, rankStandings, zoneOf, zones } from '../src/social/logic.ts';
import { checkHandle, checkName, isOffensive } from '../src/social/moderation.ts';

const TODAY = '2026-11-18'; // Wednesday
let clock = Date.parse(`${TODAY}T12:00:00Z`);
const ADMIN = 'admin-secret-0123456789';

function setup() {
  clock = Date.parse(`${TODAY}T12:00:00Z`);
  const social = socialStore(':memory:');
  const app = buildServer({ store: sqliteStore(':memory:'), rateLimit: 10_000, social, adminToken: ADMIN, now: () => clock });
  return { app, social };
}

const code = (c: string) => `${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}-${c.repeat(4)}`;
const auth = (c: string) => ({ authorization: `Bearer ${code(c)}` });

let n = 0;
/** Three solved problems: an active day worth 3 XP per difficulty point. */
function dayEvents(day: string, difficulty = 1) {
  return [0, 1, 2].map((i) => ({ id: `evt-${day}-${i}-${n++}`, type: 'attempt', ts: Date.parse(`${day}T10:00:0${i}Z`), day, stepId: `s${i}`, context: 'lesson', problem: true, seed: 1, correct: true, final: true, attemptNo: 1, hintsUsed: 0, durationMs: 1000, difficulty }));
}

async function join(app: ReturnType<typeof setup>['app'], c: string, handle: string, name = handle) {
  const res = await app.inject({ method: 'PUT', url: `/v1/social/me?today=${TODAY}`, headers: auth(c), payload: { handle, name, avatar: 'c1-i2', ageConfirmed: true } });
  expect(res.statusCode).toBe(200);
  return res.json().profile as { id: string; handle: string };
}

async function sync(app: ReturnType<typeof setup>['app'], c: string, days: string[], difficulty = 1, today = TODAY) {
  const res = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth(c), payload: { events: days.flatMap((d) => dayEvents(d, difficulty)), since: 0, today } });
  expect(res.statusCode).toBe(200);
}

async function befriend(app: ReturnType<typeof setup>['app'], a: string, b: string, bHandle: string, bId: string) {
  expect((await app.inject({ method: 'POST', url: `/v1/social/friends?today=${TODAY}`, headers: auth(a), payload: { handle: bHandle } })).json().status).toBe('requested');
  const aId = (await app.inject({ method: 'GET', url: '/v1/social/me', headers: auth(a) })).json().profile.id;
  expect((await app.inject({ method: 'POST', url: `/v1/social/friends/${aId}/accept?today=${TODAY}`, headers: auth(b) })).json().status).toBe('friends');
  return { aId, bId };
}

describe('social logic', () => {
  it('counts a friend streak only on days both kept their streak, never before the friendship', () => {
    const a = new Set(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17']);
    const b = new Set(['2026-11-15', '2026-11-16', '2026-11-17', TODAY]);
    expect(friendStreak(a, b, '2026-11-01', TODAY)).toEqual({ current: 3, todayDone: false, meToday: false, friendToday: true });
    expect(friendStreak(a, b, '2026-11-16', TODAY).current).toBe(2);
    a.add(TODAY);
    expect(friendStreak(a, b, '2026-11-01', TODAY)).toMatchObject({ current: 4, todayDone: true });
    expect(friendStreak(new Set(['2026-11-16']), b, '2026-11-01', TODAY).current).toBe(0);
  });

  it('promotes and demotes by cohort size and tier', () => {
    expect(zones(30, 3)).toEqual({ promote: 7, demote: 5 });
    expect(zones(30, 0).demote).toBe(0);
    expect(zones(30, 9).promote).toBe(0);
    expect(zones(3, 2)).toEqual({ promote: 1, demote: 0 });
    expect(zoneOf(1, 30, 3)).toBe('promote');
    expect(zoneOf(26, 30, 3)).toBe('demote');
    expect(zoneOf(10, 30, 3)).toBe('stay');
    expect(nextTier(null, '2026-11-16')).toEqual({ tier: 0, outcome: null });
    expect(nextTier({ week: '2026-11-09', tier: 2, rank: 1, size: 30 }, '2026-11-16')).toEqual({ tier: 3, outcome: 'promoted' });
    // two missed weeks after staying: one tier down per extra missed week
    expect(nextTier({ week: '2026-10-26', tier: 2, rank: 10, size: 30 }, '2026-11-16').tier).toBe(0);
    expect(rankStandings([{ account: 'a', xp: 5, joinedAt: 2 }, { account: 'b', xp: 9, joinedAt: 3 }, { account: 'c', xp: 5, joinedAt: 1 }]).map((s) => s.account)).toEqual(['b', 'c', 'a']);
  });

  it('accepts the client day only within a day of the server', () => {
    const now = Date.parse('2026-11-18T23:30:00Z');
    expect(clientToday('2026-11-19', now)).toBe('2026-11-19');
    expect(clientToday('2026-11-25', now)).toBe('2026-11-18');
    expect(clientToday('nope', now)).toBe('2026-11-18');
  });

  it('filters names and handles', () => {
    expect(checkHandle('anna_92')).toBeNull();
    expect(checkHandle('An')).toBe('invalid_handle');
    expect(checkHandle('admin')).toBe('reserved_handle');
    expect(checkHandle('mathe_fan_42')).toBeNull();
    expect(checkHandle('kkk_fan')).toBe('offensive_handle');
    expect(checkHandle('fuuuck')).toBe('offensive_handle');
    expect(checkName('Jörg Müller')).toBeNull();
    expect(checkName('Zoë-Anne O\'Neil')).toBeNull();
    expect(checkName('visit www.spam.example')).toBe('invalid_name');
    expect(checkName('H1tl3r')).toBe('offensive_name');
    // no false positives on ordinary words
    for (const ok of ['Scunthorpe', 'Classic', 'Torpedo', 'Spicy Grape', 'Nazir', 'Assistant']) expect(isOffensive(ok)).toBe(false);
  });
});

describe('social API', () => {
  it('creates a profile only with age confirmation and a free handle', async () => {
    const { app } = setup();
    const noAge = await app.inject({ method: 'PUT', url: '/v1/social/me', headers: auth('A'), payload: { handle: 'anna', name: 'Anna', avatar: 'c1-i2' } });
    expect(noAge.json().error).toBe('age_not_confirmed');
    await join(app, 'A', 'anna');
    const taken = await app.inject({ method: 'PUT', url: '/v1/social/me', headers: auth('B'), payload: { handle: 'ANNA', name: 'Other', avatar: 'c1-i2', ageConfirmed: true } });
    expect(taken.statusCode).toBe(409);
    const bad = await app.inject({ method: 'PUT', url: '/v1/social/me', headers: auth('B'), payload: { handle: 'bob', name: 'Bob', avatar: '<script>', ageConfirmed: true } });
    expect(bad.json().error).toBe('invalid_avatar');
    const none = await app.inject({ method: 'GET', url: '/v1/social/me', headers: auth('B') });
    expect(none.statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/features' })).json().social).toBe(true);
  });

  it('derives streak and weekly XP from synced events', async () => {
    const { app } = setup();
    await join(app, 'A', 'anna');
    await sync(app, 'A', ['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', TODAY]);
    const me = (await app.inject({ method: 'GET', url: `/v1/social/me?today=${TODAY}`, headers: auth('A') })).json();
    expect(me.profile).toMatchObject({ streak: 5, todayDone: true, xpWeek: 9, xpTotal: 15 });
    expect(me.league).toMatchObject({ week: '2026-11-16', tier: 'spark' });
  });

  it('runs the friend flow: request, accept, friend streak, nudge, unfriend', async () => {
    const { app } = setup();
    await join(app, 'A', 'anna');
    const bob = await join(app, 'B', 'bob');
    const { aId } = await befriend(app, 'A', 'B', 'bob', bob.id);
    // friendship started today; both practise today and tomorrow
    await sync(app, 'A', [TODAY]);
    await sync(app, 'B', [TODAY]);
    let list = (await app.inject({ method: 'GET', url: `/v1/social/friends?today=${TODAY}`, headers: auth('A') })).json();
    expect(list.friends).toHaveLength(1);
    expect(list.friends[0]).toMatchObject({ handle: 'bob', friendStreak: { current: 1, todayDone: true } });
    clock += 86_400_000;
    await sync(app, 'A', ['2026-11-19'], 1, '2026-11-19');
    list = (await app.inject({ method: 'GET', url: '/v1/social/friends?today=2026-11-19', headers: auth('A') })).json();
    expect(list.friends[0].friendStreak).toEqual({ current: 1, todayDone: false, meToday: true, friendToday: false });
    // nudge once per day
    expect((await app.inject({ method: 'POST', url: `/v1/social/friends/${bob.id}/nudge?today=2026-11-19`, headers: auth('A') })).json().sent).toBe(true);
    expect((await app.inject({ method: 'POST', url: `/v1/social/friends/${bob.id}/nudge?today=2026-11-19`, headers: auth('A') })).json().sent).toBe(false);
    const feedB = (await app.inject({ method: 'GET', url: '/v1/social/feed', headers: auth('B') })).json();
    expect(feedB.notices.map((x: { kind: string }) => x.kind)).toContain('nudge');
    expect((await app.inject({ method: 'GET', url: '/v1/social/me', headers: auth('B') })).json().unseen).toBeGreaterThan(0);
    await app.inject({ method: 'POST', url: '/v1/social/notices/seen', headers: auth('B') });
    expect((await app.inject({ method: 'GET', url: '/v1/social/me', headers: auth('B') })).json().unseen).toBe(0);
    // unfriend
    await app.inject({ method: 'DELETE', url: `/v1/social/friends/${aId}`, headers: auth('B') });
    expect((await app.inject({ method: 'GET', url: '/v1/social/friends', headers: auth('A') })).json().friends).toHaveLength(0);
  });

  it('accepts mutual requests directly and hides blocked users everywhere', async () => {
    const { app } = setup();
    const anna = await join(app, 'A', 'anna');
    const bob = await join(app, 'B', 'bob');
    await app.inject({ method: 'POST', url: '/v1/social/friends', headers: auth('A'), payload: { handle: '@bob' } });
    expect((await app.inject({ method: 'POST', url: '/v1/social/friends', headers: auth('B'), payload: { userId: anna.id } })).json().status).toBe('friends');
    expect((await app.inject({ method: 'POST', url: '/v1/social/blocks', headers: auth('A'), payload: { userId: bob.id } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/social/friends', headers: auth('B') })).json().friends).toHaveLength(0);
    expect((await app.inject({ method: 'POST', url: '/v1/social/friends', headers: auth('B'), payload: { handle: 'anna' } })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/v1/social/users/${anna.id}`, headers: auth('B') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/social/blocks', headers: auth('A') })).json().blocked[0].handle).toBe('bob');
  });

  it('builds a weekly league with ranks and zones', async () => {
    const { app } = setup();
    const users = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (const [i, u] of users.entries()) {
      await join(app, u, `user_${u.toLowerCase()}`);
      await sync(app, u, [TODAY], (i % 3) + 1);
    }
    const lg = (await app.inject({ method: 'GET', url: `/v1/social/league?today=${TODAY}`, headers: auth('A') })).json();
    expect(lg).toMatchObject({ joined: true, tier: 'spark', week: '2026-11-16', promote: 1, demote: 0 });
    expect(lg.standings).toHaveLength(6);
    expect(lg.standings[0].xp).toBe(9);
    expect(lg.standings[0].zone).toBe('promote');
    expect(lg.standings.filter((s: { me: boolean }) => s.me)).toHaveLength(1);
    // without XP this week: not in a league yet
    await join(app, 'G', 'user_g');
    expect((await app.inject({ method: 'GET', url: `/v1/social/league?today=${TODAY}`, headers: auth('G') })).json()).toMatchObject({ joined: false, tier: 'spark' });
  });

  it('promotes the winner into the next tier the following week', async () => {
    const { app } = setup();
    await join(app, 'A', 'anna');
    await join(app, 'B', 'bob');
    await sync(app, 'A', [TODAY], 3);
    await sync(app, 'B', [TODAY], 1);
    await app.inject({ method: 'GET', url: `/v1/social/league?today=${TODAY}`, headers: auth('B') });
    clock += 7 * 86_400_000;
    await sync(app, 'A', ['2026-11-25'], 1, '2026-11-25');
    const lg = (await app.inject({ method: 'GET', url: '/v1/social/league?today=2026-11-25', headers: auth('A') })).json();
    expect(lg).toMatchObject({ joined: true, tier: 'ember', outcome: 'promoted', week: '2026-11-23' });
    const feed = (await app.inject({ method: 'GET', url: '/v1/social/feed', headers: auth('A') })).json();
    expect(feed.items.map((i: { kind: string }) => i.kind)).toEqual(expect.arrayContaining(['league', 'joined']));
  });

  it('posts milestones to the feed of friends, with reactions from a fixed set', async () => {
    const { app } = setup();
    await join(app, 'A', 'anna');
    const bob = await join(app, 'B', 'bob');
    await befriend(app, 'A', 'B', 'bob', bob.id);
    const week = ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', TODAY];
    await sync(app, 'B', week);
    expect((await app.inject({ method: 'POST', url: '/v1/social/feed', headers: auth('B'), payload: { kind: 'course', ref: 'math.fractions' } })).json().posted).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/v1/social/feed', headers: auth('B'), payload: { kind: 'course', ref: 'math.fractions' } })).json().posted).toBe(false);
    expect((await app.inject({ method: 'POST', url: '/v1/social/feed', headers: auth('B'), payload: { kind: 'text', ref: 'hello' } })).statusCode).toBe(400);
    const feed = (await app.inject({ method: 'GET', url: '/v1/social/feed', headers: auth('A') })).json();
    const streak = feed.items.find((i: { kind: string }) => i.kind === 'streak');
    expect(streak).toMatchObject({ data: { n: 7 }, user: { handle: 'bob' }, mine: false });
    expect((await app.inject({ method: 'PUT', url: `/v1/social/feed/${streak.id}/reaction`, headers: auth('A'), payload: { reaction: 'lol' } })).statusCode).toBe(400);
    await app.inject({ method: 'PUT', url: `/v1/social/feed/${streak.id}/reaction`, headers: auth('A'), payload: { reaction: 'clap' } });
    const again = (await app.inject({ method: 'GET', url: '/v1/social/feed', headers: auth('B') })).json();
    const mine = again.items.find((i: { id: number }) => i.id === streak.id);
    expect(mine).toMatchObject({ mine: true, reactions: { clap: 1 } });
    expect(mine.reactedBy[0].handle).toBe('anna');
    expect(again.notices.some((x: { kind: string }) => x.kind === 'reaction')).toBe(true);
    // strangers cannot react
    await join(app, 'C', 'carl');
    expect((await app.inject({ method: 'PUT', url: `/v1/social/feed/${streak.id}/reaction`, headers: auth('C'), payload: { reaction: 'clap' } })).statusCode).toBe(404);
    // syncing again does not repeat the milestone
    await sync(app, 'B', [TODAY]);
    const count = (await app.inject({ method: 'GET', url: '/v1/social/feed', headers: auth('B') })).json().items.filter((i: { kind: string }) => i.kind === 'streak').length;
    expect(count).toBe(1);
  });

  it('lets users report, and admins review and ban', async () => {
    const { app } = setup();
    await join(app, 'A', 'anna');
    const bob = await join(app, 'B', 'bob');
    expect((await app.inject({ method: 'POST', url: '/v1/social/reports', headers: auth('A'), payload: { userId: bob.id, reason: 'name' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/admin/reports' })).statusCode).toBe(401);
    const reports = (await app.inject({ method: 'GET', url: '/v1/admin/reports', headers: { authorization: `Bearer ${ADMIN}` } })).json().reports;
    expect(reports[0]).toMatchObject({ reason: 'name', target: { handle: 'bob', banned: false } });
    await app.inject({ method: 'POST', url: `/v1/admin/users/${bob.id}/reset-name`, headers: { authorization: `Bearer ${ADMIN}` } });
    await app.inject({ method: 'POST', url: `/v1/admin/users/${bob.id}/ban`, headers: { authorization: `Bearer ${ADMIN}` }, payload: { banned: true } });
    await app.inject({ method: 'POST', url: `/v1/admin/reports/${reports[0].id}/resolve`, headers: { authorization: `Bearer ${ADMIN}` } });
    expect((await app.inject({ method: 'GET', url: '/v1/admin/reports', headers: { authorization: `Bearer ${ADMIN}` } })).json().reports).toHaveLength(0);
    expect((await app.inject({ method: 'GET', url: '/v1/social/me', headers: auth('B') })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/social/friends', headers: auth('A'), payload: { userId: bob.id } })).statusCode).toBe(404);
  });

  it('deletes social data with the account, or on its own', async () => {
    const { app, social } = setup();
    await join(app, 'A', 'anna');
    await sync(app, 'A', [TODAY]);
    expect((await app.inject({ method: 'DELETE', url: '/v1/social/me', headers: auth('A') })).json().deleted).toBeGreaterThan(0);
    expect((await app.inject({ method: 'GET', url: '/v1/social/me', headers: auth('A') })).statusCode).toBe(404);
    // learning events are still there
    expect((await app.inject({ method: 'GET', url: '/v1/export', headers: auth('A') })).json().events).toHaveLength(3);
    await join(app, 'A', 'anna');
    await app.inject({ method: 'DELETE', url: '/v1/account', headers: auth('A') });
    expect(social.profileByHandle('anna')).toBeNull();
  });

  it('is off when no social store is configured', async () => {
    const app = buildServer({ store: sqliteStore(':memory:') });
    expect((await app.inject({ method: 'GET', url: '/v1/social/me', headers: auth('A') })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/v1/features' })).json().social).toBe(false);
  });
});
