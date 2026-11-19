/**
 * Lesson audit: one line of metrics per lesson, plus totals.
 *   node scripts/audit-lessons.ts [--json out.json] [--flags]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const root = 'content/topics';
const rows: any[] = [];
for (const t of readdirSync(root).sort()) {
  const tp = join(root, t, 'topic.yaml');
  if (!existsSync(tp)) continue;
  const topic = parse(readFileSync(tp, 'utf8'));
  const dir = join(root, t, 'concepts');
  const byId = new Map<string, any>();
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.yaml') || /\.[a-z]{2}\.yaml$/.test(f)) continue;
    const c = parse(readFileSync(join(dir, f), 'utf8'));
    byId.set(c.id, { ...c, file: join(dir, f) });
  }
  for (const u of topic.units) for (const cid of u.concepts) {
    const c = byId.get(cid);
    if (!c) continue;
    const steps = c.steps as any[];
    const problems = steps.filter((s) => s.kind === 'problem');
    const explains = steps.filter((s) => s.kind === 'explain');
    const passive = explains.filter((s) => !s.reveal && !(s.visual && s.visual.interactive));
    const widgets: Record<string, number> = {};
    for (const p of problems) widgets[p.widget] = (widgets[p.widget] ?? 0) + 1;
    let maxExplainRun = 0, run = 0;
    for (const s of steps) { if (s.kind === 'explain') { run++; maxExplainRun = Math.max(maxExplainRun, run); } else run = 0; }
    const choice = widgets.choice ?? 0;
    rows.push({
      area: topic.area, level: topic.level, topic: t, unit: u.id.split('.').pop(), id: cid, file: c.file, title: c.title,
      steps: steps.length, problems: problems.length, explains: explains.length, passive: passive.length,
      visuals: steps.filter((s) => s.visual).length, reveals: explains.filter((s) => s.reveal).length,
      choice, kinds: Object.keys(widgets).length, widgets,
      firstKind: steps[0].kind, maxExplainRun,
      maxDiff: Math.max(0, ...problems.map((p) => p.difficulty ?? 1)),
      variants: problems.filter((p) => p.variants).length,
      seq: steps.map((s) => (s.kind === 'explain' ? (s.reveal ? 'R' : s.visual?.interactive ? 'I' : s.visual ? 'V' : 'e') : s.widget)).join(' '),
    });
  }
}
const args = process.argv.slice(2);
const ji = args.indexOf('--json');
if (ji >= 0) writeFileSync(args[ji + 1], JSON.stringify(rows, null, 1));
const sum = (k: string) => rows.reduce((a, r) => a + r[k], 0);
const W: Record<string, number> = {};
for (const r of rows) for (const [k, v] of Object.entries(r.widgets)) W[k] = (W[k] ?? 0) + (v as number);
console.log(`lessons ${rows.length} steps ${sum('steps')} problems ${sum('problems')} explains ${sum('explains')} passive ${sum('passive')} reveals ${sum('reveals')} visuals ${sum('visuals')}`);
console.log('widgets', Object.entries(W).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' '));
const hist = (k: string) => { const h: Record<string, number> = {}; for (const r of rows) h[r[k]] = (h[r[k]] ?? 0) + 1; return Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([a, b]) => `${a}:${b}`).join(' '); };
console.log('steps/lesson', hist('steps'));
console.log('problems/lesson', hist('problems'));
console.log('widget kinds/lesson', hist('kinds'));
console.log('maxExplainRun', hist('maxExplainRun'));
console.log('maxDiff', hist('maxDiff'));
console.log('first step', hist('firstKind'));
console.log('choice-only lessons', rows.filter((r) => r.choice === r.problems).length, ' choice>=60%', rows.filter((r) => r.choice / r.problems >= 0.6).length);
console.log('no visual at all', rows.filter((r) => r.visuals === 0).length);
if (args.includes('--list')) for (const r of rows) console.log(`${r.area}|${r.level}|${r.id}|${r.steps}|${r.seq}`);
