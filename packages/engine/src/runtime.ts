/**
 * Runtime: turns an authored problem step into a concrete instance (variant +
 * parsed widget params) and checks learner states against it.
 */
import { evaluatePredicate, interpolateDeep } from './expr.ts';
import type { ProblemStep } from './schema.ts';
import { sampleVariant } from './variants.ts';
import { getWidget } from './widgets/registry.ts';
import type { WidgetDefinition } from './widgets/types.ts';

export interface ResolvedProblem {
  step: ProblemStep;
  widget: WidgetDefinition;
  seed: number;
  locale: string;
  vars: Record<string, unknown>;
  params: any;
  answer: any;
  prompt: string;
  body?: string;
  visual?: { widget: string; params: Record<string, unknown>; interactive: boolean; alt?: string };
  hints: string[];
  explanation?: string;
  feedback: ProblemStep['feedback'];
}

export interface CheckResult {
  correct: boolean;
  feedback: { text: string; misconception?: string } | null;
}

export function resolveProblem(step: ProblemStep, seed = 0, locale = 'de'): ResolvedProblem {
  const widget = getWidget(step.widget);
  if (!widget) throw new Error(`Unbekanntes Widget »${step.widget}«`);
  const vars = step.variants ? sampleVariant(step.variants, seed) : {};
  const scope = { ...vars, vars };
  const ip = <T>(v: T) => interpolateDeep(v, scope, locale);
  const params = widget.params.parse(ip(step.params ?? {}));
  const rawAnswer = step.answer === undefined ? undefined : ip(step.answer);
  const answer = rawAnswer !== undefined && widget.answer ? widget.answer.parse(rawAnswer) : rawAnswer;
  return {
    step,
    widget,
    seed,
    locale,
    vars,
    params,
    answer,
    prompt: ip(step.prompt),
    body: step.body ? ip(step.body) : undefined,
    visual: step.visual ? { ...step.visual, params: ip(step.visual.params) } : undefined,
    hints: ip(step.hints ?? []),
    explanation: step.explanation ? ip(step.explanation) : undefined,
    feedback: ip(step.feedback ?? []),
  };
}

export function initialState(rp: ResolvedProblem): unknown {
  return rp.widget.init(rp.params, { locale: rp.locale, seed: rp.seed + 1 });
}

export function predicateScope(rp: ResolvedProblem, state: unknown): Record<string, unknown> {
  return {
    ...rp.vars,
    ...(rp.widget.scope?.(state, rp.params) ?? {}),
    vars: rp.vars,
    params: rp.params,
    state,
  };
}

/** Pure correctness check. Throws if the step has no usable criterion or a predicate is broken. */
export function isCorrect(rp: ResolvedProblem, state: unknown): boolean {
  const { step, widget } = rp;
  if (step.check?.predicate) return evaluatePredicate(step.check.predicate, predicateScope(rp, state));
  if (rp.answer !== undefined && widget.checkAnswer) return widget.checkAnswer(state, rp.answer, rp.params);
  if (widget.isSolved) return widget.isSolved(state, rp.params);
  throw new Error(`Step ${step.id}: kein Prüfkriterium (check, answer oder Widget-Ziel)`);
}

export function checkProblem(rp: ResolvedProblem, state: unknown): CheckResult {
  const correct = isCorrect(rp, state);
  if (correct) return { correct, feedback: null };
  const scope = predicateScope(rp, state);
  for (const rule of rp.feedback) {
    try {
      if (evaluatePredicate(rule.when, scope)) return { correct, feedback: { text: rule.text, misconception: rule.misconception } };
    } catch {
      // broken rules are reported by the evals; at runtime we fall through
    }
  }
  const auto = rp.widget.diagnose?.(state, rp.answer, rp.params, rp.locale);
  return { correct, feedback: auto ? { text: auto } : null };
}

export function isAnswered(rp: ResolvedProblem, state: unknown): boolean {
  return rp.widget.isAnswered ? rp.widget.isAnswered(state, rp.params) : true;
}

export function describeState(rp: ResolvedProblem, state: unknown): string {
  return rp.widget.describe(state, rp.params, rp.locale);
}
