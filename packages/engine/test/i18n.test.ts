import { describe, expect, it } from 'vitest';
import { compileContent } from '../src/compile.ts';

const de = `
id: t.c
type: concept
title: Brüche
locale: de
license: CC-BY-SA-4.0
authors: [a]
estimated_minutes: 3
steps:
  - kind: problem
    id: p1
    widget: numeric
    prompt: Wie viel ist {{a}} + 2?
    variants: { params: { a: "int[1,5]" }, defaults: { a: 3 } }
    answer: { value: "{{a + 2}}" }
    hints: [Zähle weiter.]
    feedback:
      - when: "value == a"
        text: Du hast {{a}} nur abgeschrieben.
`;
const en = (over: Record<string, string> = {}) => {
  let s = de.replace('locale: de', 'locale: en').replace('title: Brüche', 'title: Fractions')
    .replace('Wie viel ist {{a}} + 2?', 'What is {{a}} + 2?').replace('Zähle weiter.', 'Keep counting.')
    .replace('Du hast {{a}} nur abgeschrieben.', 'You just copied {{a}}.');
  for (const [a, b] of Object.entries(over)) s = s.replace(a, b);
  return s;
};
const run = (enText: string) => compileContent([{ path: 'c.yaml', text: de }, { path: 'c.en.yaml', text: enText }], 'en');

describe('translations', () => {
  it('picks the translation and accepts a faithful one', () => {
    const { course, issues } = run(en());
    expect(course.concepts['t.c'].title).toBe('Fractions');
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });
  it('falls back to the original and reports the gap', () => {
    const { course, issues } = compileContent([{ path: 'c.yaml', text: de }], 'en');
    expect(course.concepts['t.c'].title).toBe('Brüche');
    expect(issues.map((i) => i.code)).toContain('i18n.missing');
  });
  it.each([
    ['changed condition', { 'value == a': 'value == 2' }],
    ['lost template', { 'What is {{a}} + 2?': 'What is a + 2?' }],
    ['changed variant', { 'int[1,5]': 'int[1,6]' }],
    ['changed number', { 'a: 3 }': 'a: 4 }' }],
    ['changed step id', { 'id: p1': 'id: q1' }],
    ['dropped hint', { 'hints: [Keep counting.]': 'hints: []' }],
  ])('rejects a %s', (_, over) => {
    expect(run(en(over)).issues.map((i) => i.code)).toContain('i18n.parity');
  });
});
