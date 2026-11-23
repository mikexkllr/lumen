/**
 * Social API (AGPL-3.0-or-later): opt-in profiles, friends with friend
 * streaks, weekly leagues, a feed of milestones with reactions, nudges, and
 * moderation (report, block, admin bans). Only display names and handles are
 * user-generated text; reactions come from a fixed set.
 *
 * Stats are derived from the learning events the account already syncs, so
 * nothing extra is collected: on every sync the server recomputes per-day XP
 * and streak days for accounts that have a social profile.
 */
import { addDays, deriveProgress, isActiveDay, levelInfo, weekKey, type LumenEvent } from '@lumen/engine';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { EventStore } from '../store.ts';
import { adminOk } from '../admin.ts';
import {
  clientToday, COHORT_SIZE, coveredDays, FRIEND_STREAK_MILESTONES, friendStreak, LEVEL_MILESTONE_EVERY, milestoneReached, nextTier, rankStandings,
  STREAK_MILESTONES, TIERS, userStreak, weekXp, zoneOf, zones, type DayRow,
} from './logic.ts';
import { AVATAR_RE, checkHandle, checkName, cleanName, REACTIONS, REPORT_REASONS } from './moderation.ts';
import { publicUser, type Membership, type Profile, type PublicUser, type SocialStore } from './store.ts';

const MAX_FRIENDS = 500;
const MAX_REQUESTS_PER_DAY = 50;
const MAX_REPORTS_PER_DAY = 20;
const FEED_PAGE = 30;
const DAY_MS = 86_400_000;
const REF_RE = /^[a-z0-9_]{3,24}$/i;
const CLIENT_POST_KINDS = new Set(['course', 'badge']);
const CLIENT_REF_RE = /^[A-Za-z0-9._-]{1,80}$/;

export interface SocialDeps {
  events: EventStore;
  social: SocialStore;
  /** Resolves the account key from the request's sync code, or null. */
  account(req: FastifyRequest): string | null;
  adminToken?: string | null;
  now?: () => number;
}

