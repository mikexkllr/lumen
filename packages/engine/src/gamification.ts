/**
 * Motivation layer, derived purely from the event log (so it syncs and merges
 * like everything else): levels from XP, achievements, three daily quests and
 * a daily puzzle. Nothing here is stored – it is recomputed on demand.
 */
import type { Catalog } from './compile.ts';
import { hashString } from './rng.ts';
import { MAX_STEP_MS, sortEvents, type LumenEvent, type ProgressSummary } from './progress.ts';

type L10n = { de: string; en: string };

// ---------------------------------------------------------------- levels

/** XP needed to reach level L (level 1 starts at 0). */
export const levelThreshold = (level: number) => 25 * level * (level - 1);

export interface LevelInfo {
  level: number;
  /** XP collected inside the current level */
  inLevel: number;
  /** XP the current level spans */
  span: number;
  progress: number;
  nextAt: number;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  while (levelThreshold(level + 1) <= xp) level++;
  const base = levelThreshold(level);
  const next = levelThreshold(level + 1);
  return { level, inLevel: xp - base, span: next - base, progress: (xp - base) / (next - base), nextAt: next };
}

// ---------------------------------------------------------------- counters

export interface Counters {
  lessons: number;
  perfectLessons: number;
  maxCombo: number;
  reviews: number;
  coursesDone: number;
  areas: number;
  earlyBird: number;
  nightOwl: number;
  dailies: number;
  questDays: number;
}

const isFirstTryHit = (e: LumenEvent) => e.type === 'attempt' && e.problem && e.context !== 'placement' && e.attemptNo === 1 && e.correct && e.hintsUsed === 0;
const breaksCombo = (e: LumenEvent) => e.type === 'attempt' && e.problem && e.context !== 'placement' && !isFirstTryHit(e) && (e.attemptNo === 1 || e.revealed);

/** Longest run of first-try hits in a sequence of events. */
function longestCombo(events: readonly LumenEvent[]): number {
  let run = 0;
  let best = 0;
  for (const e of events) {
    if (isFirstTryHit(e)) best = Math.max(best, ++run);
    else if (breaksCombo(e)) run = 0;
  }
  return best;
}

export function deriveCounters(events: readonly LumenEvent[], catalog: Catalog | null, progress: ProgressSummary): Counters {
  const sorted = sortEvents(events);
  const lessons = new Set<string>();
  let perfect = 0;
  let reviews = 0;
  let early = 0;
  let night = 0;
  const dailyDays = new Set<string>();
  for (const e of sorted) {
    if (e.type === 'concept_completed') {
      lessons.add(e.conceptId);
      if (e.problems > 0 && e.firstTryCorrect >= e.problems) perfect++;
      const h = new Date(e.ts).getHours();
      if (h < 8) early++;
      if (h >= 22) night++;
    } else if (e.type === 'review_session_completed' && e.items > 0) reviews++;
    else if (e.type === 'attempt' && e.context === 'daily' && e.final) dailyDays.add(e.day);
  }
  let coursesDone = 0;
  const areas = new Set<string>();
  if (catalog) {
    for (const t of catalog.topics) {
      const all = t.units.flatMap((u) => u.concepts);
      if (all.length && all.every((c) => progress.completedConcepts.has(c))) coursesDone++;
      if (all.some((c) => progress.completedConcepts.has(c))) areas.add(t.area);
    }
  }
  const questDays = new Set<string>();
  for (const d of Object.keys(progress.days)) if (dailyQuests(events, d, { dailyGoal: 10, catalog }).every((q) => q.done)) questDays.add(d);
  return { lessons: lessons.size, perfectLessons: perfect, maxCombo: longestCombo(sorted), reviews, coursesDone, areas: areas.size, earlyBird: early, nightOwl: night, dailies: dailyDays.size, questDays: questDays.size };
}

// ---------------------------------------------------------------- achievements

