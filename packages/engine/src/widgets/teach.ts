import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * "Erklär's Lux" – the learner explains an idea in their own words (Feynman
 * technique). The engine checks deterministically that the key ideas appear
 * (keyword groups with synonyms); Lux then responds to the wording itself.
 */
const Params = z.object({
  /** Key ideas; each group lists synonyms/stems, one of which must appear. */
  keywords: z.array(z.array(z.string().min(2)).min(1)).min(1).max(6),
  /** How many groups must be hit (default: all but one, at least one). */
  min: z.number().int().min(1).optional(),
  /** A model answer, shown as the solution. */
  sample: z.string().min(1),
  placeholder: z.string().optional(),
}).strict();

export type TeachParams = z.infer<typeof Params>;
export interface TeachState {
  input: string;
}
export type TeachAction = { type: 'input'; value: string };

export const TEACH_MAX = 600;

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');

export const teachNeeded = (p: TeachParams) => Math.min(p.keywords.length, p.min ?? Math.max(1, p.keywords.length - 1));

/** Which keyword groups the text covers. */
export function teachHits(input: string, p: TeachParams): boolean[] {
  const text = norm(input);
  return p.keywords.map((group) => group.some((k) => text.includes(norm(k))));
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export const teachWidget: WidgetDefinition<TeachParams, TeachState, TeachAction> = {
  kind: 'teach',
  title: { de: 'Erklär’s Lux', en: 'Teach Lux' },
  params: Params,
  interactive: true,
  autoHints: true,
  init: () => ({ input: '' }),
  applyAction: (s, a) => (a.type === 'input' && typeof a.value === 'string' ? { input: a.value.slice(0, TEACH_MAX) } : s),
  actions: (_s, p) => ['', 'hm', 'Ich weiß es nicht genau.', p.keywords[0][0], p.sample].map((value) => ({ type: 'input' as const, value })),
  isAnswered: (s) => words(s.input) >= 3,
  isSolved: (s, p) => teachHits(s.input, p).filter(Boolean).length >= teachNeeded(p),
  diagnose(s, _a, p, locale) {
    const h = teachHits(s.input, p);
    const missing = p.keywords.filter((_g, i) => !h[i]).map((g) => g[0]);
    const n = h.filter(Boolean).length;
    return t(
      locale,
      `Guter Anfang – ${n} von ${p.keywords.length} Kernideen sind drin. Bring noch unter: ${missing.slice(0, 2).join(', ')}.`,
      `Good start – ${n} of ${p.keywords.length} key ideas are in. Try to include: ${missing.slice(0, 2).join(', ')}.`,
    );
  },
  solve: (p) => ({ input: p.sample }),
  scope: (s, p) => ({ hits: teachHits(s.input, p).filter(Boolean).length, words: words(s.input) }),
  describe(s, p, locale) {
    const h = teachHits(s.input, p).filter(Boolean).length;
    return s.input.trim()
      ? t(locale, `Eigene Erklärung (${h} von ${p.keywords.length} Kernideen): »${s.input.trim()}«`, `Own explanation (${h} of ${p.keywords.length} key ideas): "${s.input.trim()}"`)
      : t(locale, 'Textfeld für die eigene Erklärung, noch leer.', 'Text field for your own explanation, empty.');
  },
  validateState: (s) => (typeof s.input === 'string' && s.input.length <= TEACH_MAX ? [] : ['input too long']),
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const h = teachHits(p.sample, p);
    if (h.filter(Boolean).length < teachNeeded(p)) issues.push({ level: 'error', code: 'teach.sample', message: t(locale, 'Die Musterantwort trifft die eigenen Schlüsselwörter nicht.', 'The sample answer misses its own keywords.') });
    else if (h.some((x) => !x)) issues.push({ level: 'warning', code: 'teach.sample-partial', message: `Musterantwort ohne: ${p.keywords.filter((_g, i) => !h[i]).map((g) => g[0]).join(', ')}` });
    return issues;
  },
};
