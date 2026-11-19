import { z } from 'zod';
import { mulberry32, shuffle } from '../rng.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

const Option = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  correct: z.boolean().default(false),
  feedback: z.string().optional(),
}).strict();

const Params = z.object({
  options: z.array(Option).min(2),
  multiple: z.boolean().default(false),
  shuffle: z.boolean().default(true),
  layout: z.enum(['list', 'grid']).default('list'),
});

export type ChoiceParams = z.infer<typeof Params>;
export interface ChoiceState {
  order: string[];
  selected: string[];
}
export type ChoiceAction = { type: 'toggle'; id: string };

export function optionIds(p: ChoiceParams): string[] {
  return p.options.map((o, i) => o.id ?? String.fromCharCode(97 + i));
}

function correctIds(p: ChoiceParams): string[] {
  const ids = optionIds(p);
  return p.options.flatMap((o, i) => (o.correct ? [ids[i]] : []));
}

function labelOf(p: ChoiceParams, id: string): string {
  const ids = optionIds(p);
  return p.options[ids.indexOf(id)]?.label ?? id;
}

export const choiceWidget: WidgetDefinition<ChoiceParams, ChoiceState, ChoiceAction> = {
  kind: 'choice',
  title: { de: 'Auswahl', en: 'Choice' },
  params: Params,
  interactive: true,
  init(p, ctx) {
    const ids = optionIds(p);
    return { order: p.shuffle ? shuffle(ids, mulberry32(ctx.seed)) : ids, selected: [] };
  },
  applyAction(s, a, p) {
    if (a.type !== 'toggle' || !optionIds(p).includes(a.id)) return s;
    if (p.multiple) {
      const selected = s.selected.includes(a.id) ? s.selected.filter((x) => x !== a.id) : [...s.selected, a.id];
      return { ...s, selected };
    }
    return { ...s, selected: s.selected[0] === a.id ? [] : [a.id] };
  },
  actions(_s, p) {
    return optionIds(p).map((id) => ({ type: 'toggle' as const, id }));
  },
  isAnswered: (s) => s.selected.length > 0,
  isSolved(s, p) {
    const want = correctIds(p).sort();
    return [...s.selected].sort().join('|') === want.join('|');
  },
  diagnose(s, _a, p, locale) {
    const ids = optionIds(p);
    if (!p.multiple) {
      const opt = p.options[ids.indexOf(s.selected[0])];
      return opt && !opt.correct && opt.feedback ? opt.feedback : null;
    }
    const want = new Set(correctIds(p));
    const wrong = s.selected.filter((id) => !want.has(id));
    const firstWithFeedback = wrong.map((id) => p.options[ids.indexOf(id)]).find((o) => o?.feedback);
    if (firstWithFeedback) return firstWithFeedback.feedback!;
    const missing = [...want].filter((id) => !s.selected.includes(id)).length;
    if (!wrong.length && missing) {
      return t(locale, `Fast: Es fehlt noch ${missing === 1 ? 'eine richtige Antwort' : `${missing} richtige Antworten`}.`, `Almost: ${missing} correct option(s) missing.`);
    }
    return null;
  },
  solve(p) {
    const ids = optionIds(p);
    return { order: ids, selected: correctIds(p) };
  },
  countSolutions(p) {
    return p.multiple ? (correctIds(p).length > 0 ? 1 : 0) : correctIds(p).length;
  },
  requiresUnique: () => true,
  describe(s, p, locale) {
    const opts = s.order.map((id, i) => `${String.fromCharCode(65 + i)}) ${labelOf(p, id)}`).join('; ');
    const sel = s.selected.length ? s.selected.map((id) => labelOf(p, id)).join(', ') : t(locale, 'nichts', 'nothing');
    return t(locale, `Auswahl (${p.multiple ? 'mehrere möglich' : 'eine Antwort'}): ${opts}. Ausgewählt: ${sel}.`, `Choice (${p.multiple ? 'multiple' : 'single'}): ${opts}. Selected: ${sel}.`);
  },
  validateState(s, p) {
    const ids = optionIds(p);
    const errs: string[] = [];
    if (s.selected.some((id) => !ids.includes(id))) errs.push('unknown option selected');
    if (!p.multiple && s.selected.length > 1) errs.push('more than one option in single choice');
    if (new Set(s.selected).size !== s.selected.length) errs.push('duplicate selection');
    return errs;
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const labels = p.options.map((o) => o.label.trim().toLowerCase());
    if (new Set(labels).size !== labels.length) issues.push({ level: 'error', code: 'choice.duplicate-label', message: t(locale, 'Zwei Antwortoptionen haben denselben Text.', 'Two options share the same label.') });
    const ids = optionIds(p);
    if (new Set(ids).size !== ids.length) issues.push({ level: 'error', code: 'choice.duplicate-id', message: 'Doppelte Options-ID.' });
    if (p.options.length > 6) issues.push({ level: 'warning', code: 'choice.too-many', message: t(locale, 'Mehr als 6 Optionen sind auf dem Handy schwer erfassbar.', 'More than 6 options are hard to scan on mobile.') });
    const wrongWithoutFeedback = p.options.filter((o) => !o.correct && !o.feedback).length;
    if (wrongWithoutFeedback > 0 && p.options.some((o) => o.feedback)) {
      issues.push({ level: 'info', code: 'choice.partial-feedback', message: t(locale, 'Nicht alle falschen Optionen haben gezieltes Feedback.', 'Not all wrong options have targeted feedback.') });
    }
    return issues;
  },
  secret(p) {
    return correctIds(p).map((id) => labelOf(p, id));
  },
};
