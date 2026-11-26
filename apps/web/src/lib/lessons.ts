/** How lessons are named and ordered in the app: short parts of a concept, plus optional deeper and expert extras. */
import { isLastCorePart, lessonExtras, type Catalog, type ConceptMeta, type Topic } from '@lumen/engine';
import type { TKey } from './i18n.ts';

type T = (key: TKey, vars?: Record<string, string | number>) => string;

/** How deep the learner wants the path to go: 1 = core only, 2 = with the deeper lessons, 3 = everything. */
export type DepthGoal = 1 | 2 | 3;

export const depthOfLesson = (meta?: Pick<ConceptMeta, 'depth'> | null): 1 | 2 | 3 => meta?.depth ?? 1;

/** "Teil 2 von 3", "Tiefer", "Experte" – or null for a concept that is one lesson. */
export function lessonTag(meta: ConceptMeta | undefined | null, t: T): string | null {
  if (!meta) return null;
  const depth = depthOfLesson(meta);
  const parts = meta.parts ?? 1;
  if (depth === 1) return parts > 1 ? t('lesson.part', { n: meta.part, total: parts }) : null;
  const name = t(`depth.name${depth}`);
  return parts > 1 ? `${name} ${meta.part}/${parts}` : name;
}

/** Title for places that show a single line: "Brüche kürzen · Teil 2 von 2". */
export function lessonName(meta: ConceptMeta | undefined | null, t: T): string {
  if (!meta) return '';
  const tag = lessonTag(meta, t);
  return tag ? `${meta.title} · ${tag}` : meta.title;
}

/**
 * Second line under a lesson title: what this part is about. The first part
 * carries the concept's summary, later parts their own key terms (and nothing
 * when they have none, rather than the same summary again).
 */
export function lessonBlurb(meta: ConceptMeta | undefined | null): string | undefined {
  if (!meta) return undefined;
  return depthOfLesson(meta) === 1 && (meta.part ?? 1) === 1 ? meta.summary : meta.focus;
}

/**
 * Lessons of a course in learning order for a depth goal: the core lessons,
 * and behind the last core part of each concept its extras up to that depth.
 */
export function courseSequence(catalog: Catalog, topic: Topic, goal: DepthGoal = 1): string[] {
  const out: string[] = [];
  for (const u of topic.units) {
    for (const id of u.concepts) {
      out.push(id);
      if (goal > 1 && isLastCorePart(catalog, id)) out.push(...lessonExtras(catalog, id).filter((x) => depthOfLesson(catalog.concepts[x]) <= goal));
    }
  }
  return out;
}

/** What comes after a finished lesson: the next open lesson on the learner's path, and an extra worth offering. */
export function nextAfter(catalog: Catalog, topic: Topic | undefined, lessonId: string, completed: ReadonlySet<string>, goal: DepthGoal = 1): { next: string | null; bonus: string | null } {
  if (!topic) return { next: null, bonus: null };
  const meta = catalog.concepts[lessonId];
  const all = courseSequence(catalog, topic, 3);
  const at = all.indexOf(lessonId);
  const open = (id: string) => id !== lessonId && !completed.has(id);
  const next = all.find((id, i) => i > at && open(id) && depthOfLesson(catalog.concepts[id]) <= goal) ?? null;
  // The concept's core is done: its next extra is on offer, unless the path leads there anyway.
  const extras = meta ? lessonExtras(catalog, lessonId) : [];
  const coreDone = !!meta && (depthOfLesson(meta) > 1 || isLastCorePart(catalog, lessonId));
  const bonus = coreDone ? (extras.find((id) => open(id) && all.indexOf(id) > at) ?? null) : null;
  return { next, bonus: bonus === next ? null : bonus };
}
