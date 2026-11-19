/**
 * Gives every step an explicit id (its current positional id `sN`) and rewrites
 * `steps[n]` references in srs.cards_from, so that steps can be inserted or
 * reordered without changing the ids progress and reviews hang on.
 *   node scripts/pin-step-ids.ts [--write]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const write = process.argv.includes('--write');
let files = 0, pinned = 0, skipped = 0;
for (const t of readdirSync('content/topics')) {
  const dir = join('content/topics', t, 'concepts');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.yaml')) continue;
    const path = join(dir, f);
    const text = readFileSync(path, 'utf8');
    const doc = parse(text);
    const steps = doc.steps as { id?: string; kind: string }[];
    const lines = text.split('\n');
    const starts = lines.map((l, i) => (/^  - kind: (explain|problem)\s*$/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (starts.length !== steps.length) { console.log(`SKIP ${path}: ${starts.length} step lines vs ${steps.length} steps`); skipped++; continue; }
    const ids = steps.map((s, i) => s.id ?? `s${i + 1}`);
    const out: string[] = [];
    let k = 0;
    for (let i = 0; i < lines.length; i++) {
      out.push(lines[i]);
      if (i === starts[k]) {
        if (!steps[k].id) { out.push(`    id: ${ids[k]}`); pinned++; }
        k++;
      }
    }
    let next = out.join('\n').replace(/steps\[(\d+)\]/g, (_m, n) => ids[Number(n)] ?? _m);
    if (next !== text) { files++; if (write) writeFileSync(path, next); }
    // sanity: same ids after the rewrite
    const again = parse(next).steps as { id?: string }[];
    if (again.some((s, i) => s.id !== ids[i])) throw new Error(`id mismatch in ${path}`);
  }
}
console.log(`${write ? 'rewrote' : 'would rewrite'} ${files} files, pinned ${pinned} ids, skipped ${skipped}`);
