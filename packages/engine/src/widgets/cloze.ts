import { z } from 'zod';
import { hashString, mulberry32, shuffle } from '../rng.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Fill-in-the-gaps ("Lückentext"). Gaps are written as [[word]] in the text;
 * the learner taps words from a shuffled bank (answers + distractors).
 */
const Params = z.object({
  text: z.string().min(1),
  distractors: z.array(z.string().min(1)).max(6).default([]),
}).strict();

export type ClozeParams = z.infer<typeof Params>;
export interface ClozeState {
  /** Per gap: index into the word bank, or null. */
  fills: (number | null)[];
}
export type ClozeAction = { type: 'put'; word: number } | { type: 'fill'; gap: number; word: number } | { type: 'clear'; gap: number } | { type: 'reset' };

const GAP = /\[\[([^\]]+)\]\]/g;

/** Text segments and gap answers: segments.length === answers.length + 1. */
export function clozeParts(p: ClozeParams): { segments: string[]; answers: string[] } {
  const segments: string[] = [];
  const answers: string[] = [];
  let last = 0;
  for (const m of p.text.matchAll(GAP)) {
    segments.push(p.text.slice(last, m.index));
    answers.push(m[1].trim());
    last = m.index! + m[0].length;
  }
  segments.push(p.text.slice(last));
  return { segments, answers };
}

/** The shuffled word bank (stable per text). */
export function clozeBank(p: ClozeParams): string[] {
  const { answers } = clozeParts(p);
  return shuffle([...answers, ...p.distractors], mulberry32(hashString(p.text)));
}

const correctCount = (s: ClozeState, p: ClozeParams) => {
  const bank = clozeBank(p);
  return clozeParts(p).answers.filter((a, i) => s.fills[i] !== null && bank[s.fills[i]!] === a).length;
};

export const clozeWidget: WidgetDefinition<ClozeParams, ClozeState, ClozeAction> = {
  kind: 'cloze',
  title: { de: 'Lückentext', en: 'Fill the gaps' },
  params: Params,
  interactive: true,
  autoHints: true,
  init: (p) => ({ fills: clozeParts(p).answers.map(() => null) }),
  applyAction(s, a, p) {
    const n = clozeBank(p).length;
    if (a.type === 'reset') return { fills: s.fills.map(() => null) };
    if (a.type === 'clear') return a.gap >= 0 && a.gap < s.fills.length ? { fills: s.fills.map((v, i) => (i === a.gap ? null : v)) } : s;
    if (!Number.isInteger(a.word) || a.word < 0 || a.word >= n || s.fills.includes(a.word)) return s;
    const gap = a.type === 'put' ? s.fills.indexOf(null) : a.gap;
    if (gap < 0 || gap >= s.fills.length) return s;
    return { fills: s.fills.map((v, i) => (i === gap ? a.word : v)) };
  },
  actions(s, p) {
    const out: ClozeAction[] = [];
    clozeBank(p).forEach((_w, word) => {
      if (!s.fills.includes(word)) out.push({ type: 'put', word });
    });
    s.fills.forEach((v, gap) => {
      if (v !== null) out.push({ type: 'clear', gap });
    });
    return out;
  },
  isAnswered: (s) => s.fills.every((v) => v !== null),
  isSolved: (s, p) => correctCount(s, p) === s.fills.length,
  diagnose(s, _a, p, locale) {
    const n = correctCount(s, p);
    return t(locale, `${n} von ${s.fills.length} Lücken stimmen. Tippe ein Wort im Text an, um es zurückzulegen.`, `${n} of ${s.fills.length} gaps are right. Tap a word in the text to put it back.`);
  },
  solve(p) {
    const bank = clozeBank(p);
    const used = new Set<number>();
    return {
      fills: clozeParts(p).answers.map((a) => {
        const i = bank.findIndex((w, k) => w === a && !used.has(k));
        used.add(i);
        return i;
      }),
    };
  },
  countSolutions: () => 1,
  scope: (s, p) => ({ correct: correctCount(s, p) }),
  describe(s, p, locale) {
    const { segments } = clozeParts(p);
    const bank = clozeBank(p);
    const text = segments.map((seg, i) => (i < s.fills.length ? `${seg}[${s.fills[i] === null ? '___' : bank[s.fills[i]!]}]` : seg)).join('');
    const free = bank.filter((_w, i) => !s.fills.includes(i));
    return t(locale, `Lückentext: ${text} Wörter zur Auswahl: ${free.join(', ') || 'keine mehr'}.`, `Gap text: ${text} Words to choose from: ${free.join(', ') || 'none left'}.`);
  },
  validateState(s, p) {
    const n = clozeBank(p).length;
    const used = s.fills.filter((v) => v !== null);
    if (used.some((v) => v! < 0 || v! >= n)) return ['unknown word'];
    return new Set(used).size === used.length ? [] : ['word used twice'];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const { answers } = clozeParts(p);
    if (!answers.length) issues.push({ level: 'error', code: 'cloze.no-gap', message: t(locale, 'Lückentext ohne [[Lücke]].', 'Cloze without a [[gap]].') });
    if (answers.length > 5) issues.push({ level: 'warning', code: 'cloze.many', message: t(locale, 'Mehr als 5 Lücken sind unübersichtlich.', 'More than 5 gaps are hard to follow.') });
    for (const d of p.distractors) if (answers.includes(d)) issues.push({ level: 'error', code: 'cloze.distractor', message: `Distraktor »${d}« ist auch eine Lösung.` });
    if (answers.length === 1 && !p.distractors.length) issues.push({ level: 'error', code: 'cloze.trivial', message: t(locale, 'Eine Lücke ohne Distraktoren ist keine Aufgabe.', 'One gap without distractors is no task.') });
    return issues;
  },
};
