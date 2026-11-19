// Every step id that existed at HEAD must still exist (lost steps = tool bug).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parse } from 'yaml';
let lost = 0;
for (const t of readdirSync('content/topics')) {
  const dir = join('content/topics', t, 'concepts');
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.yaml')) continue;
    const path = join(dir, f);
    let old: string;
    try { old = execFileSync('git', ['show', `HEAD:${path}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { continue; }
    const before = (parse(old).steps as any[]);
    const now = (parse(readFileSync(path, 'utf8')).steps as any[]);
    const ids = new Set(now.map((s) => s.id));
    before.forEach((s, i) => { const id = s.id ?? `s${i + 1}`; if (!ids.has(id)) { console.log(`LOST ${path}: ${id}`); lost++; } });
    // order of the original steps must be unchanged
    const orig = before.map((s, i) => s.id ?? `s${i + 1}`);
    const kept = now.map((s) => s.id).filter((id) => orig.includes(id));
    if (kept.join() !== orig.filter((id) => ids.has(id)).join()) console.log(`REORDERED ${path}`);
  }
}
console.log(`lost: ${lost}`);
