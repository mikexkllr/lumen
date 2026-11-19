/**
 * Lux – the Lumen tutor (engine part, MIT).
 *
 * Everything here is deterministic and model-agnostic:
 *  - buildTutorContext(): turns the problem instance and the learner's state
 *    into a compact, grounded context (task, learner answer, misconception,
 *    hints, solution – the latter marked secret until the task is solved).
 *  - tutorMessages(): the chat prompt for any OpenAI-compatible model.
 *  - findLeak(): a guard that rejects model replies that give the answer away.
 *  - ruleReply(): a tutor without a model (offline, tests, fallback).
 *
 * The model only rephrases and adapts what the authored lesson already knows;
 * correctness never depends on it.
 */
import { formatNumber } from './expr.ts';
import { checkProblem, describeState, initialState, type ResolvedProblem } from './runtime.ts';
import { referenceSolve } from './solver.ts';
import { optionIds } from './widgets/choice.ts';

export const TUTOR_NAME = 'Lux';

export type TutorStatus = 'unanswered' | 'wrong' | 'correct' | 'revealed' | 'explain';
/**
 * What the learner asks for. `chat` and `reasoning` carry free text: `reasoning`
 * is the learner's answer to Lux asking how they got to a wrong answer.
 */
export type TutorIntent = 'why-wrong' | 'hint' | 'rephrase' | 'explain-task' | 'why-right' | 'explain-step' | 'chat' | 'reasoning';
/** Intents that are a fixed quick action (a chip) rather than typed text. */
export type QuickIntent = Exclude<TutorIntent, 'chat' | 'reasoning'>;

export const isFreeText = (intent: TutorIntent): intent is 'chat' | 'reasoning' => intent === 'chat' || intent === 'reasoning';

export interface TutorGuard {
  /** Numbers that must not appear in a reply (the answer). */
  numbers: number[];
  /** Phrases that must not appear (correct option labels, answer terms). */
  phrases: string[];
  /** Option letters of correct answers (»Option A«). */
  letters: string[];
}

