/**
 * Compiles YAML source files into a validated course object and splits it into
 * the bundles the apps load (catalog + one bundle per topic).
 */
import { parse as parseYaml } from 'yaml';
import type { ZodError } from 'zod';
import { planLessons, type Lesson, type LessonDepth } from './lessons.ts';
import {
  ConceptSchema,
  PathSchema,
  PlacementSchema,
  SCHEMA_VERSION,
  SkillsFileSchema,
  TopicSchema,
  type Concept,
  type Path,
  type Placement,
  type Skill,
  type Step,
  type Topic,
} from './schema.ts';

export interface SourceFile {
  path: string;
  text: string;
}

export interface Issue {
  level: 'error' | 'warning' | 'info';
  code: string;
  message: string;
  file?: string;
  concept?: string;
  step?: string;
}

export interface Course {
  schema: string;
  locale: string;
  paths: Path[];
  topics: Topic[];
  concepts: Record<string, Concept>;
  skills: Skill[];
  placement?: Placement;
  /** id → source file, for error messages. */
  files: Record<string, string>;
}

export const DEFAULT_LOCALE = 'de';

function zodIssues(err: ZodError, file: string): Issue[] {
  return err.issues.map((i) => ({
    level: 'error' as const,
    code: 'schema',
    message: `${i.path.join('.') || '(Wurzel)'}: ${i.message}`,
    file,
  }));
}

type Doc = { type: string; id?: string; locale?: string; [k: string]: unknown };

/** Picks the document for `locale`, falling back to the default locale. */
function pickLocale<T extends { locale?: string }>(docs: T[], locale: string): T | undefined {
  return docs.find((d) => (d.locale ?? DEFAULT_LOCALE) === locale) ?? docs.find((d) => (d.locale ?? DEFAULT_LOCALE) === DEFAULT_LOCALE) ?? docs[0];
}

// ---------- Translations ----------

/** Keys whose values are code, not prose: they must be identical in every locale. */
const CODE_KEYS = new Set(['type', 'id', 'when', 'variants', 'widget', 'kind', 'misconception', 'skills', 'cards_from', 'prerequisites', 'concepts', 'topics', 'area', 'level', 'icon', 'color', 'license', 'recommends', 'mastered', 'estimated_minutes']);

/**
 * Language-independent fingerprint of a document: structure, numbers, booleans,
 * ids and `{{…}}` templates. Prose is ignored, so a faithful translation has the
 * same fingerprint as its original.
 */
function fingerprint(v: unknown, key = ''): unknown {
  // a skills file's `skills` holds titled objects; elsewhere `skills` lists ids
  if (CODE_KEYS.has(key) && !(Array.isArray(v) && v.some((x) => x && typeof x === 'object'))) return JSON.stringify(v);
  if (typeof v === 'string') return (v.match(/\{\{[^}]*\}\}/g) ?? []).sort().join('');
  if (Array.isArray(v)) return v.map((x) => fingerprint(x));
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) if (k !== 'locale' && k !== 'authors' && k !== 'sources') o[k] = fingerprint((v as Record<string, unknown>)[k], k);
    return o;
  }
  return v;
}

/** First path where two fingerprints differ, for a readable message. */
function firstDiff(a: unknown, b: unknown, path = ''): string | undefined {
  if (JSON.stringify(a) === JSON.stringify(b)) return undefined;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (Array.isArray(a) !== Array.isArray(b)) return path || '(root)';
    if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) return `${path || '(root)'} (length ${a.length} ≠ ${b.length})`;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) {
      const d = firstDiff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
  }
  return path || '(root)';
}

/**
 * Checks a translation against the default-locale original: same steps, ids,
 * widgets, numbers, conditions and templates – only the wording may differ.
 */
export function translationIssues(original: unknown, translation: unknown, file: string): Issue[] {
  const diff = firstDiff(fingerprint(original), fingerprint(translation));
  if (!diff) return [];
  return [{ level: 'error', code: 'i18n.parity', message: `Translation differs from the original in structure, numbers, ids or {{templates}} at ${diff}. Translate the wording only.`, file }];
}

