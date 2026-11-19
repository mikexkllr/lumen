/** Compact digest of a topic's lessons for reviewing: node scripts/digest.ts <topic-folder>... */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const clip = (s: unknown, n: number) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
for (const t of process.argv.slice(2)) {
  const topic = parse(readFileSync(join('content/topics', t, 'topic.yaml'), 'utf8'));
  const dir = join('content/topics', t, 'concepts');
  const byId = new Map<string, any>();
  for (const f of readdirSync(dir)) if (f.endsWith('.yaml') && !/\.[a-z]{2}\.yaml$/.test(f)) { const c = parse(readFileSync(join(dir, f), 'utf8')); byId.set(c.id, c); }
  console.log(`\n##### ${t} · ${topic.id} · ${topic.title} [${topic.area}/${topic.level}] – ${clip(topic.description, 160)}`);
  for (const u of topic.units) {
    console.log(`## ${u.id} ${u.title}`);
    for (const cid of u.concepts) {
      const c = byId.get(cid);
      if (!c) continue;
      console.log(`# ${cid} «${c.title}» skills=${(c.skills ?? []).join(',')} – ${clip(c.summary, 110)}`);
      for (const s of c.steps) {
        if (s.kind === 'explain') console.log(`  e${s.depth ? s.depth : ''} ${clip(s.body, 170)}${s.reveal ? ` ⟶ ${clip(s.reveal.body, 80)}` : ''}${s.visual ? ` [${s.visual.widget}]` : ''}`);
        else {
          const p = s.params ?? {};
          let ans = '';
          if (s.widget === 'choice') ans = (p.options ?? []).filter((o: any) => o.correct).map((o: any) => clip(o.label, 40)).join('|');
          else if (s.answer) ans = clip(JSON.stringify(s.answer), 60);
          else if (s.check) ans = clip(s.check.predicate, 60);
          console.log(`  ${s.widget}${s.depth ? s.depth : ''}${s.variants ? '~' : ''} ${clip(s.prompt, 150)} ⇒ ${ans}`);
        }
      }
    }
  }
}
