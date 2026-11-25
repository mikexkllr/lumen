import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.ts';
import { authStore } from '../src/auth.ts';
import type { Mail } from '../src/mail.ts';
import { socialStore } from '../src/social/store.ts';
import { sqliteStore } from '../src/store.ts';

const today = '2026-11-25';
const ev = (id: string) => ({ id: `evt-${id}-0000`, type: 'concept_completed', ts: Date.parse(`${today}T10:00:00Z`), day: today, conceptId: 'c', topicId: 't', problems: 3, firstTryCorrect: 3, durationMs: 60_000 });
const bearer = (t: string) => ({ authorization: `Bearer ${t}` });

function server(opts: Partial<Parameters<typeof buildServer>[0]> = {}) {
  const mails: Mail[] = [];
  const app = buildServer({
    store: sqliteStore(':memory:'), social: socialStore(':memory:'), auth: authStore(':memory:'), rateLimit: 10_000,
    email: { send: async (m) => void mails.push(m), pepper: 'test-pepper-0123456789' }, now: () => Date.parse(`${today}T12:00:00Z`), ...opts,
  });
  const signIn = async (email: string) => {
    await app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email } });
    const code = /\b(\d{6})\b/.exec(mails[mails.length - 1].text)![1];
    return (await app.inject({ method: 'POST', url: '/v1/auth/email/verify', payload: { email, code } })).json() as { token: string; created: boolean };
  };
  return { app, mails, signIn };
}

describe('accounts', () => {
  it('a second device signs in to the same account and gets its progress', async () => {
    const { app, signIn } = server();
    const first = await signIn('ada@example.org');
    expect(first.created).toBe(true);
    await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(first.token), payload: { events: [ev('a'), ev('b')], since: 0, today } });
    const second = await signIn('ADA@example.org ');
    expect(second.created).toBe(false);
    expect(second.token).not.toBe(first.token);
    const pulled = (await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(second.token), payload: { events: [], since: 0, today } })).json();
    expect(pulled.events.map((e: { id: string }) => e.id)).toEqual(['evt-a-0000', 'evt-b-0000']);
  });

  it('deleting the account signs out every device and frees the address', async () => {
    const { app, signIn } = server();
    const a = await signIn('bo@example.org');
    const b = await signIn('bo@example.org');
    await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(a.token), payload: { events: [ev('x')], since: 0, today } });
    await app.inject({ method: 'PUT', url: `/v1/social/me?today=${today}`, headers: bearer(a.token), payload: { handle: 'bo_1', name: 'Bo', avatar: 'c1-i1', leagues: true, ageConfirmed: true } });

    expect((await app.inject({ method: 'DELETE', url: '/v1/account', headers: bearer(b.token) })).json()).toEqual({ deleted: 1 });
    for (const t of [a.token, b.token]) {
      const sync = await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(t), payload: { events: [ev('late')], since: 0, today } });
      expect(sync.statusCode).toBe(401);
      expect(sync.json().error).toBe('account_deleted');
      expect((await app.inject({ url: '/v1/export', headers: bearer(t) })).statusCode).toBe(401);
      expect((await app.inject({ url: `/v1/social/me?today=${today}`, headers: bearer(t) })).statusCode).toBe(401);
    }
    // deleting twice is fine
    expect((await app.inject({ method: 'DELETE', url: '/v1/account', headers: bearer(a.token) })).statusCode).toBe(200);
    // the handle is free again and the address starts over
    expect((await app.inject({ url: `/v1/social/users/@bo_1?today=${today}`, headers: bearer((await signIn('cy@example.org')).token) })).statusCode).toBe(404);
    const again = await signIn('bo@example.org');
    expect(again.created).toBe(true);
    expect((await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(again.token), payload: { events: [], since: 0, today } })).json().events).toEqual([]);
  });

  it('a legacy sync code keeps working until its account is deleted', async () => {
    const { app } = server();
    const code = 'ABCD-EFGH-JKLM-NPQR-STUV';
    expect((await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(code), payload: { events: [ev('l')], since: 0, today } })).statusCode).toBe(200);
    await app.inject({ method: 'DELETE', url: '/v1/account', headers: bearer(code) });
    expect((await app.inject({ method: 'POST', url: '/v1/sync', headers: bearer(code), payload: { events: [], since: 0, today } })).statusCode).toBe(401);
  });

  it('sign-in limits per IP can be raised (test servers), defaults stay strict', async () => {
    const strict = server();
    for (let i = 0; i < 10; i++) await strict.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: `u${i}@example.org` } });
    expect((await strict.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: 'u11@example.org' } })).statusCode).toBe(429);
    const loose = server({ signInLimits: { mailPerHour: 100 } });
    for (let i = 0; i < 12; i++) expect((await loose.app.inject({ method: 'POST', url: '/v1/auth/email/start', payload: { email: `v${i}@example.org` } })).statusCode).toBe(200);
  });
});

describe('community counters', () => {
  it('a friend request counts once: as a request, not also as an unseen notice', async () => {
    const { app, signIn } = server();
    const a = (await signIn('a@example.org')).token;
    const b = (await signIn('b@example.org')).token;
    const profile = (t: string, handle: string) => app.inject({ method: 'PUT', url: `/v1/social/me?today=${today}`, headers: bearer(t), payload: { handle, name: handle, avatar: 'c0-i0', leagues: true, ageConfirmed: true } });
    await profile(a, 'anna_1');
    await profile(b, 'ben_1');
    await app.inject({ method: 'POST', url: `/v1/social/friends?today=${today}`, headers: bearer(b), payload: { handle: 'anna_1' } });
    const me = (await app.inject({ url: `/v1/social/me?today=${today}`, headers: bearer(a) })).json();
    expect(me.requests).toBe(1);
    expect(me.unseen).toBe(0);
    // the request still shows up among the notices of the feed
    const feed = (await app.inject({ url: `/v1/social/feed?today=${today}`, headers: bearer(a) })).json();
    expect(feed.notices.map((n: { kind: string }) => n.kind)).toContain('friend_request');
  });

  it('the community needs a confirmed age of 16', async () => {
    const { app, signIn } = server();
    const t = (await signIn('kid@example.org')).token;
    const r = await app.inject({ method: 'PUT', url: `/v1/social/me?today=${today}`, headers: bearer(t), payload: { handle: 'kid_1', name: 'Kid', avatar: 'c0-i0', leagues: true } });
    expect(r.statusCode).toBe(400);
    expect(r.json().error).toBe('age_not_confirmed');
  });
});
