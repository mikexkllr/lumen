import { describe, expect, it } from 'vitest';
import { legalText } from '../src/lib/legal.ts';

const pages = ['privacy', 'terms', 'imprint', 'delete'] as const;

describe('legal pages', () => {
  it('exist in both languages with headings and text', () => {
    for (const p of pages) {
      for (const l of ['de', 'en']) {
        const s = legalText(p, l);
        expect(s.length, `${p} ${l}`).toBeGreaterThan(1);
        for (const x of s) {
          expect(x.h.trim()).not.toBe('');
          expect(x.body.trim()).not.toBe('');
        }
      }
    }
  });

  it('describe the account-based app: no template notice, no sync codes, no “without an account”', () => {
    for (const p of pages) {
      for (const l of ['de', 'en']) {
        const text = legalText(p, l).map((x) => `${x.h}\n${x.body}`).join('\n');
        expect(text).not.toMatch(/Vorlage|template notice|Sync-Code|sync code|ohne Konto|without an account/i);
      }
    }
    const privacy = legalText('privacy', 'de').map((x) => x.h);
    expect(privacy).toEqual(expect.arrayContaining(['Konto und Lernfortschritt', 'Anmelden mit Apple, Google oder E-Mail', 'Community (ab 16)']));
    expect(legalText('privacy', 'en').map((x) => x.h)).toEqual(expect.arrayContaining(['Account and progress', 'Sign in with Apple, Google or email', 'Community (16+)']));
  });

  it('explain deleting the account', () => {
    expect(legalText('privacy', 'de').find((x) => x.h === 'Speicherdauer und Löschung')!.body).toContain('»Konto löschen«');
    expect(legalText('privacy', 'en').find((x) => x.h === 'Retention and deletion')!.body).toContain('“Delete account”');
  });

  it('name no AI provider (the operator adds it at runtime from the server)', () => {
    for (const p of pages) for (const l of ['de', 'en']) expect(legalText(p, l).map((x) => x.body).join(' ')).not.toMatch(/DeepSeek|OpenRouter/);
  });

  it('show a placeholder while no operator is configured', () => {
    expect(legalText('imprint', 'de')[0].body).toContain('[Betreiber noch nicht eingetragen]');
    expect(legalText('imprint', 'en')[0].body).toContain('[operator not configured]');
  });

  it('the deletion page (Google Play) shows the steps and what is deleted or kept', () => {
    for (const l of ['de', 'en']) {
      const text = legalText('delete', l).map((x) => `${x.h}\n${x.body}`).join('\n');
      expect(text).toContain('Lumen – Microlearning');
      expect(text).toContain(l === 'de' ? '**Konto löschen**' : '**Delete account**');
      expect(text).toMatch(l === 'de' ? /Was gelöscht wird[\s\S]*Was bleibt/ : /What is deleted[\s\S]*What is kept/);
      expect(text).toMatch(/90/);
    }
  });
});
