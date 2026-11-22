/**
 * Authoring tool: extends lessons (or creates new ones) from a compact,
 * bilingual patch file and writes both the German and the English YAML.
 *
 *   node scripts/extend-lessons.ts patch.yaml [--dry]
 *
 * Every string may carry both languages as "Deutsch || English"; write \|| for a literal "||".
 * A patch maps concept ids to a list of entries. Section markers set where the
 * following steps go and how deep they are:
 *   - hook    inserted before the existing steps (depth 1)
 *   - core    appended (depth 1, default)
 *   - deep    appended, depth 2
 *   - expert  appended, depth 3
 * Step shorthands (first key picks the type, its value is the prompt):
 *   est · swipe · cloze · teach · num · mc · order · match · sort · sim · explain · raw
 * Common keys: id, h (hints), why (explanation), d (difficulty), body, fb.
 * A key starting with "+" creates a new lesson: { topic, unit, after?, title,
 * summary, skills, steps, srs? }.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';

type Lang = 0 | 1;
const SEP = /\s*\|\|\s*/;

/** Keys whose values are code (predicates, variants) – never split on "||". */
const CODE = new Set(['when', 'predicate', 'variants', 'misconception', 'id', 'widget', 'kind', 'scene', 'expr']);

function loc<T>(v: T, lang: Lang, key = ''): T {
  if (CODE.has(key)) return v;
  if (typeof v === 'string') {
    // "\||" is a literal "||" (e.g. a cell diagram Zn | Zn²⁺ || Cu²⁺ | Cu), not the language separator
    const parts = v.replace(/\\\|\|/g, '\u0000').split(SEP).map((x) => x.replace(/\u0000/g, '||'));
    return (parts.length > 1 ? parts[Math.min(lang, parts.length - 1)] : parts[0]) as T;
  }
  if (Array.isArray(v)) return v.map((x) => loc(x, lang, key)) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, loc(x, lang, k)])) as T;
  return v;
}

const DEFAULT_PROMPT: Record<string, string> = {
  swipe: 'Blitzrunde: Stimmt das? || Lightning round: true or false?',
  cloze: 'Fülle die Lücken. || Fill in the gaps.',
};

type Entry = Record<string, any>;

