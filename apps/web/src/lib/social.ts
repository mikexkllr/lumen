/**
 * Client for the social features (friends, friend streaks, leagues, feed). They
 * live on the Lumen server and use the account's device code as the only
 * credential; the server derives all stats from the backed-up learning events.
 */
import { dayKey } from '@lumen/engine';
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiUrl } from './api.ts';
import { normalizeCode } from './sync.ts';
import type { Settings } from './settings.ts';

export const TIERS = ['spark', 'ember', 'glow', 'beam', 'prism', 'aurora', 'comet', 'nova', 'pulsar', 'zenith'] as const;
export type Tier = (typeof TIERS)[number];
export const TIER_COLORS: Record<Tier, string> = {
  spark: '#c2853d', ember: '#e0613a', glow: '#e8b10e', beam: '#4fb36b', prism: '#2fa6c9', aurora: '#3d7be0', comet: '#6d5cf0', nova: '#b04fd9', pulsar: '#db3f8a', zenith: '#1c1a3a',
};

export const REACTIONS = [
  { id: 'clap', emoji: '👏' },
  { id: 'fire', emoji: '🔥' },
  { id: 'heart', emoji: '❤️' },
  { id: 'muscle', emoji: '💪' },
  { id: 'party', emoji: '🎉' },
  { id: 'star', emoji: '⭐' },
] as const;
export const reactionEmoji = (id: string) => REACTIONS.find((r) => r.id === id)?.emoji ?? '👏';

export const REPORT_REASONS = ['name', 'spam', 'harassment', 'other'] as const;

export interface PublicUser {
  id: string;
  handle: string;
  name: string;
  avatar: string;
}

export interface UserSummary extends PublicUser {
  streak: number;
  longestStreak: number;
  todayDone: boolean;
  xpWeek: number;
  xpTotal: number;
  level: number;
  tier: Tier;
  since: string;
}

export interface FriendStreak {
  current: number;
  todayDone: boolean;
  meToday: boolean;
  friendToday: boolean;
}

export interface Friend extends UserSummary {
  friendSince: string;
  friendStreak: FriendStreak;
}

export interface MeResponse {
  profile: UserSummary & { leagues: boolean };
  league: { week: string; tier: Tier } | null;
  requests: number;
  unseen: number;
}

export interface FriendsResponse {
  me: UserSummary;
  friends: Friend[];
  incoming: (PublicUser & { at: number })[];
  outgoing: (PublicUser & { at: number })[];
}

export interface Standing {
  rank: number;
  xp: number;
  zone: 'promote' | 'demote' | 'stay';
  me: boolean;
  hidden: boolean;
  user: PublicUser;
}

export interface LeagueResponse {
  week: string;
  joined: boolean;
  optedOut?: boolean;
  tier: Tier;
  tierIndex?: number;
  outcome?: 'promoted' | 'demoted' | 'stayed' | null;
  promote?: number;
  demote?: number;
  standings?: Standing[];
}

export interface FeedItem {
  id: number;
  kind: 'joined' | 'streak' | 'level' | 'league' | 'friend_streak' | 'course' | 'badge' | string;
  data: { n?: number; tier?: Tier; ref?: string; with?: PublicUser };
  day: string;
  createdAt: number;
  user: PublicUser;
  mine: boolean;
  reactions: Record<string, number>;
  myReaction: string | null;
  reactedBy: PublicUser[];
}

export interface Notice {
  id: number;
  kind: 'nudge' | 'reaction' | 'friend_request' | 'friend_accepted' | string;
  data: { item?: number; kind?: string; reaction?: string };
  day: string;
  createdAt: number;
  seen: boolean;
  from: PublicUser;
}

export interface FeedResponse {
  items: FeedItem[];
  notices: Notice[];
  next: number | null;
}

