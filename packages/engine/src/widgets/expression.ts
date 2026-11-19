import { z } from 'zod';
import { containsGroup, isFactored, mathEquivalent, parseMath, type MathNode } from '../math.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Params = z.object({
  variables: z.array(z.string().min(1)).default(['x']),
  placeholder: z.string().optional(),
  prefix: z.string().optional(),
});

const Answer = z.object({
  equivalentTo: z.string().min(1),
  /** expanded: no parentheses; factored: a product with a parenthesised factor */
  form: z.enum(['any', 'expanded', 'factored']).default('any'),
});

export type ExpressionParams = z.infer<typeof Params>;
export type ExpressionAnswer = z.input<typeof Answer>;
export interface ExpressionState {
  input: string;
}
export type ExpressionAction = { type: 'input'; value: string };

function tryParse(input: string, vars: string[]): MathNode | null {
  try {
    return parseMath(input, vars);
  } catch {
    return null;
  }
}

function formOk(node: MathNode, form: ExpressionAnswer['form']): boolean {
  if (form === 'expanded') return !containsGroup(node);
  if (form === 'factored') return isFactored(node);
  return true;
}

export const expressionWidget: WidgetDefinition<ExpressionParams, ExpressionState, ExpressionAction, ExpressionAnswer> = {
  kind: 'expression',
  title: { de: 'Term-Eingabe', en: 'Expression input' },
  params: Params,
  answer: Answer as unknown as z.ZodType<ExpressionAnswer>,
  interactive: true,
  init: () => ({ input: '' }),
  applyAction: (s, a) => (a.type === 'input' ? { input: a.value.slice(0, 80) } : s),
  actions: (_s, p) => ['', 'x', '2x+1', '(x+1)(x-1)', ')(', `${p.variables[0]}*0`].map((value) => ({ type: 'input' as const, value })),
  isAnswered: (s) => s.input.trim().length > 0,
  checkAnswer(s, a, p) {
    const n = tryParse(s.input, p.variables);
    if (!n) return false;
    return mathEquivalent(n, a.equivalentTo, p.variables) && formOk(n, a.form ?? 'any');
  },
  diagnose(s, a, p, locale) {
    if (!a) return null;
    const n = tryParse(s.input, p.variables);
    if (!n) return t(locale, 'Diesen Term kann ich nicht lesen. Prüfe Klammern und Rechenzeichen (z. B. 2x + 3 oder 3(x - 1)).', "I can't read that expression. Check brackets and operators (e.g. 2x + 3 or 3(x - 1)).");
    if (mathEquivalent(n, a.equivalentTo, p.variables) && !formOk(n, a.form ?? 'any')) {
      return a.form === 'expanded'
        ? t(locale, 'Gleichwertig – aber löse die Klammern noch auf.', 'Equivalent – but expand the brackets.')
        : t(locale, 'Gleichwertig – aber schreibe den Term als Produkt mit Klammer.', 'Equivalent – but write it as a product with brackets.');
    }
    return null;
  },
  solve: (_p, a) => (a ? { input: a.equivalentTo } : null),
  countSolutions: () => 1,
  describe: (s, _p, locale) =>
    s.input ? t(locale, `Term-Eingabe: ${s.input}.`, `Expression input: ${s.input}.`) : t(locale, 'Term-Eingabe, noch leer.', 'Expression input, empty.'),
  validateState: (s) => (s.input.length <= 80 ? [] : ['input too long']),
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    if (!a) return [{ level: 'error', code: 'expression.no-answer', message: t(locale, 'Term-Eingabe ohne answer.equivalentTo.', 'Missing answer.equivalentTo.') }];
    const n = tryParse(a.equivalentTo, p.variables);
    if (!n) issues.push({ level: 'error', code: 'expression.bad-answer', message: `answer.equivalentTo nicht lesbar: ${a.equivalentTo}` });
    else if (!formOk(n, a.form ?? 'any')) issues.push({ level: 'error', code: 'expression.answer-form', message: 'Die Musterlösung hat selbst nicht die verlangte Form.' });
    return issues;
  },
  secret: (_p, a) => (a ? [a.equivalentTo] : []),
};
