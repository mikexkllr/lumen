/**
 * Social storage (AGPL-3.0-or-later) on SQLite via node:sqlite. Social data is
 * opt-in and kept apart from the learning events: deleting the social profile
 * removes everything here, deleting the account removes both.
 *
 * Accounts are the SHA-256 keys of sync codes; other users only ever see the
 * random public user id, the handle, the display name and the avatar.
 */
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { DayRow } from './logic.ts';

export interface Profile {
  account: string;
  userId: string;
  handle: string;
  name: string;
  avatar: string;
  createdAt: number;
  lastToday: string | null;
  xpTotal: number;
  tier: number;
  leagues: boolean;
  banned: boolean;
}

export interface PublicUser {
  id: string;
  handle: string;
  name: string;
  avatar: string;
}

export interface Membership {
  week: string;
  cohort: number;
  account: string;
  tier: number;
  joinedAt: number;
  outcome: string | null;
}

export interface FeedRow {
  id: number;
  account: string;
  kind: string;
  data: Record<string, unknown>;
  day: string;
  createdAt: number;
}

export interface NoticeRow {
  id: number;
  to: string;
  from: string;
  kind: string;
  data: Record<string, unknown>;
  day: string;
  createdAt: number;
  seen: boolean;
}

export interface ReportRow {
  id: number;
  reporter: string;
  target: string;
  reason: string;
  itemId: number | null;
  createdAt: number;
  resolved: boolean;
}

type Row = Record<string, unknown>;

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export function newUserId(): string {
  return [...randomBytes(12)].map((b) => ID_ALPHABET[b % ID_ALPHABET.length]).join('');
}

const toProfile = (r: Row): Profile => ({
  account: String(r.account),
  userId: String(r.user_id),
  handle: String(r.handle),
  name: String(r.name),
  avatar: String(r.avatar),
  createdAt: Number(r.created_at),
  lastToday: (r.last_today as string | null) ?? null,
  xpTotal: Number(r.xp_total),
  tier: Number(r.tier),
  leagues: Number(r.leagues) === 1,
  banned: Number(r.banned) === 1,
});

export const publicUser = (p: Profile): PublicUser => ({ id: p.userId, handle: p.handle, name: p.name, avatar: p.avatar });