export interface UserResponse {
  user: PublicUser | UserSummary;
  relation: 'self' | 'friend' | 'requested' | 'incoming' | 'none';
  friendStreak?: FriendStreak | null;
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export interface SocialConn {
  serverUrl: string;
  token: string;
}

export const connOf = (s: Settings): SocialConn | null => (s.account ? { serverUrl: s.account.serverUrl, token: s.account.token } : null);

export async function api<T>(conn: SocialConn, method: string, path: string, body?: unknown): Promise<T> {
  const sep = path.includes('?') ? '&' : '?';
  const res = await fetch(apiUrl(conn.serverUrl, `${path}${sep}today=${dayKey(new Date())}`), {
    method,
    headers: { Authorization: `Bearer ${normalizeCode(conn.token)}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    let code = `http_${res.status}`;
    try {
      code = ((await res.json()) as { error?: string }).error ?? code;
    } catch {
      /* not JSON */
    }
    throw new ApiError(res.status, code);
  }
  return (await res.json()) as T;
}

/** Whether a server offers social features (older or minimal servers do not). */
export async function serverHasSocial(serverUrl: string): Promise<boolean> {
  try {
    const res = await fetch(apiUrl(serverUrl, '/v1/features'), { signal: AbortSignal.timeout(5000) });
    return res.ok && ((await res.json()) as { social?: boolean }).social === true;
  } catch {
    return false;
  }
}

export const social = {
  me: (c: SocialConn) => api<MeResponse>(c, 'GET', '/v1/social/me'),
  saveProfile: (c: SocialConn, p: { handle: string; name: string; avatar: string; leagues: boolean; ageConfirmed?: boolean }) => api<{ profile: UserSummary }>(c, 'PUT', '/v1/social/me', p),
  deleteProfile: (c: SocialConn) => api<{ deleted: number }>(c, 'DELETE', '/v1/social/me'),
  friends: (c: SocialConn) => api<FriendsResponse>(c, 'GET', '/v1/social/friends'),
  addFriend: (c: SocialConn, ref: { handle?: string; userId?: string }) => api<{ status: 'friends' | 'requested'; user: PublicUser }>(c, 'POST', '/v1/social/friends', ref),
  accept: (c: SocialConn, userId: string) => api<{ status: string }>(c, 'POST', `/v1/social/friends/${encodeURIComponent(userId)}/accept`),
  removeFriend: (c: SocialConn, userId: string) => api<{ status: string }>(c, 'DELETE', `/v1/social/friends/${encodeURIComponent(userId)}`),
  nudge: (c: SocialConn, userId: string) => api<{ sent: boolean }>(c, 'POST', `/v1/social/friends/${encodeURIComponent(userId)}/nudge`),
  league: (c: SocialConn) => api<LeagueResponse>(c, 'GET', '/v1/social/league'),
  feed: (c: SocialConn, before?: number | null) => api<FeedResponse>(c, 'GET', `/v1/social/feed${before ? `?before=${before}` : ''}`),
  seen: (c: SocialConn) => api<{ ok: true }>(c, 'POST', '/v1/social/notices/seen'),
  post: (c: SocialConn, kind: 'course' | 'badge', ref: string) => api<{ posted: boolean }>(c, 'POST', '/v1/social/feed', { kind, ref }),
  react: (c: SocialConn, id: number, reaction: string) => api<{ ok: true }>(c, 'PUT', `/v1/social/feed/${id}/reaction`, { reaction }),
  unreact: (c: SocialConn, id: number) => api<{ ok: true }>(c, 'DELETE', `/v1/social/feed/${id}/reaction`),
  user: (c: SocialConn, ref: string) => api<UserResponse>(c, 'GET', `/v1/social/users/${encodeURIComponent(ref)}`),
  blocks: (c: SocialConn) => api<{ blocked: PublicUser[] }>(c, 'GET', '/v1/social/blocks'),
  block: (c: SocialConn, userId: string) => api<{ ok: true }>(c, 'POST', '/v1/social/blocks', { userId }),
  unblock: (c: SocialConn, userId: string) => api<{ ok: true }>(c, 'DELETE', `/v1/social/blocks/${encodeURIComponent(userId)}`),
  report: (c: SocialConn, userId: string, reason: string, opts: { itemId?: number; block?: boolean } = {}) => api<{ ok: true }>(c, 'POST', '/v1/social/reports', { userId, reason, ...opts }),
};

/**
 * Creates the community profile for a name: the handle is derived from it (with a random
 * number) and retried when taken; the learner can change both later.
 */
export async function createProfile(c: SocialConn, name: string, api = social): Promise<UserSummary> {
  let last: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const handle = suggestHandle(attempt < 3 ? name : 'lumi');
    try {
      return (await api.saveProfile(c, { handle, name: name.trim(), avatar: randomAvatar(), leagues: true, ageConfirmed: true })).profile;
    } catch (e) {
      last = e;
      if (!(e instanceof ApiError) || !['handle_taken', 'invalid_handle', 'reserved_handle', 'offensive_handle'].includes(e.code)) throw e;
    }
  }
  throw last;
}

export interface Query<T> {
  data: T | null;
  error: ApiError | Error | null;
  loading: boolean;
  reload(): void;
  set(data: T): void;
}

/** Tiny fetch hook: refetches when `key` changes, keeps the last data while reloading. */
export function useQuery<T>(key: string | null, fetcher: () => Promise<T>): Query<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(!!key);
  const [nonce, setNonce] = useState(0);
  const f = useRef(fetcher);
  f.current = fetcher;
  useEffect(() => {
    if (!key) return;
    let live = true;
    setLoading(true);
    f.current()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: Error) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [key, nonce]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, reload, set: setData };
}

/** Invite link that opens the inviter's profile in the app. */
export function inviteLink(handle: string): string {
  const base = typeof location !== 'undefined' && /^https?:/.test(location.protocol) ? `${location.origin}${location.pathname}` : '';
  return `${base}#/u/@${handle}`;
}

/** Days left in the league week (ends Sunday night, local time). */
export function daysLeft(now = new Date()): number {
  const dow = (now.getDay() + 6) % 7;
  return 7 - dow;
}

export const AVATAR_COLORS = ['#5145f0', '#0f9d8a', '#e0613a', '#d99a1e', '#db3f8a', '#2fa6c9', '#6b8e23', '#b04fd9', '#3d7be0', '#c2853d', '#e64a5f', '#4b5563'];
export const AVATAR_ICONS = ['atom', 'rocket', 'star', 'leaf', 'cat', 'dog', 'bird', 'fish', 'flower', 'moon', 'sun', 'zap', 'heart', 'music', 'mountain', 'coffee'] as const;

export function parseAvatar(a: string): { color: string; icon: (typeof AVATAR_ICONS)[number] } {
  const m = /^c(\d+)-i(\d+)$/.exec(a);
  return { color: AVATAR_COLORS[Number(m?.[1] ?? 0) % AVATAR_COLORS.length], icon: AVATAR_ICONS[Number(m?.[2] ?? 0) % AVATAR_ICONS.length] };
}

export function randomAvatar(): string {
  const r = crypto.getRandomValues(new Uint8Array(2));
  return `c${r[0] % AVATAR_COLORS.length}-i${r[1] % AVATAR_ICONS.length}`;
}

/** A handle suggestion from a display name. */
export function suggestHandle(name: string): string {
  const base = name.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 14);
  const n = crypto.getRandomValues(new Uint16Array(1))[0] % 1000;
  return `${base.length >= 3 ? base : 'lumi'}_${n}`;
}
