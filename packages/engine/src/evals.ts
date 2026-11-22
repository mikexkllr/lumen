/**
 * Content evals (run locally via `lumen check` and in CI). Dimensions:
 *  schema · references · license · solvability (reference solver) · not trivial ·
 *  uniqueness · fuzzing for impossible states · feedback rules · layout lint ·
 *  readability · words per screen · alt texts · variants.
 */
import { checkSyntax, evaluatePredicate } from './expr.ts';
import type { Course, Issue } from './compile.ts';
import { readingEase, wordCount } from './readability.ts';
import { mulberry32 } from './rng.ts';
import { initialState, isCorrect, predicateScope, resolveProblem, type ResolvedProblem } from './runtime.ts';
import { levelIndex, type Concept, type ProblemStep } from './schema.ts';
import { referenceSolve, searchSolutions, stableKey } from './solver.ts';
import { getWidget } from './widgets/registry.ts';

export const REQUIRED_LICENSE = 'CC-BY-SA-4.0';
export const MAX_WORDS_PER_SCREEN = 40;
export const MIN_READING_EASE = 40;

export interface EvalOptions {
  /** Extra variant seeds per problem (besides the lesson variant). */
  variantSamples?: number;
  fuzzRuns?: number;
  fuzzDepth?: number;
}

export interface EvalStats {
  paths: number;
  topics: number;
  concepts: number;
  steps: number;
  problems: number;
  byWidget: Record<string, number>;
  solvedBy: Record<string, number>;
  checkedInstances: number;
}

export interface EvalReport {
  issues: Issue[];
  stats: EvalStats;
}

function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (n: string): string[] | null => {
    if (state.get(n) === 2) return null;
    if (state.get(n) === 1) return [...stack.slice(stack.indexOf(n)), n];
    state.set(n, 1);
    stack.push(n);
    for (const m of graph.get(n) ?? []) {
      const c = visit(m);
      if (c) return c;
    }
    stack.pop();
    state.set(n, 2);
    return null;
  };
  for (const n of graph.keys()) {
    const c = visit(n);
    if (c) return c;
  }
  return null;
}

