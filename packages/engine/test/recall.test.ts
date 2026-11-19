import { describe, expect, it } from 'vitest';
import { RECALL_GAP, keyTerms, recallCheck, recallPool } from '../src/recall.ts';

const step = (body: string, extra: Record<string, unknown> = {}) => ({ id: 't/s1', body, ...extra }) as Parameters<typeof recallCheck>[0];
const POOL = ['Warteschlange', 'Suchbaum', 'Hash-Tabelle', 'Liste', 'Stapel'];

describe('recall check on explain screens', () => {
  it('finds key terms but skips formulas, numbers and mere emphasis', () => {
    expect(keyTerms('Ein **Stapel** (Stack) ist wie ein Tellerstapel. Das gilt für **alle**. **U = π · d.** Etwa **75 %**.')).toEqual(['Stapel']);
    expect(keyTerms('Das **Gesetz der großen Zahlen** und die **Laplace-Regel**.')).toEqual(['Gesetz der großen Zahlen', 'Laplace-Regel']);
    expect(keyTerms('Kein Fettdruck.')).toEqual([]);
  });

  it('blanks the term and offers it with two other terms of the course', () => {
    const c = recallCheck(step('Ein **Stapel** arbeitet wie ein Tellerstapel. Der Stapel wächst nach oben.'), POOL)!;
    expect(c.answer).toBe('Stapel');
    expect(c.options).toHaveLength(3);
    expect(c.options).toContain('Stapel');
    expect(new Set(c.options).size).toBe(3);
    expect(c.text).toContain(`**${RECALL_GAP}**`);
    // the answer is hidden everywhere, not only where it was bold
    expect(c.text).not.toMatch(/\bStapel\b/);
  });

  it('is stable for a step and never offers a second defensible answer', () => {
    const body = 'Eine **Säure** gibt Wasserstoff-Ionen ab.';
    const pool = ['Säuren', 'Säure', 'Base', 'Indikator', 'Neutralisation', 'Wasserstoff-Ionen'];
    const a = recallCheck(step(body), pool)!;
    expect(recallCheck(step(body), pool)).toEqual(a);
    expect(a.options).not.toContain('Säuren'); // same word in another form
    expect(a.options).not.toContain('Wasserstoff-Ionen'); // already readable in the text
  });

  it('prefers distractors that look like the answer', () => {
    const c = recallCheck(step('Der **Median** teilt die Daten in zwei Hälften.'), ['Gesetz der großen Zahlen', 'Modus', 'Quartil', 'arithmetisches Mittel'])!;
    expect(c.options.sort()).toEqual(['Median', 'Modus', 'Quartil']);
  });

  it('leaves screens alone that are interactive already or lack material', () => {
    expect(recallCheck(step('Ein **Stapel**.', { reveal: { body: 'x' } }), POOL)).toBeNull();
    expect(recallCheck(step('Ein **Stapel**.', { visual: { widget: 'bits', params: {}, interactive: true } }), POOL)).toBeNull();
    expect(recallCheck(step('Ohne Kernbegriff.'), POOL)).toBeNull();
    expect(recallCheck(step('Ein **Stapel**.'), ['Stapel', 'Liste'])).toBeNull();
  });

  it('collects the pool from explanations, prompts and solutions', () => {
    expect(recallPool([{ body: 'Der **Stapel**.' }, { prompt: 'Was ist eine **Warteschlange**?', explanation: 'Wie beim **Stapel**: eine **Liste**.' }]).sort()).toEqual(['Liste', 'Stapel', 'Warteschlange']);
  });
});