export interface AchievementDef {
  id: string;
  icon: string;
  tier: 1 | 2 | 3;
  title: L10n;
  desc: L10n;
  target: number;
  value(c: Counters, p: ProgressSummary): number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first-lesson', icon: 'play', tier: 1, title: { de: 'Erster Schritt', en: 'First step' }, desc: { de: 'Schließe deine erste Lektion ab.', en: 'Finish your first lesson.' }, target: 1, value: (c) => c.lessons },
  { id: 'lessons-10', icon: 'book', tier: 1, title: { de: 'Dranbleiber', en: 'Keeping at it' }, desc: { de: '10 Lektionen abgeschlossen.', en: '10 lessons finished.' }, target: 10, value: (c) => c.lessons },
  { id: 'lessons-30', icon: 'book', tier: 2, title: { de: 'Wissensdurst', en: 'Thirst for knowledge' }, desc: { de: '30 Lektionen abgeschlossen.', en: '30 lessons finished.' }, target: 30, value: (c) => c.lessons },
  { id: 'lessons-100', icon: 'book', tier: 3, title: { de: 'Bibliothek im Kopf', en: 'Library in your head' }, desc: { de: '100 Lektionen abgeschlossen.', en: '100 lessons finished.' }, target: 100, value: (c) => c.lessons },
  { id: 'perfect-1', icon: 'sparkles', tier: 1, title: { de: 'Fehlerfrei', en: 'Flawless' }, desc: { de: 'Eine Lektion ohne einen Fehler.', en: 'A lesson without a single mistake.' }, target: 1, value: (c) => c.perfectLessons },
  { id: 'perfect-10', icon: 'sparkles', tier: 2, title: { de: 'Präzision', en: 'Precision' }, desc: { de: '10 fehlerfreie Lektionen.', en: '10 flawless lessons.' }, target: 10, value: (c) => c.perfectLessons },
  { id: 'combo-5', icon: 'flame', tier: 1, title: { de: 'Im Fluss', en: 'In the flow' }, desc: { de: '5 Aufgaben in Folge auf Anhieb richtig.', en: '5 problems in a row right first time.' }, target: 5, value: (c) => c.maxCombo },
  { id: 'combo-15', icon: 'flame', tier: 2, title: { de: 'Unaufhaltsam', en: 'Unstoppable' }, desc: { de: '15 Aufgaben in Folge auf Anhieb richtig.', en: '15 in a row right first time.' }, target: 15, value: (c) => c.maxCombo },
  { id: 'streak-3', icon: 'flame', tier: 1, title: { de: 'Drei Tage', en: 'Three days' }, desc: { de: 'Eine Serie von 3 Tagen.', en: 'A 3-day streak.' }, target: 3, value: (_c, p) => p.streak.longest },
  { id: 'streak-7', icon: 'flame', tier: 2, title: { de: 'Eine Woche', en: 'One week' }, desc: { de: 'Eine Serie von 7 Tagen.', en: 'A 7-day streak.' }, target: 7, value: (_c, p) => p.streak.longest },
  { id: 'streak-30', icon: 'flame', tier: 3, title: { de: 'Ein Monat', en: 'One month' }, desc: { de: 'Eine Serie von 30 Tagen.', en: 'A 30-day streak.' }, target: 30, value: (_c, p) => p.streak.longest },
  { id: 'review-1', icon: 'review', tier: 1, title: { de: 'Wiederholer', en: 'Reviewer' }, desc: { de: 'Deine erste Wiederholung.', en: 'Your first review session.' }, target: 1, value: (c) => c.reviews },
  { id: 'review-20', icon: 'review', tier: 2, title: { de: 'Elefantengedächtnis', en: 'Memory of an elephant' }, desc: { de: '20 Wiederholungen.', en: '20 review sessions.' }, target: 20, value: (c) => c.reviews },
  { id: 'course-1', icon: 'trophy', tier: 2, title: { de: 'Kurs gemeistert', en: 'Course mastered' }, desc: { de: 'Alle Lektionen eines Kurses.', en: 'Every lesson of a course.' }, target: 1, value: (c) => c.coursesDone },
  { id: 'course-5', icon: 'trophy', tier: 3, title: { de: 'Fünf Kurse', en: 'Five courses' }, desc: { de: 'Fünf Kurse komplett abgeschlossen.', en: 'Five complete courses.' }, target: 5, value: (c) => c.coursesDone },
  { id: 'areas-3', icon: 'compass', tier: 1, title: { de: 'Neugierig', en: 'Curious' }, desc: { de: 'Lektionen in 3 Bereichen.', en: 'Lessons in 3 areas.' }, target: 3, value: (c) => c.areas },
  { id: 'areas-6', icon: 'compass', tier: 3, title: { de: 'Universalgelehrt', en: 'Polymath' }, desc: { de: 'Lektionen in allen 6 Bereichen.', en: 'Lessons in all 6 areas.' }, target: 6, value: (c) => c.areas },
  { id: 'xp-500', icon: 'bolt', tier: 2, title: { de: '500 XP', en: '500 XP' }, desc: { de: '500 Erfahrungspunkte gesammelt.', en: 'Collected 500 XP.' }, target: 500, value: (_c, p) => p.xpTotal },
  { id: 'xp-2500', icon: 'bolt', tier: 3, title: { de: '2500 XP', en: '2500 XP' }, desc: { de: '2500 Erfahrungspunkte gesammelt.', en: 'Collected 2500 XP.' }, target: 2500, value: (_c, p) => p.xpTotal },
  { id: 'daily-1', icon: 'puzzle', tier: 1, title: { de: 'Rätselfreund', en: 'Puzzle friend' }, desc: { de: 'Löse ein Tagesrätsel.', en: 'Solve a daily puzzle.' }, target: 1, value: (c) => c.dailies },
  { id: 'daily-10', icon: 'puzzle', tier: 2, title: { de: 'Rätselprofi', en: 'Puzzle pro' }, desc: { de: '10 Tagesrätsel gelöst.', en: '10 daily puzzles solved.' }, target: 10, value: (c) => c.dailies },
  { id: 'quests-1', icon: 'target', tier: 1, title: { de: 'Tagwerk', en: 'Day’s work' }, desc: { de: 'Alle drei Tagesaufgaben an einem Tag.', en: 'All three daily quests in one day.' }, target: 1, value: (c) => c.questDays },
  { id: 'early-bird', icon: 'sunrise', tier: 1, title: { de: 'Frühaufsteher', en: 'Early bird' }, desc: { de: 'Eine Lektion vor 8 Uhr.', en: 'A lesson before 8 am.' }, target: 1, value: (c) => c.earlyBird },
  { id: 'night-owl', icon: 'moon', tier: 1, title: { de: 'Nachteule', en: 'Night owl' }, desc: { de: 'Eine Lektion nach 22 Uhr.', en: 'A lesson after 10 pm.' }, target: 1, value: (c) => c.nightOwl },
];