export function compileContent(files: SourceFile[], locale = DEFAULT_LOCALE): { course: Course; issues: Issue[] } {
  const issues: Issue[] = [];
  const byKey = new Map<string, { doc: Doc; file: string }[]>();
  for (const f of files) {
    let doc: unknown;
    try {
      doc = parseYaml(f.text, { prettyErrors: true });
    } catch (e) {
      issues.push({ level: 'error', code: 'yaml', message: (e as Error).message, file: f.path });
      continue;
    }
    if (!doc || typeof doc !== 'object' || !('type' in doc)) {
      issues.push({ level: 'error', code: 'schema', message: 'Datei braucht ein Feld »type« (concept, topic, path, skills, placement).', file: f.path });
      continue;
    }
    const d = doc as Doc;
    const key = `${d.type}:${d.id ?? d.type}`;
    const list = byKey.get(key) ?? [];
    if (list.some((x) => (x.doc.locale ?? DEFAULT_LOCALE) === (d.locale ?? DEFAULT_LOCALE))) {
      issues.push({ level: 'error', code: 'duplicate-id', message: `ID ${d.id} (${d.type}) ist doppelt vergeben.`, file: f.path });
    }
    list.push({ doc: d, file: f.path });
    byKey.set(key, list);
  }

  const course: Course = { schema: SCHEMA_VERSION, locale, paths: [], topics: [], concepts: {}, skills: [], files: {} };

  for (const [, list] of byKey) {
    const chosen = pickLocale(list.map((x) => ({ ...x, locale: x.doc.locale as string | undefined })), locale);
    if (!chosen) continue;
    const { doc, file } = chosen;
    if (locale !== DEFAULT_LOCALE) {
      const original = list.find((x) => (x.doc.locale ?? DEFAULT_LOCALE) === DEFAULT_LOCALE);
      if ((doc.locale ?? DEFAULT_LOCALE) !== locale) issues.push({ level: 'info', code: 'i18n.missing', message: `No ${locale} translation yet – falls back to ${DEFAULT_LOCALE}.`, file });
      else if (original) issues.push(...translationIssues(original.doc, doc, file));
    }
    switch (doc.type) {
      case 'concept': {
        const r = ConceptSchema.safeParse(doc);
        if (!r.success) { issues.push(...zodIssues(r.error, file)); break; }
        const c = r.data;
        const steps: Step[] = c.steps.map((s, i) => ({ ...s, id: `${c.id}/${s.id ?? `s${i + 1}`}` }) as Step);
        const ids = steps.map((s) => s.id);
        if (new Set(ids).size !== ids.length) issues.push({ level: 'error', code: 'duplicate-id', message: 'Doppelte Step-IDs im Concept.', file, concept: c.id });
        let srs = c.srs;
        if (c.srs) {
          const resolved: string[] = [];
          for (const ref of c.srs.cards_from) {
            const m = /^steps\[(\d+)\]$/.exec(ref);
            const step = m ? steps[Number(m[1])] : steps.find((s) => s.id === ref || s.id === `${c.id}/${ref}`);
            if (!step) issues.push({ level: 'error', code: 'srs.unknown-step', message: `srs.cards_from verweist auf unbekannten Step »${ref}«.`, file, concept: c.id });
            else if (step.kind !== 'problem') issues.push({ level: 'error', code: 'srs.not-problem', message: `srs.cards_from »${ref}« ist kein Aufgaben-Step.`, file, concept: c.id });
            else resolved.push(step.id);
          }
          srs = { cards_from: resolved };
        }
        course.concepts[c.id] = { ...c, steps, srs };
        course.files[c.id] = file;
        break;
      }
      case 'topic': {
        const r = TopicSchema.safeParse(doc);
        if (!r.success) { issues.push(...zodIssues(r.error, file)); break; }
        course.topics.push(r.data);
        course.files[r.data.id] = file;
        break;
      }
      case 'path': {
        const r = PathSchema.safeParse(doc);
        if (!r.success) { issues.push(...zodIssues(r.error, file)); break; }
        course.paths.push(r.data);
        course.files[r.data.id] = file;
        break;
      }
      case 'skills': {
        const r = SkillsFileSchema.safeParse(doc);
        if (!r.success) { issues.push(...zodIssues(r.error, file)); break; }
        course.skills.push(...r.data.skills);
        break;
      }
      case 'placement': {
        const r = PlacementSchema.safeParse(doc);
        if (!r.success) { issues.push(...zodIssues(r.error, file)); break; }
        course.placement = {
          ...r.data,
          items: r.data.items.map((it, i) => ({ ...it, step: { ...it.step, id: `placement/${it.step.id ?? `q${i + 1}`}` } })),
        };
        course.files['placement'] = file;
        break;
      }
      default:
        issues.push({ level: 'error', code: 'schema', message: `Unbekannter type »${doc.type}«.`, file });
    }
  }
  course.topics.sort((a, b) => a.id.localeCompare(b.id));
  course.paths.sort((a, b) => a.id.localeCompare(b.id));
  return { course, issues };
}

// ---------- Bundles for the apps ----------

