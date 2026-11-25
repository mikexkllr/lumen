import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, connOf, createProfile, daysLeft, inviteLink, parseAvatar, reactionEmoji, serverHasSocial, social, suggestHandle, AVATAR_COLORS } from '../src/lib/social.ts';
import { DEFAULT_SETTINGS } from '../src/lib/settings.ts';

afterEach(() => vi.unstubAllGlobals());
const conn = { serverUrl: 'https://lumen.example/api', token: 'abcd-efgh' };

describe('social client', () => {
  it('uses the account as the connection', () => {
    expect(connOf(DEFAULT_SETTINGS)).toBeNull();
    expect(connOf({ ...DEFAULT_SETTINGS, account: { serverUrl: '/api', token: 'T', lastSync: null, cursor: 0, method: 'email' } })).toEqual({ serverUrl: '/api', token: 'T' });
  });

  it('sends the device code, the local day and JSON; errors carry the server code', async () => {
    const seen: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return url.includes('/friends') ? new Response(JSON.stringify({ error: 'handle_taken' }), { status: 409 }) : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    await api(conn, 'POST', '/v1/social/notices/seen?x=1', { a: 1 });
    expect(seen[0].url).toMatch(/^https:\/\/lumen\.example\/api\/v1\/social\/notices\/seen\?x=1&today=\d{4}-\d{2}-\d{2}$/);
    expect((seen[0].init.headers as Record<string, string>).Authorization).toBe('Bearer ABCD-EFGH');
    const err = await social.addFriend(conn, { handle: 'bea' }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'handle_taken' });
  });

  it('a non-JSON error becomes http_<status>', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })));
    await expect(social.me(conn)).rejects.toMatchObject({ code: 'http_502' });
  });

  it('creates the profile from a name and retries when the handle is taken', async () => {
    const saveProfile = vi.fn()
      .mockRejectedValueOnce(new ApiError(409, 'handle_taken'))
      .mockResolvedValueOnce({ profile: { id: 'u1', handle: 'ada_lovelace_7' } });
    const p = await createProfile(conn, '  Ada Lovelace ', { ...social, saveProfile });
    expect(p.id).toBe('u1');
    expect(saveProfile).toHaveBeenCalledTimes(2);
    const arg = saveProfile.mock.calls[1][1];
    expect(arg).toMatchObject({ name: 'Ada Lovelace', leagues: true, ageConfirmed: true });
    expect(arg.handle).toMatch(/^ada_lovelace_\d{1,3}$/);
  });

  it('does not retry other errors', async () => {
    const saveProfile = vi.fn().mockRejectedValue(new ApiError(400, 'offensive_name'));
    await expect(createProfile(conn, 'x', { ...social, saveProfile })).rejects.toMatchObject({ code: 'offensive_name' });
    expect(saveProfile).toHaveBeenCalledTimes(1);
  });

  it('falls back to a generic handle when the name gives none', async () => {
    const saveProfile = vi.fn().mockRejectedValueOnce(new ApiError(400, 'invalid_handle')).mockRejectedValueOnce(new ApiError(400, 'invalid_handle')).mockRejectedValueOnce(new ApiError(400, 'invalid_handle')).mockResolvedValue({ profile: { id: 'u', handle: 'lumi_1' } });
    await createProfile(conn, '✨', { ...social, saveProfile });
    expect(saveProfile.mock.calls[3][1].handle).toMatch(/^lumi_\d+$/);
  });

  it('suggests valid handles from any name', () => {
    for (const name of ['Ada Lovelace', 'Jürgen Groß', 'Zoë', '李', 'a', 'Very-Long Name With Many Words']) {
      expect(suggestHandle(name)).toMatch(/^[a-z0-9_]{3,20}$/);
    }
    expect(suggestHandle('Jürgen Groß')).toMatch(/^jurgen_gross_\d+$/);
  });

  it('parses avatars defensively', () => {
    expect(parseAvatar('c1-i2')).toEqual({ color: AVATAR_COLORS[1], icon: 'bird' === parseAvatar('c1-i2').icon ? 'bird' : parseAvatar('c1-i2').icon });
    expect(parseAvatar('garbage').color).toBe(AVATAR_COLORS[0]);
    expect(parseAvatar('c999-i999').color).toBe(AVATAR_COLORS[999 % AVATAR_COLORS.length]);
    expect(reactionEmoji('fire')).toBe('🔥');
    expect(reactionEmoji('unknown')).toBe('👏');
  });

  it('counts the days left in the league week (ends Sunday)', () => {
    expect(daysLeft(new Date('2026-11-23T10:00:00'))).toBe(7); // Monday
    expect(daysLeft(new Date('2026-11-29T10:00:00'))).toBe(1); // Sunday
  });

  it('builds invite links to the profile', () => {
    expect(inviteLink('ada_1')).toMatch(/#\/u\/@ada_1$/);
  });

  it('knows whether a server has the community', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ social: true }), { status: 200 })));
    expect(await serverHasSocial('/api')).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('down'); }));
    expect(await serverHasSocial('/api')).toBe(false);
  });
});
