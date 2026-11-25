/** Checks German and English content of selected topic folders: node scripts/check-topics.ts brueche kreise … (all evals, 0 warnings wanted) */
import { checkContent } from '../packages/cli/src/index.ts';
const topics = process.argv.slice(2);
let bad = 0;
for (const locale of ['de', 'en']) {
  const { course, issues } = await checkContent('content', locale);
  const fileOf = (i: { file?: string; concept?: string }) => i.file ?? (i.concept ? course.files[i.concept] : undefined) ?? '';
  const mine = (f: string) => topics.length === 0 || topics.some((t) => f.includes(`content/topics/${t}/`));
  const shown = issues.filter((i) => mine(fileOf(i)) && (i.level !== 'info' || i.code === 'i18n.missing'));
  for (const i of shown) console.log(`[${locale}] ${i.level.toUpperCase()} ${i.code} ${fileOf(i)}${i.step ? ` ${i.step}` : ''}: ${i.message}`);
  bad += shown.length;
}
console.log(bad ? `${bad} problems` : 'OK – 0 errors, 0 warnings (de + en)');
process.exitCode = bad ? 1 : 0;