export interface ConceptMeta {
  /** Lesson id (what `learn/<id>` plays and what a completion event names). */
  id: string;
  title: string;
  summary?: string;
  estimated_minutes: number;
  skills: string[];
  topicId: string;
  unitId: string;
  problems: number;
  steps: number;
  srsCards: string[];
  /** The authored concept this lesson was cut from. */
  group: string;
  /** 1 = core (on the path), 2 = deeper, 3 = expert (optional extras). */
  depth: LessonDepth;
  /** Position among the lessons of the same tier and how many there are. */
  part: number;
  parts: number;
  /** Key terms of this lesson, to tell the parts of one concept apart. */
  focus?: string;
}

export interface Catalog {
  schema: string;
  locale: string;
  paths: Path[];
  /** Courses; `units[].concepts` lists the core lessons in learning order. */
  topics: Topic[];
  /** Every lesson by id – core lessons and extras. */
  concepts: Record<string, ConceptMeta>;
  /** Authored concept → its lessons in learning order (core parts, deeper, expert). */
  groups: Record<string, string[]>;
  skills: Skill[];
  placement?: Placement;
}

export interface TopicBundle {
  topicId: string;
  /** Every lesson of the course, core and extras. */
  concepts: Lesson[];
}

/**
 * Cuts every concept into short lessons (see lessons.ts) and splits the course
 * into the catalog and one bundle per topic. In the catalog a unit lists its
 * core lessons; deeper and expert lessons are reachable through `groups`.
 */
export function splitBundles(course: Course): { catalog: Catalog; topics: TopicBundle[] } {
  const concepts: Record<string, ConceptMeta> = {};
  const groups: Record<string, string[]> = {};
  const bundles: TopicBundle[] = [];
  const topics = course.topics.map((topic) => {
    const list: Lesson[] = [];
    const units = topic.units.map((unit) => {
      const core: string[] = [];
      for (const cid of unit.concepts) {
        const c = course.concepts[cid];
        if (!c) continue;
        const lessons = planLessons(c);
        groups[cid] = lessons.map((l) => l.id);
        for (const l of lessons) {
          list.push(l);
          if (l.depth === 1) core.push(l.id);
          concepts[l.id] = {
            id: l.id,
            title: l.title,
            summary: l.summary,
            estimated_minutes: l.estimated_minutes,
            skills: l.skills,
            topicId: topic.id,
            unitId: unit.id,
            problems: l.steps.filter((s) => s.kind === 'problem').length,
            steps: l.steps.length,
            srsCards: l.srs?.cards_from ?? [],
            group: l.group,
            depth: l.depth,
            part: l.part,
            parts: l.parts,
            focus: l.focus,
          };
        }
      }
      return { ...unit, concepts: core };
    });
    bundles.push({ topicId: topic.id, concepts: list });
    return { ...topic, units };
  });
  return {
    catalog: { schema: course.schema, locale: course.locale, paths: course.paths, topics, concepts, groups, skills: course.skills, placement: course.placement },
    topics: bundles,
  };
}

type LessonIndex = { concepts: Record<string, Pick<ConceptMeta, 'depth' | 'group'>>; groups?: Record<string, string[]> };

/** The optional extras (deeper, expert) that belong to the same concept as a lesson, in order. */
export function lessonExtras(catalog: LessonIndex, lessonId: string): string[] {
  const group = catalog.concepts[lessonId]?.group ?? lessonId;
  return (catalog.groups?.[group] ?? []).filter((id) => (catalog.concepts[id]?.depth ?? 1) > 1);
}

/** Whether a core lesson is the last core part of its concept (the extras hang below it). */
export function isLastCorePart(catalog: LessonIndex, lessonId: string): boolean {
  const meta = catalog.concepts[lessonId];
  if (!meta || (meta.depth ?? 1) !== 1) return false;
  const core = (catalog.groups?.[meta.group] ?? [lessonId]).filter((id) => (catalog.concepts[id]?.depth ?? 1) === 1);
  return core[core.length - 1] === lessonId;
}

/**
 * The lessons a completion event stands for. Events written before concepts
 * were cut into short lessons name the whole concept: they complete its core.
 */
export function completedLessons(catalog: LessonIndex | null | undefined, conceptId: string): string[] {
  if (!catalog || catalog.concepts[conceptId]) return [conceptId];
  const lessons = catalog.groups?.[conceptId];
  return lessons ? lessons.filter((id) => (catalog.concepts[id]?.depth ?? 1) === 1) : [conceptId];
}

/** Turns a concept id from an old link or event into a lesson to play: its first open core lesson. */
export function resolveLesson(catalog: LessonIndex, id: string, completed?: ReadonlySet<string>): string {
  if (catalog.concepts[id]) return id;
  const core = completedLessons(catalog, id);
  return core.find((c) => !completed?.has(c)) ?? core[0] ?? id;
}