export interface TutorContext {
  v: 1;
  locale: string;
  course?: string;
  lesson?: string;
  /** Task text (body + prompt) or explanation text for explain steps. */
  task: string;
  kind: string;
  /** Choice options as shown, lettered. */
  options?: string[];
  /** Starting situation of interactive widgets. */
  setup?: string;
  /** The learner's current answer, described in words. */
  learner?: string;
  /** The same answer in a few words, as the learner gave it (»1003 N«, an option label). */
  answer?: string;
  status: TutorStatus;
  attempts: number;
  /** Misconception or diagnosis from the authored feedback rules. */
  mistake?: string;
  hints: string[];
  hintsShown: number;
  /** Secret until solved. */
  solution?: string;
  explanation?: string;
  guard: TutorGuard;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MAX = { task: 900, field: 400, hint: 240, hints: 4 };

const clip = (s: string | undefined, n: number) => {
  if (!s) return undefined;
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

const KIND_DE: Record<string, string> = {
  choice: 'Auswahl – eine Option antippen',
  numeric: 'Zahl eingeben',
  expression: 'Term eingeben',
  order: 'In die richtige Reihenfolge bringen',
  tiles: 'Bausteine zusammensetzen',
  buckets: 'Karten in Gruppen sortieren',
  match: 'Paare verbinden',
  graph: 'Punkte im Koordinatensystem setzen',
  slider: 'Regler einstellen',
  numberline: 'Markierung auf dem Zahlenstrahl setzen',
  fraction: 'Anteil einfärben',
  balance: 'Waage ausgleichen',
  gates: 'Logikgatter wählen',
  network: 'Im Netzwerk tippen',
  venn: 'Bereiche im Venn-Diagramm färben',
  pixels: 'Felder schalten',
  bits: 'Bits schalten',
  robot: 'Roboter programmieren',
  logicgrid: 'Logikgitter ausfüllen',
  chart: 'Diagramm ablesen oder einstellen',
  distribution: 'Verteilung einstellen',
  nim: 'Spiel gegen den Computer',
  hanoi: 'Türme umschichten',
  angle: 'Winkel einstellen',
  rect: 'Rechteck einstellen',
  swap: 'Balken tauschen',
};

const LETTERS = 'ABCDEFGH';

/** Builds the grounded context for one problem instance. */
export function buildTutorContext(
  rp: ResolvedProblem,
  state: unknown,
  info: { status: Exclude<TutorStatus, 'explain'>; attempts: number; hintsShown: number; course?: string; lesson?: string },
): TutorContext {
  const kind = rp.widget.kind;
  const task = [rp.body, rp.prompt].filter(Boolean).join('\n');
  const guard: TutorGuard = { numbers: [], phrases: [], letters: [] };
  let options: string[] | undefined;
  let setup: string | undefined;
  let learner: string | undefined;
  let answer: string | undefined;
  let mistake: string | undefined;
  let solution: string | undefined;

  if (kind === 'choice') {
    const opts = (rp.params.options ?? []) as { label: string; correct?: boolean }[];
    options = opts.map((o, i) => `${LETTERS[i]}) ${o.label}`);
    opts.forEach((o, i) => {
      if (!o.correct) return;
      guard.letters.push(LETTERS[i]);
      guard.phrases.push(o.label);
    });
    solution = opts.filter((o) => o.correct).map((o) => o.label).join(' · ');
  } else if (kind === 'numeric' && rp.answer) {
    const v = rp.answer.value;
    const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    if (Number.isFinite(n)) guard.numbers.push(n);
    else guard.phrases.push(String(v));
    solution = typeof v === 'number' ? formatNumber(v, rp.locale) : String(v);
    if (rp.params.unit) solution += ` ${rp.params.unit}`;
  } else if (kind === 'expression' && rp.answer) {
    guard.phrases.push(rp.answer.equivalentTo);
    solution = rp.answer.equivalentTo;
  }
  if (!solution) {
    try {
      const sol = referenceSolve(rp);
      if (sol) solution = describeState(rp, sol.state);
    } catch {
      // solving is best effort; the explanation still grounds the model
    }
  }
  if (!['choice', 'numeric', 'expression'].includes(kind)) {
    try {
      setup = describeState(rp, initialState(rp));
    } catch {
      setup = undefined;
    }
  }
  if (info.status !== 'unanswered' && state !== null && state !== undefined) {
    try {
      learner = describeState(rp, state);
    } catch {
      learner = undefined;
    }
    answer = shortAnswer(rp, state);
  }
  if (info.status === 'wrong') {
    try {
      mistake = checkProblem(rp, state).feedback?.text;
    } catch {
      mistake = undefined;
    }
  }
  // Numbers that are already part of the task are no secret.
  guard.numbers = guard.numbers.filter((n) => !containsNumber(task, n));
  guard.phrases = guard.phrases.filter((p) => p.trim().length >= 2 && !norm(task).includes(norm(p)));

  return {
    v: 1,
    locale: rp.locale,
    course: clip(info.course, 80),
    lesson: clip(info.lesson, 80),
    task: clip(task, MAX.task)!,
    kind,
    options: options?.map((o) => clip(o, 160)!),
    setup: clip(setup, MAX.field),
    learner: clip(learner, MAX.field),
    answer: clip(answer, 120),
    status: info.status,
    attempts: info.attempts,
    mistake: clip(mistake, MAX.field),
    hints: rp.hints.slice(0, MAX.hints).map((h) => clip(h, MAX.hint)!),
    hintsShown: Math.min(info.hintsShown, rp.hints.length),
    solution: clip(solution, MAX.field),
    explanation: clip(rp.explanation, MAX.field),
    guard,
  };
}

/** The learner's answer in their own terms, for widgets where that is short. */
function shortAnswer(rp: ResolvedProblem, state: unknown): string | undefined {
  const s = state as { input?: unknown; selected?: unknown } | null;
  if (!s || typeof s !== 'object') return undefined;
  if ((rp.widget.kind === 'numeric' || rp.widget.kind === 'expression') && typeof s.input === 'string' && s.input.trim()) {
    const unit = rp.widget.kind === 'numeric' && rp.params.unit ? ` ${rp.params.unit}` : '';
    return `${s.input.trim()}${unit}`;
  }
  if (rp.widget.kind === 'choice' && Array.isArray(s.selected) && s.selected.length) {
    const opts = (rp.params.options ?? []) as { label: string }[];
    const ids = optionIds(rp.params as Parameters<typeof optionIds>[0]);
    const labels = s.selected.map((id) => opts[ids.indexOf(String(id))]?.label).filter(Boolean);
    return labels.length ? labels.join(', ') : undefined;
  }
  return undefined;
}

/** Context for an explanation screen (nothing is secret there). */
export function buildExplainContext(text: string, info: { locale: string; course?: string; lesson?: string }): TutorContext {
  return {
    v: 1,
    locale: info.locale,
    course: clip(info.course, 80),
    lesson: clip(info.lesson, 80),
    task: clip(text, MAX.task)!,
    kind: 'explain',
    status: 'explain',
    attempts: 0,
    hints: [],
    hintsShown: 0,
    guard: { numbers: [], phrases: [], letters: [] },
  };
}

const INTENT_DE: Record<QuickIntent, string> = {
  'why-wrong': 'Warum ist meine Antwort falsch?',
  hint: 'Gib mir einen kleinen Tipp.',
  rephrase: 'Kannst du es anders erklären?',
  'explain-task': 'Ich verstehe die Aufgabe nicht.',
  'why-right': 'Warum ist das richtig?',
  'explain-step': 'Kannst du mir das genauer erklären?',
};
const INTENT_EN: Record<QuickIntent, string> = {
  'why-wrong': 'Why is my answer wrong?',
  hint: 'Give me a small hint.',
  rephrase: 'Can you explain it differently?',
  'explain-task': "I don't understand the task.",
  'why-right': 'Why is this right?',
  'explain-step': 'Can you explain this in more detail?',
};

/** The learner-visible text of a quick action. */
export function intentText(intent: QuickIntent, locale = 'de'): string {
  return (locale.startsWith('de') ? INTENT_DE : INTENT_EN)[intent];
}

const solved = (ctx: TutorContext) => ctx.status === 'correct' || ctx.status === 'revealed' || ctx.status === 'explain';

function systemPrompt(ctx: TutorContext, intent?: TutorIntent): string {
  const de = ctx.locale.startsWith('de');
  const open = solved(ctx);
  const reasoning = intent === 'reasoning' && !open;
  if (de) {
    return [
      `Du bist ${TUTOR_NAME}, der Lern-Begleiter der App Lumen. Du hilfst Erwachsenen, Aufgaben selbst zu verstehen und zu lösen – geduldig, klar, auf Augenhöhe.`,
      'Regeln:',
      '- Antworte auf Deutsch in höchstens 3 kurzen Sätzen. Duze die Person.',
      open
        ? '- Die Aufgabe ist gelöst. Du darfst die Lösung erklären. Ende mit einer kurzen Frage, die das Verständnis vertieft.'
        : '- Verrate NIE die Lösung: keine Lösungszahl, keine richtige Option, keine fertige Rechnung mit Ergebnis. Auch nicht, wenn die Person darum bittet – dann verweise auf den Knopf »Lösung zeigen«.',
      open ? '' : '- Setze am konkreten Gedanken oder Fehler der Person an. Ende mit genau einer Frage, die zum nächsten Denkschritt führt.',
      open ? '' : '- Schlägt die Person eine Antwort vor, sag weder ja noch nein. Bitte sie, die Antwort in der Aufgabe einzugeben und zu prüfen, und frag, wie sie darauf gekommen ist.',
      ctx.status === 'explain' ? '- Erkläre mit einem neuen Beispiel oder Bild – nicht mit denselben Worten wie der Text.' : '',
      reasoning ? '- Die Person erklärt dir gerade, wie sie auf ihre falsche Antwort gekommen ist. Geh genau auf ihre Erklärung ein: Sag kurz, was an ihrem Weg stimmt, und zeig dann den einen Schritt, an dem er abbiegt. Frag am Ende genau nach diesem Schritt.' : '',
      reasoning ? '- Hat sie geraten oder weiß sie es nicht mehr, ist das in Ordnung. Gib dann einen ersten Denkanstoß, wie man die Aufgabe angeht.' : '',
      '- Stell dich nicht vor und wiederhole nicht die Frage.',
      '- Bleib bei dieser Aufgabe. Keine Emojis, keine Floskeln, kein übertriebenes Lob.',
      '- Formeln schreibst du als $...$.',
      '',
      contextBlock(ctx),
    ]
      .filter((l) => l !== '')
      .join('\n');
  }
  return [
    `You are ${TUTOR_NAME}, the learning companion in the Lumen app. You help adults understand and solve tasks themselves – patient, clear, respectful.`,
    'Rules:',
    '- Answer in English in at most 3 short sentences.',
    open
      ? '- The task is solved. You may explain the solution. End with a short question that deepens understanding.'
      : '- NEVER reveal the solution: no answer number, no correct option, no finished calculation with result. If asked, point to the »Show solution« button.',
    open ? '' : '- Build on what the learner actually did. End with exactly one question that leads to the next step.',
    open ? '' : '- If the learner proposes an answer, neither confirm nor reject it. Ask them to enter it in the task and check, and ask how they got there.',
    ctx.status === 'explain' ? '- Explain with a new example or picture – not with the same words as the text.' : '',
    reasoning ? '- The learner is explaining how they reached their wrong answer. Respond to exactly that: briefly say what is right about their approach, then point to the one step where it goes off track. End by asking about that step.' : '',
    reasoning ? '- If they guessed or do not remember, that is fine. Then give a first nudge on how to approach the task.' : '',
    '- Do not introduce yourself and do not repeat the question.',
    '- Stay on this task. No emojis, no filler, no exaggerated praise.',
    '- Write formulas as $...$.',
    '',
    contextBlock(ctx),
  ]
    .filter((l) => l !== '')
    .join('\n');
}

function contextBlock(ctx: TutorContext): string {
  const de = ctx.locale.startsWith('de');
  const L = de
    ? { lesson: 'LEKTION', task: ctx.status === 'explain' ? 'ERKLÄRTEXT' : 'AUFGABE', format: 'FORMAT', options: 'OPTIONEN', setup: 'AUSGANGSLAGE', state: 'STAND', open: 'noch nicht beantwortet', answer: 'Antwort der Person', wrong: 'falsch', try: 'Versuch', right: 'richtig gelöst', shown: 'Lösung wurde gezeigt', mistake: 'DENKFEHLER (aus der Lektion)', hint: 'NÄCHSTER HINWEIS', hints: 'HINWEISE DER LEKTION', secret: 'GEHEIM – NICHT NENNEN', known: 'LÖSUNG (darf erklärt werden)', sol: 'Lösung', expl: 'Erklärung' }
    : { lesson: 'LESSON', task: ctx.status === 'explain' ? 'EXPLANATION' : 'TASK', format: 'FORMAT', options: 'OPTIONS', setup: 'START', state: 'STATE', open: 'not answered yet', answer: 'Learner answer', wrong: 'wrong', try: 'attempt', right: 'solved correctly', shown: 'solution was shown', mistake: 'MISCONCEPTION (from the lesson)', hint: 'NEXT HINT', hints: 'LESSON HINTS', secret: 'SECRET – DO NOT REVEAL', known: 'SOLUTION (may be explained)', sol: 'Solution', expl: 'Explanation' };
  const lines: string[] = [];
  if (ctx.course || ctx.lesson) lines.push(`${L.lesson}: ${[ctx.course, ctx.lesson].filter(Boolean).join(' › ')}`);
  lines.push(`${L.task}: ${ctx.task}`);
  if (ctx.status === 'explain') return lines.join('\n');
  lines.push(`${L.format}: ${de ? (KIND_DE[ctx.kind] ?? ctx.kind) : ctx.kind}`);
  if (ctx.options?.length) lines.push(`${L.options}: ${ctx.options.join(' · ')}`);
  if (ctx.setup) lines.push(`${L.setup}: ${ctx.setup}`);
  if (ctx.status === 'unanswered') lines.push(`${L.state}: ${L.open}`);
  else if (ctx.status === 'wrong') lines.push(`${L.state}: ${L.answer}: ${ctx.learner ?? '–'} (${L.wrong}, ${L.try} ${ctx.attempts})`);
  else if (ctx.status === 'correct') lines.push(`${L.state}: ${L.right}${ctx.learner ? ` – ${ctx.learner}` : ''}`);
  else lines.push(`${L.state}: ${L.shown}`);
  if (ctx.mistake) lines.push(`${L.mistake}: ${ctx.mistake}`);
  if (solved(ctx)) {
    if (ctx.hints.length) lines.push(`${L.hints}: ${ctx.hints.join(' / ')}`);
    const parts = [ctx.solution && `${L.sol}: ${ctx.solution}`, ctx.explanation && `${L.expl}: ${ctx.explanation}`].filter(Boolean);
    if (parts.length) lines.push(`${L.known}: ${parts.join('; ')}`);
  } else {
    const next = ctx.hints[Math.min(ctx.hintsShown, ctx.hints.length - 1)];
    if (next) lines.push(`${L.hint}: ${next}`);
    const parts = [ctx.solution && `${L.sol}: ${ctx.solution}`, ctx.explanation && `${L.expl}: ${ctx.explanation}`].filter(Boolean);
    if (parts.length) lines.push(`${L.secret}: ${parts.join('; ')}`);
  }
  return lines.join('\n');
}

/** Chat prompt for an OpenAI-compatible endpoint. `history` excludes the new user turn. */
export function tutorMessages(ctx: TutorContext, history: ChatMessage[], userText: string, opts: { strict?: boolean; intent?: TutorIntent } = {}): ChatMessage[] {
  const msgs: ChatMessage[] = [{ role: 'system', content: systemPrompt(ctx, opts.intent) }];
  for (const m of history.slice(-8)) if (m.role !== 'system') msgs.push({ role: m.role, content: m.content.slice(0, 800) });
  let content = userText.slice(0, 600);
  if (opts.intent === 'reasoning' && !solved(ctx)) {
    content = ctx.locale.startsWith('de')
      ? `So bin ich auf meine Antwort gekommen: ${content}\n\n(Geh auf meine Erklärung ein: Was daran stimmt – und an welchem Schritt liege ich falsch? Stell deine Frage nicht noch einmal.)`
      : `This is how I got my answer: ${content}\n\n(Respond to my explanation: what is right about it – and at which step am I wrong? Do not repeat your question.)`;
  }
  if (opts.strict && !solved(ctx)) {
    content += ctx.locale.startsWith('de')
      ? '\n\n(Erinnerung: Nenne auf keinen Fall die Lösung. Gib nur einen Denkanstoß und stelle eine Frage.)'
      : '\n\n(Reminder: do not state the solution under any circumstances. Give a nudge and ask a question.)';
  }
  msgs.push({ role: 'user', content });
  return msgs;
}

// ---------------------------------------------------------------------------
// Leak guard

function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[$*_`»«"'„“”‚‘’()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function numberForms(n: number): string[] {
  const forms = new Set<string>([String(n), formatNumber(n, 'de')]);
  if (Math.abs(n) >= 1000 && Number.isInteger(n)) {
    const s = String(Math.abs(n));
    const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    forms.add((n < 0 ? '-' : '') + grouped);
    forms.add((n < 0 ? '-' : '') + grouped.replace(/\./g, ' '));
    forms.add((n < 0 ? '-' : '') + grouped.replace(/\./g, ' '));
  }
  return [...forms];
}

function containsNumber(text: string, n: number): boolean {
  return numberForms(n).some((f) => {
    const esc = f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\d.,])${esc}(?![\\d]|[.,]\\d)`).test(text);
  });
}

