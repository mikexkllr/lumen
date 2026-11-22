import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const by: Record<string, number> = {}; const old: Record<string, number> = {};
for (const i of d.issues) {
  if (i.code !== 'explanation.missing') continue;
  const c = parse(readFileSync(i.file, 'utf8'));
  const sid = i.step.split('/').pop();
  const st = c.steps.find((s: any) => s.id === sid);
  by[st.widget] = (by[st.widget] ?? 0) + 1;
  const tool = /^([a-z0-9]+-)?(hook|[cdx]\d+)$/.test(sid);
  old[tool ? 'new' : 'old'] = (old[tool ? 'new' : 'old'] ?? 0) + 1;
}
console.log(by, old);
