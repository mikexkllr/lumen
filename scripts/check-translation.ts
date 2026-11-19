/**
 * Checks translations of selected topics: `node scripts/check-translation.ts en brueche kreise …`
 * Prints errors and warnings (and missing translations) for those topic folders only.
 */
import { checkContent } from '../packages/cli/src/index.ts';

const [locale = 'en', ...topics] = process.argv.slice(2);
const { course, issues } = await checkContent('content', locale);
const fileOf = (i: { file?: string; concept?: string }) => i.file ?? (i.concept ? course.files[i.concept] : undefined) ?? '';
const mine = (f: string) => topics.length === 0 || topics.some((t) => f.includes(`content/topics/${t}/`));
const shown = issues.filter((i) => mine(fileOf(i)) && (i.level !== 'info' || i.code === 'i18n.missing'));
for (const i of shown) console.log(`${i.level.toUpperCase()} ${i.code} ${fileOf(i)}${i.step ? ` ${i.step}` : ''}: ${i.message}`);
const errors = shown.filter((i) => i.level === 'error').length, warnings = shown.filter((i) => i.level === 'warning').length;
const missing = shown.filter((i) => i.code === 'i18n.missing').length;
console.log(`${errors} errors · ${warnings} warnings · ${missing} untranslated files`);
process.exitCode = errors || warnings || missing ? 1 : 0;