/** Expands one shorthand entry into a full step (still bilingual). */
function expand(e: Entry, depth: number, id: string): Entry {
  const type = Object.keys(e)[0];
  const head = e[type];
  const common: Entry = {};
  if (e.body) common.body = e.body;
  const tail: Entry = {};
  if (e.fb) tail.feedback = (e.fb as [string, string, string?][]).map(([when, text, mis]) => ({ when, ...(mis ? { misconception: mis } : {}), text }));
  if (e.h) tail.hints = Array.isArray(e.h) ? e.h : [e.h];
  if (e.why) tail.explanation = e.why;
  const diff = e.d ?? depth;
  if (diff > 1) tail.difficulty = diff;
  if (e.v) tail.variants = e.v;
  const base = (widget: string, prompt: string, params: Entry | undefined, answer?: unknown): Entry => ({
    kind: 'problem',
    id: e.id ?? id,
    ...(depth > 1 ? { depth } : {}),
    widget,
    prompt,
    ...common,
    ...(e.visual ? { visual: e.visual } : {}),
    ...(params && Object.keys(params).length ? { params } : {}),
    ...(answer !== undefined ? { answer } : {}),
    ...(e.check ? { check: { predicate: e.check } } : {}),
    ...tail,
  });
  switch (type) {
    case 'raw':
      {
        const { kind, id: rawId, ...rest } = head;
        return { kind, id: rawId ?? e.id ?? id, ...(depth > 1 ? { depth } : {}), ...rest, ...(depth > 1 && rest.difficulty === undefined ? { difficulty: depth } : {}) };
      }
    case 'explain':
      return { kind: 'explain', id: e.id ?? id, ...(depth > 1 ? { depth } : {}), ...(e.title ? { title: e.title } : {}), body: head, ...(e.visual ? { visual: e.visual } : {}), ...(e.reveal ? { reveal: { body: e.reveal } } : {}) };
    case 'est': {
      const [min, max, scale] = e.r;
      return base('estimate', head, { min, max, ...(scale ? { scale } : {}), ...(e.step ? { step: e.step } : {}), ...(e.u ? { unit: e.u } : {}) }, { value: e.a, ...(e.tol !== undefined ? { tolerance: e.tol } : {}), ...(e.w !== undefined ? { within: e.w } : {}) });
    }
    case 'swipe': {
      const cards = (e.c as [number, string, string?][]).map(([right, text, why]) => ({ text, right: !!right, ...(why ? { why } : {}) }));
      const lr = e.lr ? (e.lr as string).split(SEP).map((half) => half.split(/\s*,\s*/)) : null;
      return base('swipe', head ?? DEFAULT_PROMPT.swipe, { cards, ...(lr ? { left: lr.map((x) => x[0]).join(' || '), right: lr.map((x) => x[1]).join(' || ') } : {}) });
    }
    case 'cloze': {
      const distractors = e.x ? (e.x as string).split(SEP).map((half) => half.split(/\s*,\s*/).filter(Boolean)) : null;
      const n = distractors ? Math.max(...distractors.map((d) => d.length)) : 0;
      return base('cloze', e.q ?? DEFAULT_PROMPT.cloze, { text: head, ...(distractors ? { distractors: Array.from({ length: n }, (_x, i) => distractors.map((d) => d[i] ?? d[0]).join(' || ')) } : {}) });
    }
    case 'teach':
      // YAML reads bare null/true/false as values – as keywords they are meant as words
      return base('teach', head, { keywords: (e.kw as unknown[][]).map((g) => g.map((k) => (k === null ? 'null' : String(k)))), ...(e.min ? { min: e.min } : {}), sample: e.sample });
    case 'num':
      return base('numeric', head, { ...(e.u ? { unit: e.u } : {}), ...(e.ph ? { placeholder: e.ph } : {}) }, { value: e.a, ...(e.tol !== undefined ? { tolerance: e.tol } : {}), ...(e.form ? { form: e.form } : {}) });
    case 'mc': {
      const options = (e.o as string[]).map((raw) => {
        const halves = String(raw).split(SEP).map((h) => h.split(/\s*::\s*/));
        const correct = halves[0][0].startsWith('*');
        const label = halves.map((h) => h[0].replace(/^\*/, '')).join(' || ');
        const fb = halves.some((h) => h[1]) ? halves.map((h) => h[1] ?? halves[0][1]).join(' || ') : undefined;
        return { label, ...(correct ? { correct: true } : {}), ...(fb ? { feedback: fb } : {}) };
      });
      return base('choice', head, { ...(e.multiple ? { multiple: true } : {}), ...(e.grid ? { layout: 'grid' } : {}), options });
    }
    case 'order':
      return base('order', head, { items: (e.items as string[]).map((label) => ({ label })), ...(e.dir === 'h' ? { direction: 'horizontal' } : {}), ...(e.start ? { startLabel: e.start } : {}), ...(e.end ? { endLabel: e.end } : {}) });
    case 'match':
      return base('match', head, { pairs: (e.pairs as [string, string][]).map(([left, right]) => ({ left, right })), ...(e.lt ? { leftTitle: e.lt } : {}), ...(e.rt ? { rightTitle: e.rt } : {}) });
    case 'sort': {
      const buckets = (e.b as string[]).map((label, i) => ({ id: `b${i + 1}`, label }));
      return base('buckets', head, { buckets, items: (e.i as [string, number][]).map(([label, b]) => ({ label, bucket: `b${b + 1}` })) });
    }
    case 'sim':
      return base('sim', head, { scene: e.scene, ...(e.p ?? {}) }, e.a);
    default:
      throw new Error(`Unknown entry type »${type}«`);
  }
}

const SECTIONS: Record<string, { depth: number; prefix: string; front: boolean }> = {
  hook: { depth: 1, prefix: 'hook', front: true },
  core: { depth: 1, prefix: 'c', front: false },
  deep: { depth: 2, prefix: 'd', front: false },
  expert: { depth: 3, prefix: 'x', front: false },
};

/** The sections a patch entry list writes into. A patch owns exactly these in a lesson: only their steps are replaced. */
function ownedPrefixes(entries: (string | Entry)[], ns = ''): Set<string> {
  let sec = SECTIONS.core;
  const out = new Set<string>();
  for (const e of entries) {
    if (typeof e === 'string') sec = SECTIONS[e] ?? sec;
    else out.add(`${ns}:${sec.prefix}`);
  }
  return out;
}

function build(entries: (string | Entry)[], taken: Set<string>, ns = ''): { front: Entry[]; back: Entry[] } {
  let sec = SECTIONS.core;
  const front: Entry[] = [];
  const back: Entry[] = [];
  const counter: Record<string, number> = {};
  for (const e of entries) {
    if (typeof e === 'string') {
      if (!SECTIONS[e]) throw new Error(`Unknown section »${e}«`);
      sec = SECTIONS[e];
      continue;
    }
    let id: string;
    do {
      counter[sec.prefix] = (counter[sec.prefix] ?? 0) + 1;
      id = (ns ? `${ns}-` : '') + (sec.prefix === 'hook' && counter[sec.prefix] === 1 ? 'hook' : `${sec.prefix}${counter[sec.prefix]}`);
    } while (taken.has(id));
    const step = expand(e, sec.depth, id);
    if (taken.has(step.id)) throw new Error(`Duplicate step id ${step.id}`);
    taken.add(step.id);
    (sec.front ? front : back).push(step);
  }
  return { front, back };
}

