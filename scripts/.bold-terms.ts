/**
 * Marks one key term per explain step in bold (German and English), so the
 * recall check has a target:  node scripts/.bold-terms.ts pairs.txt
 * Line format:  concept.id/stepId|deutscher Begriff|English term
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const files = new Map<string, string>();
for (const t of readdirSync('content/topics')) {
  const d = join('content/topics', t, 'concepts');
  if (!existsSync(d)) continue;
  for (const f of readdirSync(d)) if (f.endsWith('.yaml') && !/\.[a-z]{2}\.yaml$/.test(f)) files.set(parse(readFileSync(join(d, f), 'utf8')).id, join(d, f));
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Wraps the first whole-word occurrence of `term` that is neither bold already nor inside $…$. */
function mark(text: string, term: string): string | null {
  const re = new RegExp(`(?<![\\p{L}\\p{N}*])${esc(term)}(?![\\p{L}\\p{N}*])`, 'gu');
  for (const m of text.matchAll(re)) {
    const before = text.slice(0, m.index);
    if ((before.match(/\$/g) ?? []).length % 2 === 1) continue; // inside math
    if ((before.match(/\*\*/g) ?? []).length % 2 === 1) continue; // inside bold
    return `${before}**${term}**${text.slice(m.index! + term.length)}`;
  }
  return null;
}

let ok = 0;
const failed: string[] = [];
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue;
  const [ref, de, en] = line.split('|').map((s) => s.trim());
  const [cid, sid] = ref.split('/');
  const base = files.get(cid);
  if (!base) { failed.push(`${ref}: unknown concept`); continue; }
  const jobs: [string, string][] = [[base, de], [base.replace(/\.yaml$/, '.en.yaml'), en]];
  const next: [string, string][] = [];
  let problem = '';
  for (const [path, term] of jobs) {
    if (term === '-') continue; // leave this language as it is
    const src = readFileSync(path, 'utf8');
    const step = (parse(src).steps as any[]).find((s) => s.id === sid);
    if (!step) { problem = `${path}: no step ${sid}`; break; }
    const want = mark(String(step.body), term);
    if (!want) { problem = `${path.endsWith('.en.yaml') ? 'EN' : 'DE'} »${term}« not found in: ${String(step.body).replace(/\s+/g, ' ').slice(0, 260)}`; break; }
    // edit the raw text inside this step's block only
    const lines = src.split('\n');
    const at = lines.findIndex((l) => l === `    id: ${sid}`);
    let end = lines.findIndex((l, i) => i > at && /^  - kind: /.test(l));
    if (end < 0) end = lines.findIndex((l, i) => i > at && /^\S/.test(l));
    if (end < 0) end = lines.length;
    let start = at;
    while (start > 0 && !/^  - kind: /.test(lines[start])) start--;
    const block = lines.slice(start, end).join('\n');
    let edited = mark(block, term);
    if (edited) {
      // a plain scalar must not start with * (YAML alias) – quote it
      edited = edited.replace(/^(\s+body: )(\*\*[^\n]*)$/m, (_m, k, v) => `${k}'${v.replace(/'/g, "''")}'`);
    }
    const out = edited ? [...lines.slice(0, start), ...edited.split('\n'), ...lines.slice(end)].join('\n') : src;
    let got = '';
    try { got = String((parse(out).steps as any[]).find((s) => s.id === sid).body); } catch { got = ''; }
    if (!edited || got !== want) { problem = `${path}: could not edit safely (term »${term}«)`; break; }
    next.push([path, out]);
  }
  if (problem) { failed.push(`${ref}: ${problem}`); continue; }
  for (const [path, out] of next) writeFileSync(path, out);
  ok++;
}
console.log(`${ok} steps marked, ${failed.length} failed`);
if (failed.length) console.log(failed.join('\n'));