const STOP = new Set(['der', 'die', 'das', 'und', 'oder', 'mit', 'ein', 'eine', 'einen', 'ist', 'sind', 'von', 'zu', 'im', 'in', 'auf', 'the', 'a', 'an', 'of', 'and', 'or', 'to', 'is', 'it', 'es', 'du', 'dass', 'nicht', 'auch', 'den', 'dem', 'des', 'als', 'wie', 'so']);

/** Returns why a reply gives the answer away, or null if it is safe. */
export function findLeak(reply: string, ctx: TutorContext): string | null {
  if (solved(ctx)) return null;
  const r = norm(reply);
  for (const n of ctx.guard.numbers) if (containsNumber(reply, n)) return `number ${n}`;
  for (const p of ctx.guard.phrases) {
    const np = norm(p);
    if (np.length >= 2 && (np.length >= 4 ? r.includes(np) : new RegExp(`(^|\\W)${np.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`).test(r))) return `phrase »${p}«`;
    // most of a longer correct option, reworded slightly
    const words = np.split(' ').filter((w) => w.length >= 4 && !STOP.has(w));
    const taskWords = new Set(norm(ctx.task).split(' '));
    const own = words.filter((w) => !taskWords.has(w));
    const replyWords = r.split(' ');
    const stem = (w: string) => w.slice(0, Math.max(3, w.length - 2));
    const hit = own.filter((w) => replyWords.some((rw) => rw.startsWith(stem(w)))).length;
    if (own.length >= 2 && hit / own.length >= 0.75) return `phrase »${p}«`;
  }
  for (const l of ctx.guard.letters) {
    if (new RegExp(`(option|antwort|answer|choice|lösung|loesung)\\s*${l.toLowerCase()}\\b|\\b${l.toLowerCase()}\\)\\s|\\b${l.toLowerCase()}\\s+ist\\s+(richtig|korrekt)|\\b${l.toLowerCase()}\\s+is\\s+(right|correct)`).test(r)) return `letter ${l}`;
  }
  // copying a long stretch of the secret solution or explanation
  const taskN = norm(ctx.task);
  for (const secret of [ctx.solution, ctx.explanation]) {
    if (!secret) continue;
    const w = norm(secret).split(' ');
    for (let i = 0; i + 5 <= w.length; i++) {
      const gram = w.slice(i, i + 5).join(' ');
      if (r.includes(gram) && !taskN.includes(gram)) return 'copies the solution';
    }
  }
  return null;
}