const yamlSteps = (steps: Entry[]) =>
  steps
    .map((s) => stringify([s], { lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' }).trimEnd().split('\n').map((l) => `  ${l}`).join('\n'))
    .join('\n\n');

function conceptFiles(): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of readdirSync('content/topics')) {
    const dir = join('content/topics', t, 'concepts');
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (!f.endsWith('.yaml') || /\.[a-z]{2}\.yaml$/.test(f)) continue;
      const m = /^id:\s*(\S+)/m.exec(readFileSync(join(dir, f), 'utf8'));
      if (m) map.set(m[1], join(dir, f));
    }
  }
  return map;
}

/** Tool ids: hook, cN, dN, xN – optionally with a patch namespace in front (»lab-d1«). */
const TOOL_ID = /^    id: ((?:([a-z][a-z0-9]{0,7})-)?(hook\d*|[cdx]\d+))\s*$/;

/**
 * Hand-written step ids that merely look like tool ids (»c14« is carbon-14). They are never the tool's own.
 * Deliberately a fixed list: asking git for "ids of the last commit" stops working the moment tool steps are committed.
 */
const FOREIGN: [RegExp, string[]][] = [[/(kernphysik\/concepts\/isotopes|logarithmen\/concepts\/halflife)(\.[a-z]{2})?\.yaml$/, ['c14']]];
function committedIds(path: string): Set<string> {
  return new Set(FOREIGN.filter(([re]) => re.test(path)).flatMap(([, ids]) => ids));
}

let replaced = 0;

/**
 * Removes steps this tool added earlier (ids hook, cN, dN, xN) so a patch can be re-applied – but only in the
 * sections the current patch writes (`owned`). Steps another patch put into other sections stay untouched.
 */
function strip(text: string, keep: Set<string> = new Set(), owned?: Set<string>, count = false): string {
  const lines = text.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; ) {
    const m = /^  - kind: /.test(lines[i]) ? TOOL_ID.exec(lines[i + 1] ?? '') : null;
    if (m && !keep.has(m[1]) && (!owned || owned.has(`${m[2] ?? ''}:${m[3].startsWith('hook') ? 'hook' : m[3][0]}`))) {
      if (count) replaced++;
      let j = i + 1;
      while (j < lines.length && !/^  - kind: /.test(lines[j]) && !/^\S/.test(lines[j])) j++;
      while (out.length && out[out.length - 1].trim() === '') out.pop();
      out.push('');
      i = j;
    } else out.push(lines[i++]);
  }
  return out.join('\n');
}

function patchFile(path: string, front: Entry[], back: Entry[], lang: Lang, dry: boolean, owned: Set<string>) {
  const text = strip(readFileSync(path, 'utf8'), committedIds(path), owned, lang === 0);
  const lines = text.split('\n');
  const si = lines.findIndex((l) => /^steps:\s*$/.test(l));
  if (si < 0) throw new Error(`${path}: no steps block`);
  let end = lines.findIndex((l, i) => i > si && /^\S/.test(l));
  if (end < 0) end = lines.length;
  while (end > si + 1 && lines[end - 1].trim() === '') end--;
  const head = lines.slice(0, si + 1);
  const body = lines.slice(si + 1, end);
  const rest = lines.slice(end);
  // existing steps as blocks with their depth; each new step goes behind the last step that is not deeper than itself,
  // so a later patch can add to the core or the deeper stage of a lesson that already has an expert stage
  const blocks: { depth: number; text: string }[] = [];
  for (const l of body) {
    if (/^  - kind: /.test(l)) blocks.push({ depth: 1, text: l });
    else if (blocks.length) blocks[blocks.length - 1].text += `\n${l}`;
    else if (l.trim() !== '') throw new Error(`${path}: unexpected line before the first step: ${l}`);
  }
  for (const b of blocks) {
    b.depth = Number(/^    depth: (\d)\s*$/m.exec(b.text)?.[1] ?? 1);
    b.text = b.text.replace(/\s+$/, '');
  }
  for (const s of loc(back, lang)) {
    const depth = Number(s.depth ?? 1);
    let at = blocks.length;
    while (at > 0 && blocks[at - 1].depth > depth) at--;
    blocks.splice(at, 0, { depth, text: yamlSteps([s]) });
  }
  const out = [...head];
  if (front.length) out.push(yamlSteps(loc(front, lang)), '');
  out.push(blocks.map((b) => b.text).join('\n\n'));
  out.push(...(rest.length && rest[0].trim() !== '' ? ['', ...rest] : rest));
  let next = out.join('\n');
  const total = (parse(next).steps as unknown[]).length;
  next = next.replace(/^estimated_minutes:\s*(\d+(?:\.\d+)?)\s*$/m, (_m, old) => `estimated_minutes: ${Math.min(30, Math.max(Number(old), Math.round(total * 0.8)))}`);
  if (!dry) writeFileSync(path, next);
}

