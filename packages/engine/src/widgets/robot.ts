import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * "Denken in Code": a robot on a grid is programmed with blocks
 * (vorwärts, links, rechts, wiederhole n … Ende). The program is executed by
 * a pure interpreter, so checking, solving and fuzzing are deterministic.
 *
 * Grid characters: '.' free · '#' wall · 'S' start · 'G' goal · '*' gem
 */
const OPS = ['forward', 'left', 'right', 'repeat', 'end'] as const;
export type Op = (typeof OPS)[number];
export type Instr = { op: 'forward' | 'left' | 'right' | 'end' } | { op: 'repeat'; n: number };
type Dir = 'N' | 'E' | 'S' | 'W';

const Params = z.object({
  grid: z.array(z.string().min(1)).min(1).max(9),
  dir: z.enum(['N', 'E', 'S', 'W']).default('E'),
  blocks: z.array(z.enum(OPS)).default(['forward', 'left', 'right']),
  repeatCounts: z.array(z.number().int().min(2).max(9)).default([2, 3, 4]),
  maxBlocks: z.number().int().min(1).max(30).default(12),
  /** reach: end on G · collect: collect every gem (and end on G if there is one) */
  goal: z.enum(['reach', 'collect']).default('reach'),
  /** Pre-filled program (e.g. for debugging tasks). */
  program: z.array(z.union([z.object({ op: z.enum(['forward', 'left', 'right', 'end']) }), z.object({ op: z.literal('repeat'), n: z.number().int() })])).default([]),
});

export type RobotParams = z.infer<typeof Params>;
export interface RobotState {
  program: Instr[];
}
export type RobotAction = { type: 'add'; op: Op; n?: number; at?: number } | { type: 'remove'; index: number } | { type: 'clear' };

export interface RobotFrame {
  x: number;
  y: number;
  dir: Dir;
  /** index into the program of the instruction just executed (-1 = start) */
  line: number;
  collected: number;
}

export interface RunResult {
  frames: RobotFrame[];
  crashed: boolean;
  error: string | null;
  reachedGoal: boolean;
  allGems: boolean;
  success: boolean;
}