export function socialStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS social_profiles (
      account TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      handle TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      avatar TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_today TEXT,
      xp_total INTEGER NOT NULL DEFAULT 0,
      tier INTEGER NOT NULL DEFAULT 0,
      leagues INTEGER NOT NULL DEFAULT 1,
      banned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS social_days (
      account TEXT NOT NULL,
      day TEXT NOT NULL,
      xp INTEGER NOT NULL,
      active INTEGER NOT NULL,
      PRIMARY KEY (account, day)
    );
    CREATE TABLE IF NOT EXISTS social_requests (
      from_account TEXT NOT NULL,
      to_account TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (from_account, to_account)
    );
    CREATE INDEX IF NOT EXISTS social_requests_to ON social_requests (to_account);
    CREATE TABLE IF NOT EXISTS social_friends (
      account TEXT NOT NULL,
      friend TEXT NOT NULL,
      since_day TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (account, friend)
    );
    CREATE TABLE IF NOT EXISTS social_blocks (
      account TEXT NOT NULL,
      blocked TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (account, blocked)
    );
    CREATE TABLE IF NOT EXISTS social_league (
      week TEXT NOT NULL,
      cohort INTEGER NOT NULL,
      account TEXT NOT NULL,
      tier INTEGER NOT NULL,
      joined_at INTEGER NOT NULL,
      outcome TEXT,
      PRIMARY KEY (week, account)
    );
    CREATE INDEX IF NOT EXISTS social_league_cohort ON social_league (cohort);
    CREATE INDEX IF NOT EXISTS social_league_account ON social_league (account, week);
    CREATE TABLE IF NOT EXISTS social_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      kind TEXT NOT NULL,
      dedupe TEXT,
      data TEXT NOT NULL,
      day TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE (account, dedupe)
    );
    CREATE INDEX IF NOT EXISTS social_feed_account ON social_feed (account, id);
    CREATE TABLE IF NOT EXISTS social_reactions (
      item_id INTEGER NOT NULL,
      account TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (item_id, account)
    );
    CREATE TABLE IF NOT EXISTS social_notices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      to_account TEXT NOT NULL,
      from_account TEXT NOT NULL,
      kind TEXT NOT NULL,
      dedupe TEXT,
      data TEXT NOT NULL,
      day TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      seen INTEGER NOT NULL DEFAULT 0,
      UNIQUE (to_account, dedupe)
    );
    CREATE INDEX IF NOT EXISTS social_notices_to ON social_notices (to_account, id);
    CREATE TABLE IF NOT EXISTS social_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter TEXT NOT NULL,
      target TEXT NOT NULL,
      reason TEXT NOT NULL,
      item_id INTEGER,
      created_at INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
  `);

  const q = <T = Row>(sql: string) => {
    const st = db.prepare(sql);
    return {
      get: (...a: (string | number | null)[]) => st.get(...a) as T | undefined,
      all: (...a: (string | number | null)[]) => st.all(...a) as T[],
      run: (...a: (string | number | null)[]) => st.run(...a),
    };
  };

  const tx = <T>(f: () => T): T => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const out = f();
      db.exec('COMMIT');
      return out;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  };

  const sql = {
    profile: q('SELECT * FROM social_profiles WHERE account = ?'),
    profileByUser: q('SELECT * FROM social_profiles WHERE user_id = ?'),
    profileByHandle: q('SELECT * FROM social_profiles WHERE handle = ?'),
    insertProfile: q('INSERT INTO social_profiles (account, user_id, handle, name, avatar, created_at, leagues) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    updateProfile: q('UPDATE social_profiles SET handle = ?, name = ?, avatar = ?, leagues = ? WHERE account = ?'),
    updateStats: q('UPDATE social_profiles SET xp_total = ?, last_today = CASE WHEN last_today IS NULL OR last_today < ? THEN ? ELSE last_today END WHERE account = ?'),
    setTier: q('UPDATE social_profiles SET tier = ? WHERE account = ?'),
    setBanned: q('UPDATE social_profiles SET banned = ? WHERE account = ?'),
    setName: q('UPDATE social_profiles SET name = ? WHERE account = ?'),
    days: q<{ day: string; xp: number; active: number }>('SELECT day, xp, active FROM social_days WHERE account = ? ORDER BY day'),
    clearDays: q('DELETE FROM social_days WHERE account = ?'),
    insertDay: q('INSERT INTO social_days (account, day, xp, active) VALUES (?, ?, ?, ?)'),
    request: q('SELECT * FROM social_requests WHERE from_account = ? AND to_account = ?'),
    insertRequest: q('INSERT OR IGNORE INTO social_requests (from_account, to_account, created_at) VALUES (?, ?, ?)'),
    deleteRequest: q('DELETE FROM social_requests WHERE from_account = ? AND to_account = ?'),
    incoming: q<{ from_account: string; created_at: number }>('SELECT from_account, created_at FROM social_requests WHERE to_account = ? ORDER BY created_at DESC'),
    outgoing: q<{ to_account: string; created_at: number }>('SELECT to_account, created_at FROM social_requests WHERE from_account = ? ORDER BY created_at DESC'),
    requestsToday: q<{ n: number }>('SELECT COUNT(*) AS n FROM social_requests WHERE from_account = ? AND created_at > ?'),
    friends: q<{ friend: string; since_day: string; created_at: number }>('SELECT friend, since_day, created_at FROM social_friends WHERE account = ? ORDER BY created_at'),
    friend: q<{ since_day: string }>('SELECT since_day FROM social_friends WHERE account = ? AND friend = ?'),
    insertFriend: q('INSERT OR IGNORE INTO social_friends (account, friend, since_day, created_at) VALUES (?, ?, ?, ?)'),
    deleteFriend: q('DELETE FROM social_friends WHERE account = ? AND friend = ?'),
    block: q('SELECT 1 AS x FROM social_blocks WHERE (account = ? AND blocked = ?) OR (account = ? AND blocked = ?)'),
    insertBlock: q('INSERT OR IGNORE INTO social_blocks (account, blocked, created_at) VALUES (?, ?, ?)'),
    deleteBlock: q('DELETE FROM social_blocks WHERE account = ? AND blocked = ?'),
    blocks: q<{ blocked: string }>('SELECT blocked FROM social_blocks WHERE account = ? ORDER BY created_at DESC'),
    blockedEither: q<{ other: string }>('SELECT blocked AS other FROM social_blocks WHERE account = ? UNION SELECT account AS other FROM social_blocks WHERE blocked = ?'),
    membership: q('SELECT * FROM social_league WHERE week = ? AND account = ?'),
    lastMembership: q('SELECT * FROM social_league WHERE account = ? AND week < ? ORDER BY week DESC LIMIT 1'),
    cohortMembers: q('SELECT * FROM social_league WHERE cohort = ? ORDER BY joined_at'),
    openCohort: q<{ cohort: number; n: number }>('SELECT cohort, COUNT(*) AS n FROM social_league WHERE week = ? AND tier = ? GROUP BY cohort HAVING n < ? ORDER BY cohort DESC LIMIT 1'),
    maxCohort: q<{ m: number | null }>('SELECT MAX(cohort) AS m FROM social_league'),
    insertMembership: q('INSERT OR IGNORE INTO social_league (week, cohort, account, tier, joined_at, outcome) VALUES (?, ?, ?, ?, ?, ?)'),
    insertFeed: q('INSERT OR IGNORE INTO social_feed (account, kind, dedupe, data, day, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    feedItem: q('SELECT * FROM social_feed WHERE id = ?'),
    recentFeedOfKind: q('SELECT * FROM social_feed WHERE account = ? AND kind = ? AND day > ? ORDER BY id DESC'),
    reactions: q<{ account: string; reaction: string }>('SELECT account, reaction FROM social_reactions WHERE item_id = ?'),
    upsertReaction: q('INSERT INTO social_reactions (item_id, account, reaction, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (item_id, account) DO UPDATE SET reaction = excluded.reaction'),
    deleteReaction: q('DELETE FROM social_reactions WHERE item_id = ? AND account = ?'),
    insertNotice: q('INSERT OR IGNORE INTO social_notices (to_account, from_account, kind, dedupe, data, day, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    notices: q('SELECT * FROM social_notices WHERE to_account = ? ORDER BY id DESC LIMIT ?'),
    unseenNotices: q<{ n: number }>('SELECT COUNT(*) AS n FROM social_notices WHERE to_account = ? AND seen = 0'),
    markSeen: q('UPDATE social_notices SET seen = 1 WHERE to_account = ?'),
    insertReport: q('INSERT INTO social_reports (reporter, target, reason, item_id, created_at) VALUES (?, ?, ?, ?, ?)'),
    reportsToday: q<{ n: number }>('SELECT COUNT(*) AS n FROM social_reports WHERE reporter = ? AND created_at > ?'),
    reports: q('SELECT * FROM social_reports WHERE resolved = ? ORDER BY id DESC LIMIT 200'),
    resolveReport: q('UPDATE social_reports SET resolved = 1 WHERE id = ?'),
  };

  const parse = (s: unknown) => {
    try {
      return JSON.parse(String(s)) as Record<string, unknown>;
    } catch {
      return {};
    }
  };

  const toFeed = (r: Row): FeedRow => ({ id: Number(r.id), account: String(r.account), kind: String(r.kind), data: parse(r.data), day: String(r.day), createdAt: Number(r.created_at) });
  const toMembership = (r: Row): Membership => ({ week: String(r.week), cohort: Number(r.cohort), account: String(r.account), tier: Number(r.tier), joinedAt: Number(r.joined_at), outcome: (r.outcome as string | null) ?? null });

  return {
    tx,
    profile(account: string): Profile | null {
      const r = sql.profile.get(account);
      return r ? toProfile(r) : null;
    },
    profileByUserId(userId: string): Profile | null {
      const r = sql.profileByUser.get(userId);
      return r ? toProfile(r) : null;
    },
    profileByHandle(handle: string): Profile | null {
      const r = sql.profileByHandle.get(handle.toLowerCase());
      return r ? toProfile(r) : null;
    },
    createProfile(account: string, p: { handle: string; name: string; avatar: string; leagues: boolean }, now = Date.now()): Profile {
      sql.insertProfile.run(account, newUserId(), p.handle, p.name, p.avatar, now, p.leagues ? 1 : 0);
      return this.profile(account)!;
    },
    updateProfile(account: string, p: { handle: string; name: string; avatar: string; leagues: boolean }): void {
      sql.updateProfile.run(p.handle, p.name, p.avatar, p.leagues ? 1 : 0, account);
    },
    setStats(account: string, xpTotal: number, today: string, rows: readonly DayRow[]): void {
      tx(() => {
        sql.clearDays.run(account);
        for (const r of rows) sql.insertDay.run(account, r.day, r.xp, r.active ? 1 : 0);
        sql.updateStats.run(xpTotal, today, today, account);
      });
    },
    days(account: string): DayRow[] {
      return sql.days.all(account).map((r) => ({ day: r.day, xp: Number(r.xp), active: Number(r.active) === 1 }));
    },
    setTier(account: string, tier: number): void {
      sql.setTier.run(tier, account);
    },
    setBanned(account: string, banned: boolean): void {
      sql.setBanned.run(banned ? 1 : 0, account);
    },
    setName(account: string, name: string): void {
      sql.setName.run(name, account);
    },

    // ---------------------------------------------------------- friends
    hasRequest: (from: string, to: string) => !!sql.request.get(from, to),
    addRequest: (from: string, to: string, now = Date.now()) => void sql.insertRequest.run(from, to, now),
    removeRequest: (from: string, to: string) => Number(sql.deleteRequest.run(from, to).changes),
    incoming: (account: string) => sql.incoming.all(account).map((r) => ({ account: r.from_account, createdAt: Number(r.created_at) })),
    outgoing: (account: string) => sql.outgoing.all(account).map((r) => ({ account: r.to_account, createdAt: Number(r.created_at) })),
    requestsSince: (account: string, since: number) => Number(sql.requestsToday.get(account, since)?.n ?? 0),
    friends: (account: string) => sql.friends.all(account).map((r) => ({ account: r.friend, since: r.since_day, createdAt: Number(r.created_at) })),
    friendSince: (a: string, b: string) => sql.friend.get(a, b)?.since_day ?? null,
    befriend(a: string, b: string, sinceDay: string, now = Date.now()) {
      tx(() => {
        sql.insertFriend.run(a, b, sinceDay, now);
        sql.insertFriend.run(b, a, sinceDay, now);
        sql.deleteRequest.run(a, b);
        sql.deleteRequest.run(b, a);
      });
    },
    unfriend(a: string, b: string) {
      tx(() => {
        sql.deleteFriend.run(a, b);
        sql.deleteFriend.run(b, a);
        sql.deleteRequest.run(a, b);
        sql.deleteRequest.run(b, a);
      });
    },

    // ---------------------------------------------------------- blocks
    isBlocked: (a: string, b: string) => !!sql.block.get(a, b, b, a),
    block(account: string, other: string, now = Date.now()) {
      tx(() => {
        sql.insertBlock.run(account, other, now);
        sql.deleteFriend.run(account, other);
        sql.deleteFriend.run(other, account);
        sql.deleteRequest.run(account, other);
        sql.deleteRequest.run(other, account);
      });
    },
    unblock: (account: string, other: string) => Number(sql.deleteBlock.run(account, other).changes),
    blocks: (account: string) => sql.blocks.all(account).map((r) => r.blocked),
    /** Accounts this one blocked or was blocked by. */
    hidden: (account: string) => new Set(sql.blockedEither.all(account, account).map((r) => r.other)),

    // ---------------------------------------------------------- leagues
    membership(week: string, account: string): Membership | null {
      const r = sql.membership.get(week, account);
      return r ? toMembership(r) : null;
    },
    lastMembership(account: string, beforeWeek: string): Membership | null {
      const r = sql.lastMembership.get(account, beforeWeek);
      return r ? toMembership(r) : null;
    },
    cohort: (cohort: number) => sql.cohortMembers.all(cohort).map(toMembership),
    join(week: string, account: string, tier: number, outcome: string | null, size: number, now = Date.now()): Membership {
      return tx(() => {
        const existing = sql.membership.get(week, account);
        if (existing) return toMembership(existing);
        const open = sql.openCohort.get(week, tier, size);
        const cohort = open?.cohort ?? Number(sql.maxCohort.get()?.m ?? 0) + 1;
        sql.insertMembership.run(week, cohort, account, tier, now, outcome);
        return toMembership(sql.membership.get(week, account)!);
      });
    },

    // ---------------------------------------------------------- feed
    post(account: string, kind: string, data: Record<string, unknown>, day: string, dedupe: string | null, now = Date.now()): boolean {
      return Number(sql.insertFeed.run(account, kind, dedupe, JSON.stringify(data), day, now).changes) > 0;
    },
    recentPosts: (account: string, kind: string, afterDay: string) => sql.recentFeedOfKind.all(account, kind, afterDay).map(toFeed),
    feedItem(id: number): FeedRow | null {
      const r = sql.feedItem.get(id);
      return r ? toFeed(r) : null;
    },
    feed(accounts: readonly string[], before: number | null, limit: number): FeedRow[] {
      if (!accounts.length) return [];
      const marks = accounts.map(() => '?').join(',');
      const st = db.prepare(`SELECT * FROM social_feed WHERE account IN (${marks}) ${before ? 'AND id < ?' : ''} ORDER BY id DESC LIMIT ?`);
      const args: (string | number)[] = [...accounts, ...(before ? [before] : []), limit];
      return (st.all(...args) as Row[]).map(toFeed);
    },
    reactions: (itemId: number) => sql.reactions.all(itemId),
    react: (itemId: number, account: string, reaction: string, now = Date.now()) => void sql.upsertReaction.run(itemId, account, reaction, now),
    unreact: (itemId: number, account: string) => Number(sql.deleteReaction.run(itemId, account).changes),

    // ---------------------------------------------------------- notices
    notify(to: string, from: string, kind: string, data: Record<string, unknown>, day: string, dedupe: string | null, now = Date.now()): boolean {
      return Number(sql.insertNotice.run(to, from, kind, dedupe, JSON.stringify(data), day, now).changes) > 0;
    },
    notices: (account: string, limit = 30): NoticeRow[] =>
      sql.notices.all(account, limit).map((r) => ({ id: Number(r.id), to: String(r.to_account), from: String(r.from_account), kind: String(r.kind), data: parse(r.data), day: String(r.day), createdAt: Number(r.created_at), seen: Number(r.seen) === 1 })),
    unseenNotices: (account: string) => Number(sql.unseenNotices.get(account)?.n ?? 0),
    markNoticesSeen: (account: string) => void sql.markSeen.run(account),

    // ---------------------------------------------------------- reports
    report: (reporter: string, target: string, reason: string, itemId: number | null, now = Date.now()) => void sql.insertReport.run(reporter, target, reason, itemId, now),
    reportsSince: (reporter: string, since: number) => Number(sql.reportsToday.get(reporter, since)?.n ?? 0),
    reports: (resolved = false): ReportRow[] =>
      sql.reports.all(resolved ? 1 : 0).map((r) => ({ id: Number(r.id), reporter: String(r.reporter), target: String(r.target), reason: String(r.reason), itemId: r.item_id == null ? null : Number(r.item_id), createdAt: Number(r.created_at), resolved: Number(r.resolved) === 1 })),
    resolveReport: (id: number) => Number(sql.resolveReport.run(id).changes),

    /** Removes the social profile and everything attached to it; learning events stay. */
    deleteAccount(account: string): number {
      return tx(() => {
        let n = 0;
        const items = db.prepare('SELECT id FROM social_feed WHERE account = ?').all(account) as { id: number }[];
        for (const it of items) db.prepare('DELETE FROM social_reactions WHERE item_id = ?').run(it.id);
        for (const s of [
          'DELETE FROM social_profiles WHERE account = ?',
          'DELETE FROM social_days WHERE account = ?',
          'DELETE FROM social_feed WHERE account = ?',
          'DELETE FROM social_reactions WHERE account = ?',
          'DELETE FROM social_league WHERE account = ?',
          'DELETE FROM social_requests WHERE from_account = ?1 OR to_account = ?1',
          'DELETE FROM social_friends WHERE account = ?1 OR friend = ?1',
          'DELETE FROM social_blocks WHERE account = ?1 OR blocked = ?1',
          'DELETE FROM social_notices WHERE to_account = ?1 OR from_account = ?1',
        ]) n += Number(db.prepare(s).run(account).changes);
        // Reports about a deleted user stay for moderation, reports filed by them go.
        db.prepare('DELETE FROM social_reports WHERE reporter = ?').run(account);
        return n;
      });
    },
    close() {
      db.close();
    },
  };
}

export type SocialStore = ReturnType<typeof socialStore>;
