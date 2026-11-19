import { z } from 'zod';
import { formatFraction, isSimplified, parseNumber, resolveNumber, toFraction } from '../math.ts';
import { formatNumber } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Params = z.object({
  unit: z.string().optional(),
  placeholder: z.string().optional(),
  prefix: z.string().optional(),
  /** Show an on-screen keypad instead of relying on the system keyboard. */
  keypad: z.boolean().default(true),
});

const Answer = z.object({
  value: z.union([z.number(), z.string()]),
  tolerance: z.number().min(0).default(0),
  /** any: every notation; fraction: a/b (or integer); simplified: fully reduced fraction; integer; decimal */
  form: z.enum(['any', 'fraction', 'simplified', 'integer', 'decimal']).default('any'),
});

export type NumericParams = z.infer<typeof Params>;
export type NumericAnswer = z.input<typeof Answer>;
export interface NumericState {
  input: string;
}
export type NumericAction = { type: 'input'; value: string };

function target(a: NumericAnswer): number {
  return resolveNumber(a.value);
}

function valueMatches(input: string, a: NumericAnswer): boolean {
  const p = parseNumber(input);
  if (!p) return false;
  const tol = a.tolerance ?? 0;
  return Math.abs(p.value - target(a)) <= Math.max(tol, 1e-9 * Math.max(1, Math.abs(p.value)));
}

function formMatches(input: string, a: NumericAnswer): boolean {
  const p = parseNumber(input);
  if (!p) return false;
  switch (a.form ?? 'any') {
    case 'any': return true;
    case 'integer': return p.kind === 'integer';
    case 'decimal': return p.kind === 'decimal' || p.kind === 'integer';
    case 'fraction': return p.kind === 'fraction' || p.kind === 'integer' || p.kind === 'mixed';
    case 'simplified': return p.kind === 'integer' || ((p.kind === 'fraction' || p.kind === 'mixed') && isSimplified(p));
  }
}

export const numericWidget: WidgetDefinition<NumericParams, NumericState, NumericAction, NumericAnswer> = {
  kind: 'numeric',
  title: { de: 'Zahleneingabe', en: 'Number input' },
  params: Params,
  answer: Answer as unknown as z.ZodType<NumericAnswer>,
  interactive: true,
  init: () => ({ input: '' }),
  applyAction(s, a) {
    if (a.type !== 'input') return s;
    return { input: a.value.slice(0, 32) };
  },
  actions(_s) {
    return ['', '0', '1', '-1', '7', '3/4', '0,5', '1 1/2', 'abc', '2/0'].map((value) => ({ type: 'input' as const, value }));
  },
  isAnswered: (s) => s.input.trim().length > 0,
  checkAnswer(s, a) {
    return valueMatches(s.input, a) && formMatches(s.input, a);
  },
  diagnose(s, a, _p, locale) {
    if (!a) return null;
    const p = parseNumber(s.input);
    if (!p) return t(locale, 'Diese Eingabe kann ich nicht als Zahl lesen. Beispiele: 7, -2, 3/4 oder 0,5.', "I can't read that as a number. Examples: 7, -2, 3/4 or 0.5.");
    if (valueMatches(s.input, a) && !formMatches(s.input, a)) {
      if (a.form === 'simplified') return t(locale, 'Der Wert stimmt – kürze den Bruch aber noch so weit wie möglich.', 'The value is right – but simplify the fraction fully.');
      if (a.form === 'fraction') return t(locale, 'Der Wert stimmt – gib ihn bitte als Bruch an.', 'The value is right – please give it as a fraction.');
      if (a.form === 'integer') return t(locale, 'Gesucht ist eine ganze Zahl.', 'An integer is expected.');
      return t(locale, 'Der Wert stimmt, aber die Schreibweise passt nicht.', 'Right value, wrong notation.');
    }
    const goal = target(a);
    if (Math.abs(p.value + goal) < 1e-9 && goal !== 0) return t(locale, 'Schau noch einmal auf das Vorzeichen.', 'Check the sign.');
    return null;
  },
  solve(_p, a) {
    if (!a) return null;
    const v = target(a);
    if (a.form === 'fraction' || a.form === 'simplified' || (typeof a.value === 'string' && a.value.includes('/'))) {
      const f = toFraction(v);
      if (a.form === 'fraction' && typeof a.value === 'string' && /^\s*-?\d+\s*\/\s*\d+\s*$/.test(a.value)) return { input: a.value.replace(/\s/g, '') };
      return { input: formatFraction(f.num, f.den) };
    }
    return { input: formatNumber(v, 'de') };
  },
  countSolutions: () => 1,
  describe(s, p, locale) {
    const unit = p.unit ? ` ${p.unit}` : '';
    return s.input
      ? t(locale, `Zahlenfeld, Eingabe: ${s.input}${unit}.`, `Number field, input: ${s.input}${unit}.`)
      : t(locale, 'Zahlenfeld, noch leer.', 'Number field, empty.');
  },
  validateState(s) {
    return typeof s.input === 'string' && s.input.length <= 32 ? [] : ['input too long'];
  },
  lint(_p, a, locale) {
    const issues: LintIssue[] = [];
    if (!a) {
      issues.push({ level: 'error', code: 'numeric.no-answer', message: t(locale, 'Zahlenfeld ohne answer.value.', 'Numeric step without answer.value.') });
      return issues;
    }
    try {
      const v = target(a);
      if (!Number.isFinite(v)) issues.push({ level: 'error', code: 'numeric.bad-value', message: `answer.value ergibt keine endliche Zahl (${v}).` });
    } catch (e) {
      issues.push({ level: 'error', code: 'numeric.bad-value', message: `answer.value nicht lesbar: ${(e as Error).message}` });
    }
    return issues;
  },
  secret(_p, a) {
    if (!a) return [];
    const v = target(a);
    const f = toFraction(v);
    return [formatNumber(v, 'de'), formatNumber(v, 'en'), formatFraction(f.num, f.den)];
  },
};