const DX: Record<Dir, [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const LEFT: Record<Dir, Dir> = { N: 'W', W: 'S', S: 'E', E: 'N' };
const RIGHT: Record<Dir, Dir> = { N: 'E', E: 'S', S: 'W', W: 'N' };

function find(p: RobotParams, ch: string): [number, number][] {
  const out: [number, number][] = [];
  p.grid.forEach((row, y) => [...row].forEach((c, x) => c === ch && out.push([x, y])));
  return out;
}

/** Validates loop structure: every repeat has a matching end. */
export function programError(prog: Instr[], locale = 'de'): string | null {
  let depth = 0;
  for (const i of prog) {
    if (i.op === 'repeat') depth++;
    if (i.op === 'end') {
      depth--;
      if (depth < 0) return t(locale, '»Ende« ohne passendes »Wiederhole«.', '"End" without matching "Repeat".');
    }
  }
  return depth > 0 ? t(locale, 'Einem »Wiederhole« fehlt das »Ende«.', 'A "Repeat" is missing its "End".') : null;
}

/** Flattens loops into primitive steps, keeping the source line of each step. */
function expand(prog: Instr[]): { op: 'forward' | 'left' | 'right'; line: number }[] {
  const out: { op: 'forward' | 'left' | 'right'; line: number }[] = [];
  const rec = (start: number, end: number) => {
    for (let i = start; i < end; i++) {
      const ins = prog[i];
      if (ins.op === 'repeat') {
        let depth = 1;
        let j = i + 1;
        for (; j < end; j++) {
          if (prog[j].op === 'repeat') depth++;
          if (prog[j].op === 'end' && --depth === 0) break;
        }
        for (let k = 0; k < ins.n && out.length < 400; k++) rec(i + 1, j);
        i = j;
      } else if (ins.op !== 'end') out.push({ op: ins.op, line: i });
    }
  };
  rec(0, prog.length);
  return out;
}

export function runRobot(p: RobotParams, prog: Instr[]): RunResult {
  const [sx, sy] = find(p, 'S')[0] ?? [0, 0];
  const gems = find(p, '*');
  const goals = find(p, 'G');
  const err = programError(prog);
  let x = sx;
  let y = sy;
  let dir: Dir = p.dir;
  const got = new Set<string>();
  const frames: RobotFrame[] = [{ x, y, dir, line: -1, collected: 0 }];
  let crashed = false;
  if (!err) {
    for (const s of expand(prog)) {
      if (s.op === 'left') dir = LEFT[dir];
      else if (s.op === 'right') dir = RIGHT[dir];
      else {
        const nx = x + DX[dir][0];
        const ny = y + DX[dir][1];
        const cell = p.grid[ny]?.[nx];
        if (cell === undefined || cell === '#') {
          crashed = true;
          frames.push({ x, y, dir, line: s.line, collected: got.size });
          break;
        }
        x = nx;
        y = ny;
        if (cell === '*') got.add(`${x},${y}`);
      }
      frames.push({ x, y, dir, line: s.line, collected: got.size });
    }
  }
  const reachedGoal = goals.some(([gx, gy]) => gx === x && gy === y);
  const allGems = got.size === gems.length;
  const success = !err && !crashed && (p.goal === 'collect' ? allGems && (goals.length === 0 || reachedGoal) : reachedGoal);
  return { frames, crashed, error: err, reachedGoal, allGems, success };
}

/** Shortest primitive program via BFS over (x, y, dir, gems). */
function plan(p: RobotParams): Instr[] | null {
  const [sx, sy] = find(p, 'S')[0] ?? [0, 0];
  const gems = find(p, '*');
  const gi = new Map(gems.map(([x, y], i) => [`${x},${y}`, i]));
  const full = (1 << gems.length) - 1;
  const goals = find(p, 'G');
  const done = (x: number, y: number, m: number) =>
    p.goal === 'collect' ? m === full && (goals.length === 0 || goals.some(([gx, gy]) => gx === x && gy === y)) : goals.some(([gx, gy]) => gx === x && gy === y);
  type N = { x: number; y: number; d: Dir; m: number; path: Instr[] };
  const q: N[] = [{ x: sx, y: sy, d: p.dir, m: 0, path: [] }];
  const seen = new Set([`${sx},${sy},${p.dir},0`]);
  while (q.length) {
    const n = q.shift()!;
    if (done(n.x, n.y, n.m)) return n.path;
    if (n.path.length > 40) continue;
    const moves: [Instr, number, number, Dir][] = [
      [{ op: 'left' }, n.x, n.y, LEFT[n.d]],
      [{ op: 'right' }, n.x, n.y, RIGHT[n.d]],
      [{ op: 'forward' }, n.x + DX[n.d][0], n.y + DX[n.d][1], n.d],
    ];
    for (const [ins, x, y, d] of moves) {
      const cell = p.grid[y]?.[x];
      if (cell === undefined || cell === '#') continue;
      const m = n.m | (gi.has(`${x},${y}`) ? 1 << gi.get(`${x},${y}`)! : 0);
      const k = `${x},${y},${d},${m}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x, y, d, m, path: [...n.path, ins] });
    }
  }
  return null;
}

/** Greedy compression: replaces k ≥ 2 consecutive repetitions of a block with a loop. */
export function compress(prog: Instr[], counts: number[]): Instr[] {
  let best = prog;
  for (let len = 1; len <= 4; len++) {
    for (let i = 0; i + len * 2 <= best.length; i++) {
      const unit = best.slice(i, i + len);
      let k = 1;
      while (best.slice(i + k * len, i + (k + 1) * len).length === len && best.slice(i + k * len, i + (k + 1) * len).every((x, j) => x.op === unit[j].op)) k++;
      const n = [...counts].filter((c) => c <= k).sort((a, b) => b - a)[0];
      if (n && n >= 2 && len * n > len + 2) {
        const candidate: Instr[] = [...best.slice(0, i), { op: 'repeat', n }, ...unit, { op: 'end' }, ...best.slice(i + n * len)];
        if (candidate.length < best.length) best = candidate;
      }
    }
  }
  return best;
}

const label = (i: Instr, locale: string) =>
  i.op === 'forward' ? t(locale, 'vorwärts', 'forward') : i.op === 'left' ? t(locale, 'links drehen', 'turn left') : i.op === 'right' ? t(locale, 'rechts drehen', 'turn right') : i.op === 'repeat' ? t(locale, `wiederhole ${i.n}×`, `repeat ${i.n}×`) : t(locale, 'Ende', 'end');

export const robotWidget: WidgetDefinition<RobotParams, RobotState, RobotAction> = {
  kind: 'robot',
  title: { de: 'Roboter programmieren', en: 'Program the robot' },
  params: Params,
  interactive: true,
  init: (p) => ({ program: p.program.map((i) => ({ ...i })) as Instr[] }),
  applyAction(s, a, p) {
    if (a.type === 'clear') return { program: [] };
    if (a.type === 'remove') return a.index >= 0 && a.index < s.program.length ? { program: s.program.filter((_, i) => i !== a.index) } : s;
    if (a.type === 'add') {
      if (!p.blocks.includes(a.op) || s.program.length >= 30) return s;
      if (a.op === 'repeat' && !p.repeatCounts.includes(a.n ?? -1)) return s;
      const ins: Instr = a.op === 'repeat' ? { op: 'repeat', n: a.n! } : ({ op: a.op } as Instr);
      const at = a.at === undefined ? s.program.length : Math.max(0, Math.min(s.program.length, a.at));
      return { program: [...s.program.slice(0, at), ins, ...s.program.slice(at)] };
    }
    return s;
  },
  actions(s, p) {
    const out: RobotAction[] = [];
    if (s.program.length < p.maxBlocks + 2) {
      for (const op of p.blocks) {
        if (op === 'repeat') for (const n of p.repeatCounts) out.push({ type: 'add', op, n });
        else out.push({ type: 'add', op });
      }
    }
    if (s.program.length) out.push({ type: 'remove', index: s.program.length - 1 });
    return out;
  },
  isAnswered: (s) => s.program.length > 0,
  isSolved(s, p) {
    return s.program.length <= p.maxBlocks && runRobot(p, s.program).success;
  },
  diagnose(s, _a, p, locale) {
    const r = runRobot(p, s.program);
    if (r.error) return r.error;
    if (s.program.length > p.maxBlocks) return t(locale, `Dein Programm hat ${s.program.length} Blöcke – erlaubt sind ${p.maxBlocks}. Kannst du eine Wiederholung nutzen?`, `Your program has ${s.program.length} blocks – only ${p.maxBlocks} allowed. Try a loop.`);
    if (r.crashed) return t(locale, 'Der Roboter ist gegen eine Wand gefahren. Schau dir an, in welche Richtung er gerade blickt.', 'The robot hit a wall. Check which way it is facing.');
    if (p.goal === 'collect' && !r.allGems) return t(locale, 'Es fehlen noch Kristalle.', 'Some gems are still missing.');
    return t(locale, 'Der Roboter steht am Ende nicht auf dem Ziel.', 'The robot does not end on the goal.');
  },
  solve(p) {
    const path = plan(p);
    if (!path) return null;
    const prog = p.blocks.includes('repeat') ? compress(path, p.repeatCounts) : path;
    return prog.length <= p.maxBlocks ? { program: prog } : null;
  },
  countSolutions: () => 1,
  scope: (s, p) => {
    const r = runRobot(p, s.program);
    return { blocks: s.program.length, crashed: r.crashed, success: r.success };
  },
  describe(s, p, locale) {
    const [sx, sy] = find(p, 'S')[0] ?? [0, 0];
    const goals = find(p, 'G').map(([x, y]) => `(${x + 1}|${y + 1})`).join(', ');
    const gems = find(p, '*').length;
    const walls = find(p, '#').length;
    const dirName = { N: t(locale, 'oben', 'up'), E: t(locale, 'rechts', 'right'), S: t(locale, 'unten', 'down'), W: t(locale, 'links', 'left') }[p.dir];
    const prog = s.program.length ? s.program.map((i, k) => `${k + 1}. ${label(i, locale)}`).join(', ') : t(locale, 'leer', 'empty');
    const r = runRobot(p, s.program);
    const end = r.frames[r.frames.length - 1];
    return t(
      locale,
      `Raster ${p.grid[0].length}×${p.grid.length}. Roboter startet bei (${sx + 1}|${sy + 1}) und schaut nach ${dirName}. ${goals ? `Ziel bei ${goals}. ` : ''}${gems ? `${gems} Kristalle. ` : ''}${walls} Wandfelder. Programm: ${prog}. Nach dem Ausführen steht er bei (${end.x + 1}|${end.y + 1})${r.crashed ? ' – Zusammenstoß mit einer Wand' : ''}.`,
      `Grid ${p.grid[0].length}×${p.grid.length}. Robot starts at (${sx + 1},${sy + 1}) facing ${dirName}. ${goals ? `Goal at ${goals}. ` : ''}${gems ? `${gems} gems. ` : ''}Program: ${prog}. It ends at (${end.x + 1},${end.y + 1})${r.crashed ? ' – crashed' : ''}.`,
    );
  },
  validateState(s) {
    return s.program.length <= 30 && s.program.every((i) => OPS.includes(i.op)) ? [] : ['invalid program'];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const w = p.grid[0].length;
    if (p.grid.some((r) => r.length !== w)) issues.push({ level: 'error', code: 'robot.grid', message: 'Alle Rasterzeilen müssen gleich lang sein.' });
    if (w > 9) issues.push({ level: 'warning', code: 'visual.dense', message: t(locale, 'Raster breiter als 9 Felder ist auf dem Handy zu klein.', 'Grids wider than 9 are too small on phones.') });
    if (find(p, 'S').length !== 1) issues.push({ level: 'error', code: 'robot.start', message: 'Genau ein Startfeld S nötig.' });
    if (p.goal === 'reach' && !find(p, 'G').length) issues.push({ level: 'error', code: 'robot.goal', message: 'Ziel G fehlt.' });
    if (p.goal === 'collect' && !find(p, '*').length) issues.push({ level: 'error', code: 'robot.gems', message: 'Keine Kristalle * zum Sammeln.' });
    if (p.grid.join('').replace(/[.#SG*]/g, '').length) issues.push({ level: 'error', code: 'robot.chars', message: 'Erlaubte Zeichen: . # S G *' });
    if (p.blocks.includes('repeat') !== p.blocks.includes('end')) issues.push({ level: 'error', code: 'robot.loop', message: 'repeat und end nur gemeinsam anbieten.' });
    if (!plan(p)) issues.push({ level: 'error', code: 'robot.unreachable', message: t(locale, 'Das Ziel ist vom Start aus nicht erreichbar.', 'Goal unreachable.') });
    return issues;
  },
};
