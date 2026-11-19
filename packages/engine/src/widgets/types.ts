import type { z } from 'zod';

export type Locale = string;

export interface WidgetContext {
  locale: Locale;
  /** Seed for deterministic shuffles inside init(). */
  seed: number;
}

export interface LintIssue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
}

/**
 * The widget contract. All functions are pure so that the same definition
 * serves the UI, the CI evals, the authoring tools and (later) the tutor.
 *  - init/applyAction: state machine
 *  - checkAnswer/isSolved: validation
 *  - solve: reference solver for evals
 *  - describe: text for screen readers and LLM context
 */
export interface WidgetDefinition<P = any, S = any, A = any, Ans = any> {
  kind: string;
  title: { de: string; en: string };
  params: z.ZodType<P>;
  answer?: z.ZodType<Ans>;
  /** Whether the widget can be used as a problem (false = display only). */
  interactive: boolean;
  init(params: P, ctx: WidgetContext): S;
  applyAction(state: S, action: A, params: P): S;
  /** Enumerates actions that are currently possible (used for fuzzing and search). */
  actions?(state: S, params: P): A[];
  /** Whether enough input exists to press "Prüfen". */
  isAnswered?(state: S, params: P): boolean;
  /** Validation against an author-provided `answer`. */
  checkAnswer?(state: S, answer: Ans, params: P): boolean;
  /** Intrinsic goal of the widget (e.g. puzzle solved) when no answer/predicate is given. */
  isSolved?(state: S, params: P): boolean;
  /** Automatic, widget-specific feedback for a wrong state (misconceptions). */
  diagnose?(state: S, answer: Ans | undefined, params: P, locale: Locale): string | null;
  /** Reference solution, or null if the widget relies on generic search. */
  solve?(params: P, answer: Ans | undefined, ctx: WidgetContext): S | null;
  /** Number of distinct correct solutions (for uniqueness evals). */
  countSolutions?(params: P, answer: Ans | undefined): number;
  /** Whether a correct state must be unique for this widget (e.g. single choice, logic grid). */
  requiresUnique?(params: P): boolean;
  describe(state: S, params: P, locale: Locale): string;
  /** Invariants that must hold for every reachable state (checked by fuzzing). */
  validateState?(state: S, params: P): string[];
  /** Static, widget-specific content checks (layout/legibility/consistency). */
  lint?(params: P, answer: Ans | undefined, locale: Locale): LintIssue[];
  /** Extra values merged into predicate scope, e.g. derived quantities. */
  scope?(state: S, params: P): Record<string, unknown>;
  /** The value that must not leak to the learner before solving (for a tutor output filter). */
  secret?(params: P, answer: Ans | undefined): string[];
}

export const t = (locale: Locale, de: string, en: string): string => (locale.startsWith('de') ? de : en);
