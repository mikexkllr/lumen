/**
 * "Kurz-Check" – a one-tap recall check for explain screens. Authors write
 * nothing: the check is built from the key terms an explain text marks in
 * bold. One term is blanked; the learner picks it from three options, the
 * other two being key terms of the same course. Reading turns into retrieval.
 */
import { hashString, mulberry32, shuffle } from './rng.ts';
import type { ExplainStep } from './schema.ts';

export interface RecallCheck {
  /** The explain text with the term blanked (Markdown). */
  text: string;
  answer: string;
  /** Three options in display order. */
  options: string[];
}

export const RECALL_GAP = '＿＿＿';

const BOLD = /\*\*([^*]+)\*\*/g;
const letters = (s: string) => (s.match(/\p{L}/gu) ?? []).length;

/** Words that are bold for emphasis, not because they name an idea. */
const FILLER = new Set(
  'alle allen aller alles beide dasselbe ein eine einen einer einige immer jede jedem jeden jeder jedes kein keine keinen mehr nicht nie nur ohne viele weniger welche welcher zwei drei der die das und oder vor nach mal plus minus gleich genau all always and any both each every exactly more less never no none not only or same some the two three which without before after times a an'.split(' '),
);

/** Whether a bold span works as a recall target: a word or short phrase, not a formula, a number or mere emphasis. */
function usable(term: string): boolean {
  if (term.length < 3 || term.length > 34) return false;
  if (FILLER.has(term.split(/\s+/)[0].toLowerCase())) return false;
  if (/[$=<>→≈·×÷]|\\|\d\s*[+−-]\s*\d/.test(term)) return false;
  if (term.split(/\s+/).length > 4) return false;
  return letters(term) >= 3 && letters(term) / term.replace(/\s/g, '').length >= 0.7;
}

/** The key terms an explain text marks in bold, in reading order. */
export function keyTerms(body: string): string[] {
  const out: string[] = [];
  for (const m of body.matchAll(BOLD)) {
    const term = m[1].trim().replace(/[.,:;!?]+$/, '');
    if (usable(term) && !out.includes(term)) out.push(term);
  }
  return out;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s: string) => s.toLowerCase();
const related = (a: string, b: string) => {
  const x = norm(a);
  const y = norm(b);
  // same word in another form (»Säure« / »Säuren«) would make two answers defensible
  const stem = Math.max(4, Math.min(x.length, y.length) - 2);
  return x.includes(y) || y.includes(x) || x.slice(0, stem) === y.slice(0, stem);
};
const isUpper = (s: string) => /^\p{Lu}/u.test(s);

/**
 * Builds the check for one explain step, or null when the step already is
 * interactive (reveal, interactive visual) or has no usable key term.
 * `pool` are the key terms of the whole course (see `keyTerms`).
 */
export function recallCheck(step: Pick<ExplainStep, 'body' | 'reveal' | 'visual' | 'id'>, pool: readonly string[], seed = 0): RecallCheck | null {
  if (step.reveal || step.visual?.interactive) return null;
  const own = keyTerms(step.body);
  if (!own.length) return null;
  const rnd = mulberry32(hashString(`${step.id}#${seed}`));
  const answer = own[seed % own.length];
  const words = answer.split(/\s+/).length;
  const seen = new Set<string>();
  const candidates = shuffle(pool, rnd).filter((c) => {
    const key = norm(c);
    if (seen.has(key) || own.some((o) => related(o, c)) || norm(step.body).includes(key)) return false;
    seen.add(key);
    return true;
  });
  if (candidates.length < 2) return null;
  // distractors that look like the answer: similar length, same number of words, same capitalisation
  const cost = (c: string) => Math.abs(c.length - answer.length) + (c.split(/\s+/).length === words ? 0 : 6) + (isUpper(c) === isUpper(answer) ? 0 : 4);
  const picked = candidates.map((c, i) => ({ c, i, k: cost(c) })).sort((a, b) => a.k - b.k || a.i - b.i).slice(0, 2).map((x) => x.c);
  // hide the answer wherever it stands as a word of its own, not only where it is bold
  const whole = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(answer)}(?![\\p{L}\\p{N}])`, 'gu');
  const text = step.body.split(`**${answer}**`).join(`**${RECALL_GAP}**`).replace(whole, RECALL_GAP);
  return { text, answer, options: shuffle([answer, ...picked], rnd) };
}

/** All key terms of a list of steps (explanations, prompts, solutions) – the distractor pool of a course. */
export function recallPool(steps: readonly { body?: string; prompt?: string; explanation?: string; reveal?: { body: string } }[]): string[] {
  const out = new Set<string>();
  for (const s of steps) for (const text of [s.body, s.reveal?.body, s.prompt, s.explanation]) if (text) for (const term of keyTerms(text)) out.add(term);
  return [...out];
}
