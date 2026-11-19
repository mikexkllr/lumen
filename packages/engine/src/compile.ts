/**
 * Compiles YAML source files into a validated course object and splits it into
 * the bundles the apps load (catalog + one bundle per topic).
 */
import { parse as parseYaml } from 'yaml';
import type { ZodError } from 'zod';
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
}

export interface Catalog {
  schema: string;
  locale: string;
  paths: Path[];
  topics: Topic[];
  concepts: Record<string, ConceptMeta>;
  skills: Skill[];
  placement?: Placement;
}

export interface TopicBundle {
  topicId: string;
  concepts: Concept[];
}

export function splitBundles(course: Course): { catalog: Catalog; topics: TopicBundle[] } {
  const concepts: Record<string, ConceptMeta> = {};
  const bundles: TopicBundle[] = [];
  for (const topic of course.topics) {
    const list: Concept[] = [];
    for (const unit of topic.units) {
      for (const cid of unit.concepts) {
        const c = course.concepts[cid];
        if (!c) continue;
        list.push(c);
        concepts[cid] = {
          id: c.id,
          title: c.title,
          summary: c.summary,
          estimated_minutes: c.estimated_minutes,
          skills: c.skills,
          topicId: topic.id,
          unitId: unit.id,
          problems: c.steps.filter((s) => s.kind === 'problem').length,
          steps: c.steps.length,
          srsCards: c.srs?.cards_from ?? [],
        };
      }
    }
    bundles.push({ topicId: topic.id, concepts: list });
  }
  return {
    catalog: { schema: course.schema, locale: course.locale, paths: course.paths, topics: course.topics, concepts, skills: course.skills, placement: course.placement },
    topics: bundles,
  };
}
