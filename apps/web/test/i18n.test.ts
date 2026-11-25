import { describe, expect, it } from 'vitest';
import { allKeys, rawString, translate } from '../src/lib/i18n.ts';

const variants = (v: string | readonly string[]) => (typeof v === 'string' ? [v] : [...v]);
const placeholders = (s: string) => new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]));

describe('UI strings', () => {
  it('every key has a German and an English text', () => {
    const keys = allKeys();
    expect(keys.length).toBeGreaterThan(500);
    for (const k of keys) {
      for (const locale of ['de', 'en'] as const) {
        const v = rawString(locale, k);
        expect(v, `${locale} ${k}`).toBeDefined();
        for (const s of variants(v)) expect(s.trim(), `${locale} ${k}`).not.toBe('');
      }
    }
  });

  it('German and English use the same placeholders', () => {
    for (const k of allKeys()) {
      const de = variants(rawString('de', k)).map(placeholders);
      const en = variants(rawString('en', k)).map(placeholders);
      const all = (sets: Set<string>[]) => [...new Set(sets.flatMap((s) => [...s]))].sort();
      expect(all(en), k).toEqual(all(de));
    }
  });

  it('English has no German left in it', () => {
    for (const k of allKeys()) {
      for (const s of variants(rawString('en', k))) expect(s, k).not.toMatch(/[äöüß]|\b(und|der|die|das|Lektion(en)?|nicht|mit|für|oder|auf)\b/);
    }
  });

  it('says nothing about sync codes or using Lumen without an account', () => {
    for (const k of allKeys()) {
      for (const locale of ['de', 'en'] as const) {
        for (const s of variants(rawString(locale, k))) expect(s, `${locale} ${k}`).not.toMatch(/sync[- ]?code|Sync-Code|ohne (Account|Konto)|without an account|no account/i);
      }
    }
  });

  it('fills in variables and plural forms', () => {
    expect(translate('de', 'home.streakN', { n: 1 })).toBe('1 Tag in Folge');
    expect(translate('de', 'home.streakN', { n: 3 })).toBe('3 Tage in Folge');
    expect(translate('en', 'home.streakUnit', { n: 1 })).toBe('day in a row');
    expect(translate('en', 'profile.activeDays', { n: 1, weeks: 18 })).toBe('1 active day in 18 weeks');
    expect(translate('de', 'signin.codeSent', { email: 'a@b.de' })).toContain('a@b.de');
  });

  it('the sign-in terms sentence carries both links', () => {
    for (const locale of ['de', 'en'] as const) {
      const s = translate(locale, 'signin.terms');
      expect(s).toContain('{terms}');
      expect(s).toContain('{privacy}');
    }
  });
});