export interface AchievementState {
  def: AchievementDef;
  value: number;
  unlocked: boolean;
}

export function deriveAchievements(events: readonly LumenEvent[], catalog: Catalog | null, progress: ProgressSummary): AchievementState[] {
  const c = deriveCounters(events, catalog, progress);
  return ACHIEVEMENTS.map((def) => {
    const value = def.value(c, progress);
    return { def, value: Math.min(value, def.target), unlocked: value >= def.target };
  });
}

// ---------------------------------------------------------------- daily quests

export type QuestKind = 'solve' | 'combo' | 'lesson' | 'minutes' | 'xp' | 'daily' | 'perfect' | 'review';

export interface Quest {
  kind: QuestKind;
  target: number;
  value: number;
  done: boolean;
  title: L10n;
}

const QUEST_TITLES: Record<QuestKind, (n: number) => L10n> = {
  solve: (n) => ({ de: `Löse ${n} Aufgaben`, en: `Solve ${n} problems` }),
  combo: (n) => ({ de: `${n} in Folge auf Anhieb richtig`, en: `${n} in a row right first time` }),
  lesson: (n) => (n === 1 ? { de: 'Schließe eine Lektion ab', en: 'Finish a lesson' } : { de: `Schließe ${n} Lektionen ab`, en: `Finish ${n} lessons` }),
  minutes: (n) => ({ de: `Lerne ${n} Minuten`, en: `Learn for ${n} minutes` }),
  xp: (n) => ({ de: `Sammle ${n} XP`, en: `Earn ${n} XP` }),
  daily: () => ({ de: 'Löse das Tagesrätsel', en: 'Solve the daily puzzle' }),
  perfect: () => ({ de: 'Eine Lektion ohne Fehler', en: 'A lesson without mistakes' }),
  review: () => ({ de: 'Mach eine Wiederholung', en: 'Do a review session' }),
};

export interface DayStats {
  solved: number;
  combo: number;
  lessons: number;
  perfect: number;
  minutes: number;
  xp: number;
  daily: number;
  reviews: number;
}