/** True when a reply mostly repeats what Lux already said (small models like to echo their last turn). */
export function isEcho(reply: string, history: readonly ChatMessage[]): boolean {
  const r = norm(reply);
  if (!r) return false;
  const words = new Set(r.split(' '));
  return history
    .filter((m) => m.role === 'assistant')
    .slice(-2)
    .some((m) => {
      const prev = norm(m.content);
      if (!prev) return false;
      if (prev.includes(r) || r.includes(prev)) return true;
      const pw = prev.split(' ');
      const shared = pw.filter((w) => words.has(w)).length;
      return shared / Math.max(pw.length, words.size) >= 0.8;
    });
}

// ---------------------------------------------------------------------------
// Asking for the learner's reasoning

/**
 * Lux's opening question after a wrong answer: before explaining anything, he
 * asks how the learner got there. Deterministic, so it is instant and can never
 * give the answer away. `revisit` is the mistakes review at the end of a lesson.
 */
export function reasoningQuestion(ctx: TutorContext, opts: { revisit?: boolean } = {}): string {
  const de = ctx.locale.startsWith('de');
  const a = ctx.answer;
  const chose = ctx.kind === 'choice';
  const again = !opts.revisit ? ctx.attempts > 1 : ctx.attempts > 2;
  if (de) {
    const q = `»${a}«`;
    if (opts.revisit && !again) return a ? `Hier hattest du ${q} ${chose ? 'gewählt' : 'geantwortet'}. Weißt du noch, wie du darauf gekommen bist?` : 'An dieser Aufgabe bist du vorhin hängen geblieben. Weißt du noch, wie du vorgegangen bist?';
    if (again) return a ? `Diesmal ${chose ? 'hast du' : 'ist es'} ${q}${chose ? ' gewählt' : ''}. Was hat dich davon überzeugt?` : 'Wieder nicht ganz. Was hast du diesmal anders gemacht – und warum?';
    return a ? `Du hast ${q} ${chose ? 'gewählt' : 'geantwortet'}. Wie bist du darauf gekommen?` : 'Erzähl mal: Wie bist du vorgegangen – und warum dachtest du, dass es so stimmt?';
  }
  const q = `»${a}«`;
  if (opts.revisit && !again) return a ? `Earlier you ${chose ? 'picked' : 'answered'} ${q} here. Do you remember how you got there?` : 'You got stuck on this one earlier. Do you remember how you approached it?';
  if (again) return a ? `This time it's ${q}. What convinced you?` : 'Not quite again. What did you do differently this time – and why?';
  return a ? `You ${chose ? 'picked' : 'answered'} ${q}. How did you get there?` : 'Tell me: how did you go about it – and why did you think it was right?';
}

