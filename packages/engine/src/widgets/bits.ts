import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * A row of switchable bits with place values. Shows the decimal value live.
 * Answer `{ value }` or predicates on `value`, `ones`, `bitstr`.
 */
const Params = z.object({
  bits: z.number().int().min(1).max(12).default(4),
  /** Initial bits, MSB first, e.g. "0101". */
  initial: z.string().regex(/^[01]+$/).optional(),
  /** Show place values above the switches. */
  placeValues: z.boolean().default(true),
  /** Show the decimal value (turn off when the value is what is asked). */
  showValue: z.boolean().default(true),
  /** Bits that cannot be changed (indices, MSB = 0). */
  locked: z.array(z.number().int()).default([]),
  /** Optional caption per bit, e.g. lamp names. */
  labels: z.array(z.string()).optional(),
});
const Answer = z.object({ value: z.union([z.number(), z.string()]) });

export type BitsParams = z.infer<typeof Params>;
export type BitsAnswer = z.input<typeof Answer>;
export interface BitsState {
  bits: number[];
}
export type BitsAction = { type: 'toggle'; index: number } | { type: 'clear' };

export const bitsValue = (bits: number[]) => bits.reduce((v, b) => v * 2 + b, 0);
export const toBits = (value: number, n: number) => Array.from({ length: n }, (_, i) => (Math.floor(value / 2 ** (n - 1 - i)) % 2 + 2) % 2);

export const bitsWidget: WidgetDefinition<BitsParams, BitsState, BitsAction, BitsAnswer> = {
  kind: 'bits',
  title: { de: 'Bits', en: 'Bits' },
  params: Params,
  answer: Answer as unknown as z.ZodType<BitsAnswer>,
  interactive: true,
  init: (p) => ({ bits: Array.from({ length: p.bits }, (_, i) => (p.initial?.[i] === '1' ? 1 : 0)) }),
  applyAction(s, a, p) {
    if (a.type === 'clear') return { bits: s.bits.map((b, i) => (p.locked.includes(i) ? b : 0)) };
    if (a.index < 0 || a.index >= s.bits.length || p.locked.includes(a.index)) return s;
    const bits = [...s.bits];
    bits[a.index] = 1 - bits[a.index];
    return { bits };
  },
  actions: (s, p) => s.bits.map((_, i) => ({ type: 'toggle' as const, index: i })).filter((a) => !p.locked.includes(a.index)),
  isAnswered: () => true,
  checkAnswer: (s, a) => bitsValue(s.bits) === Number(a.value),
  diagnose(s, a, _p, locale) {
    if (!a) return null;
    const v = bitsValue(s.bits);
    const target = Number(a.value);
    return v > target ? t(locale, `Das ergibt ${v} – zu viel.`, `That makes ${v} – too much.`) : t(locale, `Das ergibt ${v} – es fehlt noch ${target - v}.`, `That makes ${v} – ${target - v} missing.`);
  },
  solve(p, a) {
    if (!a) return null;
    const v = Number(a.value);
    if (!Number.isInteger(v) || v < 0 || v >= 2 ** p.bits) return null;
    return { bits: toBits(v, p.bits) };
  },
  countSolutions: () => 1,
  scope: (s) => ({ value: bitsValue(s.bits), ones: s.bits.filter((b) => b === 1).length, bitstr: s.bits.join(''), bits: s.bits }),
  describe(s, p, locale) {
    const v = bitsValue(s.bits);
    return t(locale, `${p.bits} Bits: ${s.bits.join('')}${p.showValue ? `, das ist ${v}` : ''}.`, `${p.bits} bits: ${s.bits.join('')}${p.showValue ? `, that is ${v}` : ''}.`);
  },
  validateState: (s, p) => (s.bits.length === p.bits && s.bits.every((b) => b === 0 || b === 1) ? [] : ['bits']),
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (p.initial && p.initial.length !== p.bits) issues.push({ level: 'error', code: 'bits.initial', message: 'initial muss genau so lang sein wie bits.' });
    if (a && (Number(a.value) >= 2 ** p.bits || Number(a.value) < 0)) issues.push({ level: 'error', code: 'bits.range', message: t(locale, 'Der Zielwert passt nicht in die Bits.', 'Target does not fit into the bits.') });
    if (p.bits > 8) issues.push({ level: 'info', code: 'visual.dense', message: t(locale, 'Mehr als 8 Bits werden auf dem Handy eng.', 'More than 8 bits get tight on phones.') });
    return issues;
  },
};