export function socialService(deps: SocialDeps) {
  const { events, social } = deps;
  const now = deps.now ?? Date.now;

  function summary(p: Profile, today: string, rows: DayRow[] = social.days(p.account)) {
    const streak = userStreak(rows, today, p.lastToday);
    return {
      ...publicUser(p),
      streak: streak.current,
      longestStreak: streak.longest,
      todayDone: streak.todayDone,
      xpWeek: weekXp(rows, weekKey(today)),
      xpTotal: p.xpTotal,
      level: levelInfo(p.xpTotal).level,
      tier: TIERS[p.tier] ?? TIERS[0],
      since: new Date(p.createdAt).toISOString().slice(0, 10),
    };
  }

  /** Final standings of a league cohort for its week. */
  function standings(cohort: Membership[]) {
    return rankStandings(cohort.map((m) => ({ ...m, xp: weekXp(social.days(m.account), m.week) })));
  }

  /** Puts an account into this week's league once it earns XP; settles last week's result first. */
  function ensureLeague(p: Profile, today: string): Membership | null {
    if (!p.leagues || p.banned) return null;
    const week = weekKey(today);
    const existing = social.membership(week, p.account);
    if (existing) return existing;
    if (weekXp(social.days(p.account), week) <= 0) return null;
    const { tier, outcome } = pendingTier(p, week);
    social.setTier(p.account, tier);
    const m = social.join(week, p.account, tier, outcome, COHORT_SIZE, now());
    if (outcome === 'promoted') social.post(p.account, 'league', { tier: TIERS[tier] }, today, `league:${week}`, now());
    return m;
  }

  function pendingTier(p: Profile, week: string) {
    const last = social.lastMembership(p.account, week);
    if (!last) return { tier: p.tier, outcome: null };
    const ranked = standings(social.cohort(last.cohort));
    const mine = ranked.find((s) => s.account === p.account);
    return nextTier(mine ? { week: last.week, tier: last.tier, rank: mine.rank, size: ranked.length } : null, week);
  }

  /** Recomputes stats from the synced events and posts milestones. */
  function refresh(account: string, today: string): void {
    const p0 = social.profile(account);
    if (!p0) return;
    const evts = events.since(account, 0, Number.MAX_SAFE_INTEGER).events as LumenEvent[];
    const progress = deriveProgress(evts, today);
    const rows: DayRow[] = Object.entries(progress.days).map(([day, d]) => ({ day, xp: d.xp, active: isActiveDay(d) }));
    social.setStats(account, progress.xpTotal, today, rows);
    const p = social.profile(account)!;
    if (p.banned) return;
    const t = now();

    const streak = progress.streak.current;
    const m = milestoneReached(streak, STREAK_MILESTONES);
    if (m && !social.recentPosts(account, 'streak', addDays(today, -m)).some((x) => x.data.n === m)) social.post(account, 'streak', { n: m }, today, null, t);

    const level = levelInfo(progress.xpTotal).level;
    const lv = Math.floor(level / LEVEL_MILESTONE_EVERY) * LEVEL_MILESTONE_EVERY;
    if (lv >= LEVEL_MILESTONE_EVERY) social.post(account, 'level', { n: lv }, today, `level:${lv}`, t);

    ensureLeague(p, today);

    const mine = coveredDays(rows, userStreak(rows, today, p.lastToday));
    for (const f of social.friends(account)) {
      const fp = social.profile(f.account);
      if (!fp || fp.banned) continue;
      const frows = social.days(f.account);
      const fs = friendStreak(mine, coveredDays(frows, userStreak(frows, today, fp.lastToday)), f.since, today);
      const fm = milestoneReached(fs.current, FRIEND_STREAK_MILESTONES);
      if (!fm || fs.current !== fm) continue;
      const after = addDays(today, -fm);
      const posted = [...social.recentPosts(account, 'friend_streak', after).filter((x) => x.data.with === fp.userId), ...social.recentPosts(f.account, 'friend_streak', after).filter((x) => x.data.with === p.userId)];
      if (!posted.some((x) => x.data.n === fm)) social.post(account, 'friend_streak', { n: fm, with: fp.userId }, today, null, t);
    }
  }

  return { summary, standings, ensureLeague, pendingTier, refresh };
}

export type SocialService = ReturnType<typeof socialService>;