/** Activity of a single day (XP via the regular rules). */
export function dayStats(events: readonly LumenEvent[], day: string): DayStats {
  const todays = sortEvents(events.filter((e) => e.day === day));
  let solved = 0;
  let lessons = 0;
  let perfect = 0;
  let ms = 0;
  let xp = 0;
  let daily = 0;
  let reviews = 0;
  const stepXp = new Set<string>();
  const conceptXp = new Set<string>();
  for (const e of todays) {
    if (e.type === 'attempt') {
      ms += Math.min(Math.max(0, e.durationMs), MAX_STEP_MS);
      if (e.problem && e.final && e.correct && !e.revealed && e.context !== 'placement') {
        solved++;
        if (!stepXp.has(e.stepId)) {
          stepXp.add(e.stepId);
          xp += Math.min(3, Math.max(1, e.difficulty || 1));
        }
      }
      if (e.context === 'daily' && e.final) daily = 1;
    } else if (e.type === 'concept_completed') {
      lessons++;
      if (e.problems > 0 && e.firstTryCorrect >= e.problems) perfect++;
      if (!conceptXp.has(e.conceptId)) {
        conceptXp.add(e.conceptId);
        xp += 10;
      }
    } else if (e.type === 'review_session_completed' && e.items > 0) {
      reviews++;
      xp += 5;
    }
  }
  return { solved, combo: longestCombo(todays), lessons, perfect, minutes: ms / 60000, xp, daily, reviews };
}

/** Three quests per day, chosen deterministically from the date. */
export function dailyQuests(events: readonly LumenEvent[], day: string, opts: { dailyGoal: number; catalog?: Catalog | null }): Quest[] {
  const s = dayStats(events, day);
  const learnedBefore = events.some((e) => e.type === 'concept_completed' && e.day < day);
  const h = hashString(`quests:${day}`);
  const pick = <T>(xs: T[], salt: number) => xs[(h >>> salt) % xs.length];
  const first: [QuestKind, number] = pick<[QuestKind, number]>([['solve', 8], ['solve', 10], ['lesson', 1], ['xp', 20]], 0);
  const pool: [QuestKind, number][] = [
    ['combo', pick([3, 5], 3)],
    ['minutes', opts.dailyGoal],
    ['daily', 1],
    ['perfect', 1],
    ['lesson', 2],
    ['xp', pick([30, 40], 5)],
    ...(learnedBefore ? ([['review', 1]] as [QuestKind, number][]) : []),
  ].filter(([k]) => k !== first[0]) as [QuestKind, number][];
  const a = pool[(h >>> 7) % pool.length];
  const rest = pool.filter((q) => q[0] !== a[0]);
  const b = rest[(h >>> 13) % rest.length];
  const value = (k: QuestKind): number => ({ solve: s.solved, combo: s.combo, lesson: s.lessons, minutes: Math.floor(s.minutes), xp: s.xp, daily: s.daily, perfect: s.perfect, review: s.reviews })[k];
  return [first, a, b].map(([kind, target]) => {
    const v = value(kind);
    return { kind, target, value: Math.min(v, target), done: v >= target, title: QUEST_TITLES[kind](target) };
  });
}

// ---------------------------------------------------------------- daily puzzle

export interface DailyPuzzle {
  itemId: string;
  conceptId: string;
  topicId: string;
  seed: number;
}

/** One review card per day for everybody, with the variant of the day. */
export function dailyPuzzle(catalog: Catalog, day: string): DailyPuzzle | null {
  const cards = Object.values(catalog.concepts)
    .flatMap((c) => c.srsCards.map((id) => ({ id, c })))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (!cards.length) return null;
  const h = hashString(`daily:${day}`);
  const pick = cards[h % cards.length];
  return { itemId: pick.id, conceptId: pick.c.id, topicId: pick.c.topicId, seed: (h % 99991) + 1 };
}

export function dailySolved(events: readonly LumenEvent[], day: string): 'open' | 'solved' | 'revealed' {
  let state: 'open' | 'solved' | 'revealed' = 'open';
  for (const e of events) if (e.type === 'attempt' && e.context === 'daily' && e.day === day && e.final) state = e.correct && !e.revealed ? 'solved' : state === 'solved' ? 'solved' : 'revealed';
  return state;
}