const GUESS = /\b(geraten|rate|raten|zufall|zufällig|keine ahnung|weiß (es )?nicht|weiss (es )?nicht|keinen plan|bauchgefühl|guess(ed)?|no idea|don'?t know|random)/i;

// ---------------------------------------------------------------------------
// Tutor without a model

/**
 * Deterministic tutor built only from authored lesson material. `turn` counts
 * earlier tutor messages in this conversation so repeated requests advance.
 */
export function ruleReply(ctx: TutorContext, intent: TutorIntent, turn = 0, message?: string): string {
  const de = ctx.locale.startsWith('de');
  const hints = ctx.hints;
  const nextHint = (offset = 0) => hints[Math.min(ctx.hintsShown + turn + offset, hints.length - 1)];
  const S = de
    ? {
        noMore: 'Mehr Tipps habe ich hier nicht. Probier es noch einmal – oder lass dir mit »Lösung zeigen« die Lösung erklären.',
        look: 'Schau dir deine Antwort noch einmal Schritt für Schritt an.',
        task: 'Lies die Aufgabe in zwei Teilen: Was ist gegeben – und was ist gesucht?',
        format: (k: string) => `Hier heißt es: ${KIND_DE[k] ?? 'die Aufgabe lösen'}.`,
        tip: 'Tipp:',
        explainStep: 'Lies den Abschnitt noch einmal langsam. Welcher Satz ist für dich der unklare? Schreib ihn mir, dann gehen wir ihn zusammen durch.',
        try: 'Was würdest du als Nächstes ausprobieren?',
        propose: 'Probier es aus: Gib deine Antwort in der Aufgabe ein und prüfe sie. Wie bist du darauf gekommen?',
        guess: 'Ehrlich – das hilft mir. Statt zu raten, bauen wir uns einen Weg.',
        thanks: 'Danke, so sehe ich, wie du denkst.',
        point: 'Ein Punkt, an dem es oft hakt:',
        check: 'Geh deine Überlegung Schritt für Schritt durch und vergleich jeden Schritt mit der Aufgabe.',
        which: 'Welcher Schritt in deinem Weg passt nicht dazu?',
        start: 'Womit würdest du anfangen?',
      }
    : {
        noMore: 'I have no more hints here. Give it another try – or use »Show solution« to see it explained.',
        look: 'Look at your answer again step by step.',
        task: 'Read the task in two parts: what is given – and what is asked?',
        format: (k: string) => `Here you: ${k}.`,
        tip: 'Hint:',
        explainStep: 'Read the section again slowly. Which sentence is unclear to you? Send it to me and we go through it together.',
        try: 'What would you try next?',
        propose: 'Try it: enter your answer in the task and check it. How did you get there?',
        guess: 'Honest – that helps. Instead of guessing, let us build a way there.',
        thanks: 'Thanks, now I can see how you think.',
        point: 'A step where people often slip:',
        check: 'Go through your reasoning step by step and compare each step with the task.',
        which: 'Which step of your approach does not fit?',
        start: 'Where would you start?',
      };
  if (ctx.status === 'explain') return S.explainStep;
  if (solved(ctx)) {
    const parts = [ctx.explanation, ctx.solution && !ctx.explanation ? ctx.solution : undefined].filter(Boolean);
    if (intent === 'rephrase' && hints.length) return `${hints[turn % hints.length]} ${ctx.explanation ?? ''}`.trim();
    return parts.join(' ') || S.look;
  }
  if (intent === 'reasoning') {
    const h = hints[Math.min(ctx.hintsShown + Math.max(0, turn - 1), hints.length - 1)];
    if (message && GUESS.test(message)) return [S.guess, h ? `${S.tip} ${h}` : S.task, S.start].join(' ');
    if (ctx.mistake) return [S.thanks, S.point, ctx.mistake, S.which].join(' ');
    return [S.thanks, S.check, h ? `${S.tip} ${h}` : '', S.which].filter(Boolean).join(' ');
  }
  // »Is it 70?« – a proposed answer: never confirm, send them to try it
  if (intent === 'chat' && message && /\d|\b[a-h]\)|\b(option|antwort)\s+[a-h]\b/i.test(message) && message.length < 120) return S.propose;
  switch (intent) {
    case 'explain-task': {
      const h = hints[0];
      return [S.task, S.format(ctx.kind), h ? `${S.tip} ${h}` : ''].filter(Boolean).join(' ');
    }
    case 'why-wrong': {
      const h = nextHint();
      if (ctx.mistake && turn === 0) return [ctx.mistake, h && h !== ctx.mistake ? `${S.tip} ${h}` : S.try].filter(Boolean).join(' ');
      return h ? `${S.look} ${S.tip} ${h}` : S.look;
    }
    case 'hint':
    case 'rephrase':
    case 'chat':
    default: {
      if (ctx.hintsShown + turn >= hints.length) return hints.length ? `${S.noMore}` : `${S.look} ${S.try}`;
      return `${S.tip} ${nextHint()}`;
    }
  }
}