function newLesson(id: string, spec: Entry, dry: boolean) {
  const dir = join('content/topics', spec.topic, 'concepts');
  const slug = spec.file ?? id.split('.').pop()!;
  const { front, back } = build(spec.steps, new Set());
  const steps = [...front, ...back];
  for (const lang of [0, 1] as Lang[]) {
    const doc =
      [
        `id: ${id}`,
        'type: concept',
        `title: ${JSON.stringify(loc(spec.title, lang))}`,
        `summary: ${JSON.stringify(loc(spec.summary, lang))}`,
        `locale: ${lang ? 'en' : 'de'}`,
        'license: CC-BY-SA-4.0',
        'authors: ["Lumen-Team"]',
        `skills: [${(spec.skills ?? []).join(', ')}]`,
        `estimated_minutes: ${Math.min(30, Math.max(4, Math.round(steps.length * 0.8)))}`,
        'steps:',
        yamlSteps(loc(steps, lang)),
        '',
        ...(spec.srs ? ['srs:', `  cards_from: [${(spec.srs as string[]).map((s) => JSON.stringify(s)).join(', ')}]`, ''] : []),
      ].join('\n');
    const path = join(dir, `${slug}${lang ? '.en' : ''}.yaml`);
    // re-applying a patch rewrites a lesson this tool created
    if (!dry) writeFileSync(path, doc);
    // hang it into the topic
    const tp = join('content/topics', spec.topic, `topic${lang ? '.en' : ''}.yaml`);
    let t = readFileSync(tp, 'utf8');
    // a unit object whose unit already exists (patch re-applied) is treated like its id
    const unitId: string = typeof spec.unit === 'string' ? spec.unit : spec.unit.id;
    if (typeof spec.unit === 'string' || new RegExp(`- id: ${unitId.replace(/\./g, '\\.')}\\n`).test(t)) {
      const re = new RegExp(`(- id: ${unitId.replace(/\./g, '\\.')}\\n(?:    .*\\n)*?    concepts: \\[)([^\\]]*)(\\])`);
      if (!re.test(t)) throw new Error(`${tp}: unit ${unitId} with flow-style concepts not found`);
      t = t.replace(re, (_m, a, list, c) => {
        const ids = String(list).split(',').map((s) => s.trim()).filter(Boolean);
        if (ids.includes(id)) return _m;
        const at = spec.first ? 0 : spec.after ? ids.indexOf(spec.after) + 1 || ids.length : ids.length;
        ids.splice(at, 0, id);
        return `${a}${ids.join(', ')}${c}`;
      });
    } else {
      if (!/\nunits:\n(?:  .*\n?)*$/.test(t.endsWith('\n') ? t : `${t}\n`)) throw new Error(`${tp}: units is not the last key`);
      t = `${t.trimEnd()}\n  - id: ${spec.unit.id}\n    title: ${JSON.stringify(loc(spec.unit.title, lang))}\n    concepts: [${id}]\n`;
    }
    if (!dry) writeFileSync(tp, t);
  }
}

const [file, ...flags] = process.argv.slice(2);
const dry = flags.includes('--dry');
const patch = parse(readFileSync(file, 'utf8')) as Record<string, any>;
const files = conceptFiles();
let lessons = 0;
let added = 0;
const todo: (() => void)[] = [];
const ns: string = patch._ns ?? '';
if (ns && !/^[a-z][a-z0-9]{0,7}$/.test(ns)) throw new Error('_ns: 1–8 lowercase letters or digits');
for (const [key, value] of Object.entries(patch)) {
  if (key === '_ns') continue;
  if (key.startsWith('+')) {
    todo.push(() => newLesson(key.slice(1), value, dry));
    lessons++;
    added += value.steps.filter((s: unknown) => typeof s !== 'string').length;
    continue;
  }
  const path = files.get(key);
  if (!path) throw new Error(`Unknown concept ${key}`);
  const owned = ownedPrefixes(value, ns);
  const taken = new Set<string>((parse(strip(readFileSync(path, 'utf8'), committedIds(path), owned)).steps as { id?: string }[]).map((s) => s.id!).filter(Boolean));
  const { front, back } = build(value, taken, ns);
  todo.push(() => {
    patchFile(path, front, back, 0, dry, owned);
    const en = path.replace(/\.yaml$/, '.en.yaml');
    if (existsSync(en)) patchFile(en, front, back, 1, dry, owned);
  });
  lessons++;
  added += front.length + back.length;
}
// everything parsed and expanded without errors: now write
for (const job of todo) job();
console.log(`${dry ? 'dry run: ' : ''}${lessons} lessons, ${added} steps written, ${replaced} earlier tool steps replaced`);