function safely<T>(f: () => T): { ok: true; value: T } | { ok: false; error: string } {
  try {
    return { ok: true, value: f() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Evaluates one problem step (all checked variants). Exported for tests and the authoring preview. */
export function evalProblem(step: ProblemStep, ctx: { concept?: string; file?: string; locale: string; assessment?: boolean }, opts: EvalOptions = {}, stats?: EvalStats): Issue[] {
  const issues: Issue[] = [];
  const at = { concept: ctx.concept, file: ctx.file, step: step.id };
  const push = (level: Issue['level'], code: string, message: string) => issues.push({ level, code, message, ...at });

  const widget = getWidget(step.widget);
  if (!widget) {
    push('error', 'widget.unknown', `Unbekanntes Widget »${step.widget}«.`);
    return issues;
  }
  if (!widget.interactive) push('error', 'widget.not-interactive', `${step.widget} kann nicht als Aufgabe verwendet werden.`);

  for (const src of [step.check?.predicate, ...step.feedback.map((f) => f.when), ...(step.variants?.constraints ?? []), ...Object.values(step.variants?.derive ?? {})]) {
    if (!src) continue;
    const err = checkSyntax(src);
    if (err) push('error', 'predicate.syntax', err);
  }
  if (issues.some((i) => i.level === 'error')) return issues;

  if (!ctx.assessment && !step.hints.length && !widget.autoHints) push('warning', 'hints.missing', 'Aufgabe ohne Hinweise – Lernende bekommen beim ersten Fehler nur generisches Feedback.');
  if (!ctx.assessment && !step.explanation && !widget.explain) push('info', 'explanation.missing', 'Keine Erklärung zur Lösung (wird nach dem zweiten Fehlversuch gezeigt).');
  if (step.hints.length > 2) push('info', 'hints.many', 'Mehr als 2 Hinweise: Der Player zeigt nur 2 Stufen vor der Lösung.');

  const seeds = [0];
  if (step.variants) {
    const n = opts.variantSamples ?? 12;
    for (let i = 1; i <= n; i++) seeds.push(i * 7919);
  }

  const seenInstances = new Set<string>();
  for (const seed of seeds) {
    const label = seed === 0 ? '' : ` (Variante seed=${seed})`;
    const r = safely(() => resolveProblem(step, seed, ctx.locale));
    if (!r.ok) {
      push('error', seed === 0 ? 'params.invalid' : 'variant.invalid', `${r.error}${label}`);
      continue;
    }
    const rp = r.value;
    seenInstances.add(stableKey({ p: rp.params, a: rp.answer }));
    if (stats) stats.checkedInstances++;

    // widget-specific lint once per instance
    for (const li of widget.lint?.(rp.params, rp.answer, ctx.locale) ?? []) push(li.level, li.code, li.message + label);
    if (issues.some((i) => i.level === 'error')) return issues;

    const init = safely(() => initialState(rp));
    if (!init.ok) { push('error', 'init.failed', init.error + label); continue; }

    // A criterion must exist and be evaluable
    const initCorrect = safely(() => isCorrect(rp, init.value));
    if (!initCorrect.ok) { push('error', 'check.failed', initCorrect.error + label); continue; }
    if (initCorrect.value) push('error', 'trivial', `Der Startzustand ist bereits richtig${label}.`);

    // Solvability
    const sol = safely(() => referenceSolve(rp));
    if (!sol.ok) { push('error', 'solver.failed', sol.error + label); continue; }
    if (!sol.value) { push('error', 'unsolvable', `Referenzlöser findet keine Lösung${label}.`); continue; }
    const solvedOk = safely(() => isCorrect(rp, sol.value!.state));
    if (!solvedOk.ok || !solvedOk.value) {
      push('error', 'unsolvable', `Die Referenzlösung (${sol.value.method}) wird nicht als richtig erkannt${label}.`);
      continue;
    }
    if (stats && seed === 0) stats.solvedBy[sol.value.method] = (stats.solvedBy[sol.value.method] ?? 0) + 1;
    const vs = widget.validateState?.(sol.value.state, rp.params) ?? [];
    if (vs.length) push('error', 'impossible-state', `Referenzlösung verletzt Invarianten: ${vs.join(', ')}${label}`);

    // Feedback rules must be evaluable and must not fire on the solution
    for (const rule of rp.feedback) {
      for (const [name, st] of [['Start', init.value], ['Lösung', sol.value.state]] as const) {
        const res = safely(() => evaluatePredicate(rule.when, predicateScope(rp, st)));
        if (!res.ok) push('error', 'feedback.error', `Feedback-Regel »${rule.when}« wirft im ${name}zustand: ${res.error}`);
        else if (name === 'Lösung' && res.value) push('warning', 'feedback.matches-solution', `Feedback-Regel »${rule.when}« trifft auch auf die richtige Lösung zu.`);
      }
    }

    // Uniqueness
    const mustBeUnique = step.unique ?? widget.requiresUnique?.(rp.params) ?? false;
    if (mustBeUnique) {
      if (widget.countSolutions) {
        const n = widget.countSolutions(rp.params, rp.answer);
        if (n !== 1) push('error', 'not-unique', `Erwartet genau eine Lösung, gefunden: ${n}${label}.`);
      } else {
        const res = searchSolutions(rp, { limit: 2, maxNodes: 30000 });
        const distinct = new Set(res.solutions.map((s) => stableKey(s.state))).size;
        if (distinct > 1) push('error', 'not-unique', `Mehr als ein gelöster Zustand erreichbar${label}.`);
        else if (!res.exhausted) push('info', 'unique-unproven', `Eindeutigkeit nicht vollständig geprüft (Zustandsraum zu groß)${label}.`);
      }
    }

    // Fuzzing: random action sequences must keep the state valid and the checks total
    if (widget.actions && seed === 0) fuzz(rp, opts, push);
  }
  if (step.variants && seenInstances.size < Math.min(3, seeds.length)) {
    push('warning', 'variant.low-diversity', `Nur ${seenInstances.size} verschiedene Varianten in ${seeds.length} Ziehungen.`);
  }
  return issues;
}

function fuzz(rp: ResolvedProblem, opts: EvalOptions, push: (l: Issue['level'], c: string, m: string) => void) {
  const runs = opts.fuzzRuns ?? 20;
  const depth = opts.fuzzDepth ?? 25;
  const rnd = mulberry32(0xf022);
  const reported = new Set<string>();
  for (let r = 0; r < runs; r++) {
    let s = initialState(rp);
    for (let d = 0; d < depth; d++) {
      const acts = rp.widget.actions!(s, rp.params);
      if (!acts.length) break;
      const a = acts[Math.floor(rnd() * acts.length)];
      const res = safely(() => rp.widget.applyAction(s, a, rp.params));
      if (!res.ok) { report(`applyAction wirft: ${res.error}`); return; }
      s = res.value;
      const inv = rp.widget.validateState?.(s, rp.params) ?? [];
      if (inv.length) { report(`Unmöglicher Zustand nach Aktion ${JSON.stringify(a)}: ${inv.join(', ')}`); return; }
      const c = safely(() => isCorrect(rp, s));
      if (!c.ok) { report(`Prüfung wirft bei erreichbarem Zustand: ${c.error}`); return; }
      const desc = safely(() => rp.widget.describe(s, rp.params, rp.locale));
      if (!desc.ok || !desc.value) { report('describe() liefert keinen Text.'); return; }
    }
  }
  function report(msg: string) {
    if (reported.has(msg)) return;
    reported.add(msg);
    push('error', 'fuzz', msg);
  }
}

function textIssues(texts: { label: string; text: string }[], locale: string, at: Partial<Issue>): Issue[] {
  const issues: Issue[] = [];
  const total = texts.reduce((s, t) => s + wordCount(t.text), 0);
  if (total > MAX_WORDS_PER_SCREEN) {
    issues.push({ level: 'warning', code: 'text.too-long', message: `${total} Wörter auf einem Screen (Richtwert ≤ ${MAX_WORDS_PER_SCREEN}).`, ...at });
  }
  const joined = texts.map((t) => t.text).join(' ');
  const ease = readingEase(joined, locale);
  if (ease !== null && ease < MIN_READING_EASE) {
    issues.push({ level: 'warning', code: 'text.readability', message: `Lesbarkeitsindex ${ease.toFixed(0)} (< ${MIN_READING_EASE}): kürzere Sätze oder einfachere Wörter.`, ...at });
  }
  return issues;
}

function visualIssues(visual: { widget: string; params: Record<string, unknown> }, locale: string, at: Partial<Issue>): Issue[] {
  const issues: Issue[] = [];
  const w = getWidget(visual.widget);
  if (!w) return [{ level: 'error', code: 'widget.unknown', message: `Visual-Widget »${visual.widget}« unbekannt.`, ...at }];
  const p = safely(() => w.params.parse(visual.params));
  if (!p.ok) return [{ level: 'error', code: 'params.invalid', message: `Visual: ${p.error}`, ...at }];
  for (const li of w.lint?.(p.value, undefined, locale) ?? []) if (!li.code.endsWith('no-answer')) issues.push({ ...li, ...at, message: `Visual: ${li.message}` });
  const d = safely(() => w.describe(w.init(p.value, { locale, seed: 1 }), p.value, locale));
  if (!d.ok || !d.value) issues.push({ level: 'error', code: 'a11y.alt', message: 'Visual ohne Textbeschreibung.', ...at });
  return issues;
}

export function evalConcept(c: Concept, file: string | undefined, opts: EvalOptions = {}, stats?: EvalStats): Issue[] {
  const issues: Issue[] = [];
  const at = { concept: c.id, file };
  if (c.license !== REQUIRED_LICENSE) issues.push({ level: 'error', code: 'license', message: `Lizenz muss ${REQUIRED_LICENSE} sein (ist: ${c.license}).`, ...at });
  if (!c.authors.length) issues.push({ level: 'error', code: 'license.authors', message: 'Autor:innen fehlen.', ...at });
  if (c.steps[0]?.kind === 'explain' && c.steps.length > 1 && c.steps[1]?.kind === 'explain' && c.steps[2]?.kind === 'explain') {
    issues.push({ level: 'warning', code: 'didactic.problem-first', message: 'Drei Erklär-Screens am Anfang: Problem zuerst, dann Prozedur.', ...at });
  }
  const problems = c.steps.filter((s) => s.kind === 'problem');
  if (!problems.length) issues.push({ level: 'error', code: 'didactic.no-problem', message: 'Concept ohne Aufgabe.', ...at });
  let deepest = 1;
  for (const s of c.steps) {
    const d = s.depth ?? 1;
    if (d < deepest) {
      issues.push({ level: 'error', code: 'depth.order', message: `Step ${s.id}: Tiefe ${d} nach Tiefe ${deepest} – Lektionen gehen nur tiefer, nie zurück.`, ...at });
      break;
    }
    deepest = d;
  }
  if ((c.steps[0]?.depth ?? 1) !== 1) issues.push({ level: 'error', code: 'depth.start', message: 'Eine Lektion beginnt mit Tiefe 1.', ...at });
  const minutes = c.steps.length * 0.6;
  if (c.estimated_minutes < minutes * 0.5 || c.estimated_minutes > minutes * 3) {
    issues.push({ level: 'info', code: 'duration', message: `estimated_minutes=${c.estimated_minutes} wirkt unpassend für ${c.steps.length} Steps.`, ...at });
  }
  for (const step of c.steps) {
    if (stats) stats.steps++;
    const sat = { ...at, step: step.id };
    if (step.kind === 'explain') {
      issues.push(...textIssues([{ label: 'body', text: step.body }], c.locale, sat));
      if (step.reveal) issues.push(...textIssues([{ label: 'reveal', text: step.reveal.body }], c.locale, sat));
      if (step.visual) issues.push(...visualIssues(step.visual, c.locale, sat));
      continue;
    }
    if (stats) {
      stats.problems++;
      stats.byWidget[step.widget] = (stats.byWidget[step.widget] ?? 0) + 1;
    }
    issues.push(...textIssues([{ label: 'prompt', text: step.prompt }, { label: 'body', text: step.body ?? '' }], c.locale, sat));
    if (step.visual && !step.variants) issues.push(...visualIssues(step.visual, c.locale, sat));
    issues.push(...evalProblem(step, { concept: c.id, file, locale: c.locale }, opts, stats));
  }
  return issues;
}

export function runEvals(course: Course, opts: EvalOptions = {}): EvalReport {
  const issues: Issue[] = [];
  const stats: EvalStats = { paths: course.paths.length, topics: course.topics.length, concepts: Object.keys(course.concepts).length, steps: 0, problems: 0, byWidget: {}, solvedBy: {}, checkedInstances: 0 };

  // References & graphs
  const topicIds = new Set(course.topics.map((t) => t.id));
  const skillIds = new Set(course.skills.map((s) => s.id));
  for (const p of course.paths) for (const t of p.topics) if (!topicIds.has(t)) issues.push({ level: 'error', code: 'ref.topic', message: `Pfad ${p.id} verweist auf unbekanntes Topic ${t}.`, file: course.files[p.id] });
  // Learning paths run from zero to hero: stages never go down, prerequisites come first.
  const inPath = new Map<string, string>();
  for (const p of course.paths) {
    let highest = -1;
    p.topics.forEach((tid, i) => {
      const t = course.topics.find((x) => x.id === tid);
      if (!t) return;
      if (inPath.has(tid)) issues.push({ level: 'warning', code: 'path.duplicate', message: `Topic ${tid} steht in ${inPath.get(tid)} und ${p.id}.`, file: course.files[p.id] });
      inPath.set(tid, p.id);
      const li = levelIndex(t.level);
      if (li < highest) issues.push({ level: 'error', code: 'path.order', message: `Pfad ${p.id}: ${tid} (${t.level}) steht hinter einem schwierigeren Kurs – die Stufen müssen aufsteigen.`, file: course.files[p.id] });
      highest = Math.max(highest, li);
      for (const pre of t.prerequisites) if (p.topics.indexOf(pre) > i) issues.push({ level: 'error', code: 'path.prereq-order', message: `Pfad ${p.id}: ${tid} steht vor seiner Voraussetzung ${pre}.`, file: course.files[p.id] });
      if (p.area && t.area !== p.area) issues.push({ level: 'warning', code: 'path.subject', message: `Pfad ${p.id} (${p.area}) enthält ${tid} aus dem Fach ${t.area}.`, file: course.files[p.id] });
    });
  }
  if (course.paths.length) for (const t of course.topics) if (!inPath.has(t.id)) issues.push({ level: 'warning', code: 'path.orphan', message: `Topic ${t.id} gehört zu keinem Lernpfad.`, file: course.files[t.id] });
  const used = new Map<string, string>();
  for (const t of course.topics) {
    if (t.license !== REQUIRED_LICENSE) issues.push({ level: 'error', code: 'license', message: `Topic-Lizenz muss ${REQUIRED_LICENSE} sein.`, file: course.files[t.id] });
    for (const pre of t.prerequisites) if (!topicIds.has(pre)) issues.push({ level: 'error', code: 'ref.topic', message: `Topic ${t.id}: unbekannte Voraussetzung ${pre}.`, file: course.files[t.id] });
    for (const u of t.units) {
      for (const cid of u.concepts) {
        if (!course.concepts[cid]) issues.push({ level: 'error', code: 'ref.concept', message: `Unit ${u.id} verweist auf unbekanntes Concept ${cid}.`, file: course.files[t.id] });
        if (used.has(cid)) issues.push({ level: 'error', code: 'ref.concept-twice', message: `Concept ${cid} ist in ${used.get(cid)} und ${u.id} eingehängt.`, file: course.files[t.id] });
        used.set(cid, u.id);
      }
    }
  }
  for (const cid of Object.keys(course.concepts)) if (!used.has(cid)) issues.push({ level: 'warning', code: 'ref.orphan', message: `Concept ${cid} ist in keiner Unit eingehängt.`, file: course.files[cid] });
  for (const s of course.skills) for (const pre of s.prerequisites) if (!skillIds.has(pre)) issues.push({ level: 'error', code: 'ref.skill', message: `Skill ${s.id}: unbekannte Voraussetzung ${pre}.` });
  for (const c of Object.values(course.concepts)) for (const s of c.skills) if (!skillIds.has(s)) issues.push({ level: 'error', code: 'ref.skill', message: `Concept ${c.id}: unbekannter Skill ${s}.`, file: course.files[c.id] });
  const skillCycle = findCycle(new Map(course.skills.map((s) => [s.id, s.prerequisites])));
  if (skillCycle) issues.push({ level: 'error', code: 'graph.cycle', message: `Zyklus im Skill-Graph: ${skillCycle.join(' → ')}` });
  const topicCycle = findCycle(new Map(course.topics.map((t) => [t.id, t.prerequisites])));
  if (topicCycle) issues.push({ level: 'error', code: 'graph.cycle', message: `Zyklus in Topic-Voraussetzungen: ${topicCycle.join(' → ')}` });

  for (const c of Object.values(course.concepts)) issues.push(...evalConcept(c, course.files[c.id], opts, stats));

  if (course.placement) {
    for (const item of course.placement.items) {
      if (!topicIds.has(item.recommends.topic)) issues.push({ level: 'error', code: 'ref.topic', message: `Einstufung verweist auf unbekanntes Topic ${item.recommends.topic}.`, file: course.files['placement'] });
      issues.push(...evalProblem(item.step as ProblemStep, { file: course.files['placement'], locale: course.placement.locale, assessment: true }, opts, stats));
    }
  }
  return { issues, stats };
}

export function summarize(issues: Issue[]): { errors: number; warnings: number; infos: number } {
  return {
    errors: issues.filter((i) => i.level === 'error').length,
    warnings: issues.filter((i) => i.level === 'warning').length,
    infos: issues.filter((i) => i.level === 'info').length,
  };
}