export function registerSocialRoutes(app: FastifyInstance, deps: SocialDeps, service: SocialService): void {
  const { social } = deps;
  const now = deps.now ?? Date.now;

  const fail = (reply: FastifyReply, code: number, error: string) => reply.code(code).send({ error });
  const today = (req: FastifyRequest) => clientToday((req.query as Record<string, unknown> | undefined)?.today ?? (req.body as Record<string, unknown> | undefined)?.today, now());

  /** The caller's profile, or an error reply. */
  function me(req: FastifyRequest, reply: FastifyReply): Profile | null {
    const account = deps.account(req);
    const p = account ? social.profile(account) : null;
    if (!account) void fail(reply, 401, 'missing_or_invalid_sync_code');
    else if (!p) void fail(reply, 404, 'no_profile');
    else if (p.banned) void fail(reply, 403, 'banned');
    return p && !p.banned ? p : null;
  }

  /** Another user the caller may interact with (not banned, not blocked either way). `@handle` or a user id. */
  function other(p: Profile, ref: string): Profile | null {
    const handle = ref.startsWith('@');
    const key = handle ? ref.slice(1).toLowerCase() : ref;
    if (!REF_RE.test(key)) return null;
    const o = handle ? social.profileByHandle(key) : social.profileByUserId(key);
    if (!o || o.banned || o.account === p.account || social.isBlocked(p.account, o.account)) return null;
    return o;
  }

  const relation = (p: Profile, o: Profile) =>
    social.friendSince(p.account, o.account) ? 'friend' : social.hasRequest(p.account, o.account) ? 'requested' : social.hasRequest(o.account, p.account) ? 'incoming' : 'none';

  // ------------------------------------------------------------ profile

  app.get('/v1/social/me', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const day = today(req);
    const membership = service.ensureLeague(p, day);
    return {
      profile: { ...service.summary(social.profile(p.account)!, day), leagues: p.leagues },
      league: membership ? { week: membership.week, tier: TIERS[membership.tier] } : null,
      requests: social.incoming(p.account).length,
      unseen: social.unseenNotices(p.account),
    };
  });

  app.put('/v1/social/me', async (req, reply) => {
    const account = deps.account(req);
    if (!account) return fail(reply, 401, 'missing_or_invalid_sync_code');
    const b = (req.body ?? {}) as Record<string, unknown>;
    const handle = typeof b.handle === 'string' ? b.handle.trim().replace(/^@/, '').toLowerCase() : '';
    const name = typeof b.name === 'string' ? cleanName(b.name) : '';
    const avatar = typeof b.avatar === 'string' ? b.avatar : '';
    const leagues = b.leagues !== false;
    const herr = checkHandle(handle);
    if (herr) return fail(reply, 400, herr);
    const nerr = checkName(name);
    if (nerr) return fail(reply, 400, nerr);
    if (!AVATAR_RE.test(avatar)) return fail(reply, 400, 'invalid_avatar');
    const existing = social.profile(account);
    if (existing?.banned) return fail(reply, 403, 'banned');
    const taken = social.profileByHandle(handle);
    if (taken && taken.account !== account) return fail(reply, 409, 'handle_taken');
    if (!existing) {
      // Social features are for learners aged 16 or older (GDPR Art. 8); the app asks before this call.
      if (b.ageConfirmed !== true) return fail(reply, 400, 'age_not_confirmed');
      social.createProfile(account, { handle, name, avatar, leagues }, now());
      social.post(account, 'joined', {}, today(req), 'joined', now());
    } else social.updateProfile(account, { handle, name, avatar, leagues });
    service.refresh(account, today(req));
    return { profile: service.summary(social.profile(account)!, today(req)) };
  });

  app.delete('/v1/social/me', async (req, reply) => {
    const account = deps.account(req);
    if (!account) return fail(reply, 401, 'missing_or_invalid_sync_code');
    return { deleted: social.deleteAccount(account) };
  });

  // ------------------------------------------------------------ users

  app.get('/v1/social/users/:ref', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const { ref } = req.params as { ref: string };
    const day = today(req);
    if (ref === p.userId || ref.toLowerCase() === `@${p.handle}`) return { user: service.summary(p, day), relation: 'self' };
    const o = other(p, ref);
    if (!o) return fail(reply, 404, 'not_found');
    const rel = relation(p, o);
    const week = weekKey(day);
    const mm = social.membership(week, p.account);
    const om = social.membership(week, o.account);
    const visible = rel === 'friend' || (mm && om && mm.cohort === om.cohort);
    const base = publicUser(o);
    if (!visible) return { user: base, relation: rel };
    const user = service.summary(o, day);
    let fs = null;
    if (rel === 'friend') {
      const mine = social.days(p.account);
      const theirs = social.days(o.account);
      fs = friendStreak(coveredDays(mine, userStreak(mine, day, p.lastToday)), coveredDays(theirs, userStreak(theirs, day, o.lastToday)), social.friendSince(p.account, o.account)!, day);
    }
    return { user, relation: rel, friendStreak: fs };
  });

  // ------------------------------------------------------------ friends

  app.get('/v1/social/friends', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const day = today(req);
    const myRows = social.days(p.account);
    const mine = coveredDays(myRows, userStreak(myRows, day, p.lastToday));
    const friends = social.friends(p.account).flatMap((f) => {
      const o = social.profile(f.account);
      if (!o || o.banned) return [];
      const rows = social.days(o.account);
      const theirs = coveredDays(rows, userStreak(rows, day, o.lastToday));
      return [{ ...service.summary(o, day, rows), friendSince: f.since, friendStreak: friendStreak(mine, theirs, f.since, day) }];
    });
    const users = (list: { account: string; createdAt: number }[]) =>
      list.flatMap((r) => {
        const o = social.profile(r.account);
        return o && !o.banned ? [{ ...publicUser(o), at: r.createdAt }] : [];
      });
    return { me: service.summary(p, day, myRows), friends, incoming: users(social.incoming(p.account)), outgoing: users(social.outgoing(p.account)) };
  });

  app.post('/v1/social/friends', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const ref = typeof b.userId === 'string' ? b.userId : typeof b.handle === 'string' ? `@${b.handle.trim().replace(/^@/, '')}` : '';
    const o = other(p, ref);
    if (!o) return fail(reply, 404, 'not_found');
    const day = today(req);
    if (social.friendSince(p.account, o.account)) return { status: 'friends', user: publicUser(o) };
    if (social.hasRequest(o.account, p.account)) {
      social.befriend(p.account, o.account, day, now());
      social.notify(o.account, p.account, 'friend_accepted', {}, day, `fa:${p.account}`, now());
      return { status: 'friends', user: publicUser(o) };
    }
    if (social.friends(p.account).length >= MAX_FRIENDS) return fail(reply, 409, 'too_many_friends');
    if (social.requestsSince(p.account, now() - DAY_MS) >= MAX_REQUESTS_PER_DAY) return fail(reply, 429, 'too_many_requests');
    social.addRequest(p.account, o.account, now());
    social.notify(o.account, p.account, 'friend_request', {}, day, `fr:${p.account}:${day}`, now());
    return { status: 'requested', user: publicUser(o) };
  });

  app.post('/v1/social/friends/:ref/accept', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const o = other(p, (req.params as { ref: string }).ref);
    if (!o || !social.hasRequest(o.account, p.account)) return fail(reply, 404, 'not_found');
    const day = today(req);
    social.befriend(p.account, o.account, day, now());
    social.notify(o.account, p.account, 'friend_accepted', {}, day, `fa:${p.account}`, now());
    return { status: 'friends', user: publicUser(o) };
  });

  app.delete('/v1/social/friends/:ref', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const ref = (req.params as { ref: string }).ref;
    const o = social.profileByUserId(ref);
    if (!o) return fail(reply, 404, 'not_found');
    social.unfriend(p.account, o.account);
    return { status: 'none' };
  });

  app.post('/v1/social/friends/:ref/nudge', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const o = other(p, (req.params as { ref: string }).ref);
    if (!o || !social.friendSince(p.account, o.account)) return fail(reply, 404, 'not_found');
    const day = today(req);
    const sent = social.notify(o.account, p.account, 'nudge', {}, day, `nudge:${p.account}:${day}`, now());
    return { sent };
  });

  // ------------------------------------------------------------ league

  app.get('/v1/social/league', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const day = today(req);
    const week = weekKey(day);
    if (!p.leagues) return { week, joined: false, optedOut: true, tier: TIERS[p.tier] };
    const m = service.ensureLeague(p, day);
    if (!m) {
      const { tier } = service.pendingTier(p, week);
      return { week, joined: false, tier: TIERS[tier] };
    }
    const hidden = social.hidden(p.account);
    const ranked = service.standings(social.cohort(m.cohort));
    const z = zones(ranked.length, m.tier);
    const list = ranked.flatMap((s) => {
      const o = social.profile(s.account);
      if (!o || (o.banned && o.account !== p.account)) return [];
      const user = hidden.has(s.account) ? { id: o.userId, handle: '', name: '–', avatar: 'c0-i0' } : publicUser(o);
      return [{ rank: s.rank, xp: s.xp, zone: zoneOf(s.rank, ranked.length, m.tier), me: s.account === p.account, user, hidden: hidden.has(s.account) }];
    });
    return { week, joined: true, tier: TIERS[m.tier], tierIndex: m.tier, tiers: TIERS, outcome: m.outcome, promote: z.promote, demote: z.demote, standings: list };
  });

  // ------------------------------------------------------------ feed

  app.get('/v1/social/feed', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const qs = (req.query ?? {}) as Record<string, unknown>;
    const before = Number(qs.before) > 0 ? Math.floor(Number(qs.before)) : null;
    const hidden = social.hidden(p.account);
    const authors = [p.account, ...social.friends(p.account).map((f) => f.account)].filter((a) => !hidden.has(a));
    const cache = new Map<string, Profile | null>();
    const prof = (account: string) => {
      if (!cache.has(account)) cache.set(account, social.profile(account));
      return cache.get(account)!;
    };
    const rows = social.feed(authors, before, FEED_PAGE);
    const items = rows.flatMap((r) => {
      const author = prof(r.account);
      if (!author || author.banned) return [];
      let withUser: PublicUser | null = null;
      if (typeof r.data.with === 'string') {
        const w = social.profileByUserId(r.data.with);
        if (!w || w.banned || hidden.has(w.account)) return [];
        withUser = publicUser(w);
      }
      const counts: Record<string, number> = {};
      let mine: string | null = null;
      const by: PublicUser[] = [];
      for (const x of social.reactions(r.id)) {
        if (hidden.has(x.account)) continue;
        counts[x.reaction] = (counts[x.reaction] ?? 0) + 1;
        if (x.account === p.account) mine = x.reaction;
        else if (by.length < 5) {
          const rp = prof(x.account);
          if (rp && !rp.banned) by.push(publicUser(rp));
        }
      }
      return [{ id: r.id, kind: r.kind, data: { ...r.data, with: withUser ?? undefined }, day: r.day, createdAt: r.createdAt, user: publicUser(author), mine: r.account === p.account, reactions: counts, myReaction: mine, reactedBy: by }];
    });
    const notices = social.notices(p.account).flatMap((n) => {
      const from = prof(n.from);
      if (!from || from.banned || hidden.has(n.from)) return [];
      return [{ id: n.id, kind: n.kind, data: n.data, day: n.day, createdAt: n.createdAt, seen: n.seen, from: publicUser(from) }];
    });
    return { items, notices, next: rows.length === FEED_PAGE ? rows[rows.length - 1].id : null };
  });

  app.post('/v1/social/notices/seen', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    social.markNoticesSeen(p.account);
    return { ok: true };
  });

  /** Milestones only the client can see (it has the course catalogue), as fixed kinds with an id – no free text. */
  app.post('/v1/social/feed', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const b = (req.body ?? {}) as Record<string, unknown>;
    if (typeof b.kind !== 'string' || !CLIENT_POST_KINDS.has(b.kind) || typeof b.ref !== 'string' || !CLIENT_REF_RE.test(b.ref)) return fail(reply, 400, 'invalid_post');
    const posted = social.post(p.account, b.kind, { ref: b.ref }, today(req), `${b.kind}:${b.ref}`, now());
    return { posted };
  });

  app.put('/v1/social/feed/:id/reaction', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const id = Number((req.params as { id: string }).id);
    const reaction = ((req.body ?? {}) as Record<string, unknown>).reaction;
    if (typeof reaction !== 'string' || !(REACTIONS as readonly string[]).includes(reaction)) return fail(reply, 400, 'invalid_reaction');
    const item = Number.isInteger(id) ? social.feedItem(id) : null;
    const visible = item && (item.account === p.account || social.friendSince(p.account, item.account)) && !social.isBlocked(p.account, item.account);
    if (!item || !visible) return fail(reply, 404, 'not_found');
    social.react(id, p.account, reaction, now());
    if (item.account !== p.account) social.notify(item.account, p.account, 'reaction', { item: id, kind: item.kind, reaction }, today(req), `r:${id}:${p.account}`, now());
    return { ok: true };
  });

  app.delete('/v1/social/feed/:id/reaction', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    social.unreact(Number((req.params as { id: string }).id), p.account);
    return { ok: true };
  });

  // ------------------------------------------------------------ safety

  app.get('/v1/social/blocks', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    return { blocked: social.blocks(p.account).flatMap((a) => {
      const o = social.profile(a);
      return o ? [publicUser(o)] : [];
    }) };
  });

  app.post('/v1/social/blocks', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const ref = ((req.body ?? {}) as Record<string, unknown>).userId;
    const o = typeof ref === 'string' ? social.profileByUserId(ref) : null;
    if (!o || o.account === p.account) return fail(reply, 404, 'not_found');
    social.block(p.account, o.account, now());
    return { ok: true };
  });

  app.delete('/v1/social/blocks/:ref', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const o = social.profileByUserId((req.params as { ref: string }).ref);
    if (o) social.unblock(p.account, o.account);
    return { ok: true };
  });

  app.post('/v1/social/reports', async (req, reply) => {
    const p = me(req, reply);
    if (!p) return reply;
    const b = (req.body ?? {}) as Record<string, unknown>;
    const o = typeof b.userId === 'string' ? social.profileByUserId(b.userId) : null;
    if (!o || o.account === p.account) return fail(reply, 404, 'not_found');
    if (typeof b.reason !== 'string' || !(REPORT_REASONS as readonly string[]).includes(b.reason)) return fail(reply, 400, 'invalid_reason');
    if (social.reportsSince(p.account, now() - DAY_MS) >= MAX_REPORTS_PER_DAY) return fail(reply, 429, 'too_many_reports');
    const itemId = Number.isInteger(b.itemId) ? (b.itemId as number) : null;
    social.report(p.account, o.account, b.reason, itemId, now());
    if (b.block === true) social.block(p.account, o.account, now());
    return { ok: true };
  });

  // ------------------------------------------------------------ admin (moderation)

  const admin = (req: FastifyRequest, reply: FastifyReply) => {
    if (adminOk(req, deps.adminToken)) return true;
    void fail(reply, deps.adminToken ? 401 : 404, deps.adminToken ? 'unauthorized' : 'not_found');
    return false;
  };

  app.get('/v1/admin/reports', async (req, reply) => {
    if (!admin(req, reply)) return reply;
    const resolved = (req.query as Record<string, unknown>)?.resolved === '1';
    return {
      reports: social.reports(resolved).map((r) => {
        const target = social.profile(r.target);
        const reporter = social.profile(r.reporter);
        return { id: r.id, reason: r.reason, itemId: r.itemId, createdAt: new Date(r.createdAt).toISOString(), resolved: r.resolved, target: target ? { ...publicUser(target), banned: target.banned } : null, reporter: reporter ? reporter.userId : null };
      }),
    };
  });

  app.post('/v1/admin/reports/:id/resolve', async (req, reply) => {
    if (!admin(req, reply)) return reply;
    return { resolved: social.resolveReport(Number((req.params as { id: string }).id)) > 0 };
  });

  app.get('/v1/admin/users/:ref', async (req, reply) => {
    if (!admin(req, reply)) return reply;
    const ref = (req.params as { ref: string }).ref;
    const o = social.profileByUserId(ref) ?? social.profileByHandle(ref.replace(/^@/, ''));
    if (!o) return fail(reply, 404, 'not_found');
    return { user: { ...publicUser(o), banned: o.banned, createdAt: new Date(o.createdAt).toISOString(), friends: social.friends(o.account).length } };
  });

  app.post('/v1/admin/users/:ref/ban', async (req, reply) => {
    if (!admin(req, reply)) return reply;
    const o = social.profileByUserId((req.params as { ref: string }).ref);
    if (!o) return fail(reply, 404, 'not_found');
    const banned = ((req.body ?? {}) as Record<string, unknown>).banned !== false;
    social.setBanned(o.account, banned);
    return { userId: o.userId, banned };
  });

  app.post('/v1/admin/users/:ref/reset-name', async (req, reply) => {
    if (!admin(req, reply)) return reply;
    const o = social.profileByUserId((req.params as { ref: string }).ref);
    if (!o) return fail(reply, 404, 'not_found');
    const name = `Lumi ${o.userId.slice(0, 4).toUpperCase()}`;
    social.setName(o.account, name);
    social.updateProfile(o.account, { handle: `user_${o.userId.slice(0, 10)}`, name, avatar: o.avatar, leagues: o.leagues });
    return { user: publicUser(social.profile(o.account)!) };
  });
}
