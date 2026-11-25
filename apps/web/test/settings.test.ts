import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, isKid, migrateSettings, signedOutSettings, type Settings } from '../src/lib/settings.ts';

const base = (patch: Partial<Settings> & Record<string, unknown>): Settings => ({ ...DEFAULT_SETTINGS, ...patch }) as Settings;

describe('settings', () => {
  it('turns a sync code from before sign-in into the account', () => {
    const s = migrateSettings(base({ account: undefined as never, sync: { serverUrl: 'https://x.example/api', token: 'ABCD-EFGH', lastSync: 5, cursor: 12, consent: true } }));
    expect(s.account).toEqual({ serverUrl: 'https://x.example/api', token: 'ABCD-EFGH', lastSync: 5, cursor: 12, method: 'code' });
    expect('sync' in s).toBe(false);
  });

  it('keeps an existing account and drops a stale sync entry', () => {
    const account = { serverUrl: '/api', token: 'T', lastSync: null, cursor: 0, method: 'email' as const };
    const s = migrateSettings(base({ account, sync: { serverUrl: '/old', token: 'OLD', lastSync: null, cursor: 0 } }));
    expect(s.account).toEqual(account);
  });

  it('maps old learning paths and splits the old science interest', () => {
    const s = migrateSettings(base({ pathId: 'path.algebra', interests: ['science', 'math', 'physics'] }));
    expect(s.pathId).toBe('path.math');
    expect(s.interests).toEqual(['physics', 'chemistry', 'math']);
  });

  it('repairs values the UI cannot show', () => {
    const s = migrateSettings(base({ fontScale: 7, dailyGoal: 3 }));
    expect(s.fontScale).toBe(1);
    expect(s.dailyGoal).toBe(10);
    expect(migrateSettings(base({ fontScale: 1.3, dailyGoal: 20 }))).toMatchObject({ fontScale: 1.3, dailyGoal: 20 });
  });

  it('signing out keeps device preferences and forgets the learner', () => {
    const s = signedOutSettings(base({
      locale: 'en', theme: 'dark', fontScale: 1.15, highContrast: true, sound: false,
      onboarded: true, age: '16+', interests: ['math'], pathId: 'path.math', communityName: 'Ada',
      account: { serverUrl: '/api', token: 'T', lastSync: 1, cursor: 3, method: 'apple' },
      social: { userId: 'u', handle: 'ada' }, tutorByok: { url: 'https://a/v1', model: 'm', key: 'k' }, tutorConsent: true,
    }));
    expect(s).toMatchObject({ locale: 'en', theme: 'dark', fontScale: 1.15, highContrast: true, sound: false });
    expect(s).toMatchObject({ onboarded: false, age: null, interests: [], pathId: null, communityName: null, account: null, social: null, tutorByok: null, tutorConsent: false });
  });

  it('kids mode is below 16', () => {
    expect(isKid(base({ age: 'u13' }))).toBe(true);
    expect(isKid(base({ age: '13-15' }))).toBe(true);
    expect(isKid(base({ age: '16+' }))).toBe(false);
    expect(isKid(base({ age: null }))).toBe(false);
  });
});
