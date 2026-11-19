import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * A take-away game against a perfect computer opponent ("Nim").
 * Players alternately take 1..maxTake stones (or any number if maxTake is
 * omitted) from one pile. Whoever takes the last stone wins. The learner
 * must find and keep a winning strategy.
 */
const Params = z.object({
  piles: z.array(z.number().int().min(1).max(15)).min(1).max(4),
  maxTake: z.number().int().min(1).max(9).optional(),
  first: z.enum(['player', 'computer']).default('player'),
});

export type NimParams = z.infer<typeof Params>;
export interface NimMove {
  who: 'player' | 'computer';
  pile: number;
  take: number;
}
export interface NimState {
  piles: number[];
  history: NimMove[];
  over: boolean;
  winner: 'player' | 'computer' | null;
}
export type NimAction = { type: 'take'; pile: number; n: number } | { type: 'reset' };

const grundy = (p: NimParams, n: number) => (p.maxTake ? n % (p.maxTake + 1) : n);
export const nimSum = (p: NimParams, piles: number[]) => piles.reduce((x, n) => x ^ grundy(p, n), 0);

/** Optimal (deterministic) move; falls back to taking 1 from the largest pile. */
export function computerMove(p: NimParams, piles: number[]): { pile: number; take: number } {
  const s = nimSum(p, piles);
  if (s !== 0) {
    for (let i = 0; i < piles.length; i++) {
      const g = grundy(p, piles[i]);
      const target = g ^ s;
      if (target < g) {
        const take = g - target;
        if (take >= 1 && take <= piles[i] && (!p.maxTake || take <= p.maxTake)) return { pile: i, take };
      }
    }
  }
  let best = 0;
  piles.forEach((n, i) => n > piles[best] && (best = i));
  return { pile: best, take: 1 };
}

function apply(p: NimParams, s: NimState, who: 'player' | 'computer', pile: number, take: number): NimState {
  const piles = [...s.piles];
  piles[pile] -= take;
  const history = [...s.history, { who, pile, take }];
  const over = piles.every((n) => n === 0);
  return { piles, history, over, winner: over ? who : null };
}

function legal(p: NimParams, s: NimState, pile: number, n: number) {
  return !s.over && pile >= 0 && pile < s.piles.length && Number.isInteger(n) && n >= 1 && n <= s.piles[pile] && (!p.maxTake || n <= p.maxTake);
}

function start(p: NimParams): NimState {
  let s: NimState = { piles: [...p.piles], history: [], over: false, winner: null };
  if (p.first === 'computer') {
    const m = computerMove(p, s.piles);
    s = apply(p, s, 'computer', m.pile, m.take);
  }
  return s;
}

export const nimWidget: WidgetDefinition<NimParams, NimState, NimAction> = {
  kind: 'nim',
  title: { de: 'Spiel gegen den Computer', en: 'Game vs computer' },
  params: Params,
  interactive: true,
  init: (p) => start(p),
  applyAction(s, a, p) {
    if (a.type === 'reset') return start(p);
    if (!legal(p, s, a.pile, a.n)) return s;
    let next = apply(p, s, 'player', a.pile, a.n);
    if (!next.over) {
      const m = computerMove(p, next.piles);
      next = apply(p, next, 'computer', m.pile, m.take);
    }
    return next;
  },
  actions(s, p) {
    if (s.over) return [];
    const out: NimAction[] = [];
    s.piles.forEach((n, pile) => {
      for (let k = 1; k <= Math.min(n, p.maxTake ?? n); k++) out.push({ type: 'take', pile, n: k });
    });
    return out;
  },
  isAnswered: (s) => s.over,
  isSolved: (s) => s.over && s.winner === 'player',
  diagnose: (s, _a, _p, locale) => (s.over && s.winner === 'computer' ? t(locale, 'Der Computer hat den letzten Stein genommen. Spiel noch einmal – mit Strategie.', 'The computer took the last stone. Play again – with a strategy.') : null),
  scope: (s, p) => ({ piles: s.piles, moves: s.history.filter((m) => m.who === 'player').length, won: s.winner === 'player', nimSum: nimSum(p, s.piles) }),
  describe(s, p, locale) {
    const piles = s.piles.map((n, i) => `${t(locale, 'Reihe', 'Row')} ${i + 1}: ${n}`).join(', ');
    const last = s.history.filter((m) => m.who === 'computer').slice(-1)[0];
    const lastText = last ? t(locale, ` Computer nahm zuletzt ${last.take} aus Reihe ${last.pile + 1}.`, ` Computer last took ${last.take} from row ${last.pile + 1}.`) : '';
    const rule = p.maxTake ? t(locale, `Nimm 1 bis ${p.maxTake} Steine aus einer Reihe.`, `Take 1 to ${p.maxTake} stones from one row.`) : t(locale, 'Nimm beliebig viele Steine aus einer Reihe.', 'Take any number of stones from one row.');
    const end = s.over ? (s.winner === 'player' ? t(locale, ' Du hast gewonnen.', ' You won.') : t(locale, ' Der Computer hat gewonnen.', ' The computer won.')) : '';
    return t(locale, `Steine-Spiel. ${rule} ${piles}.${lastText}${end}`, `Stone game. ${rule} ${piles}.${lastText}${end}`);
  },
  validateState: (s, p) => (s.piles.every((n, i) => n >= 0 && n <= p.piles[i]) ? [] : ['pile out of range']),
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const s = start(p);
    if (nimSum(p, s.piles) === 0) issues.push({ level: 'error', code: 'nim.unwinnable', message: t(locale, 'Aus dieser Startstellung kann man gegen perfektes Spiel nicht gewinnen.', 'This start position cannot be won against perfect play.') });
    return issues;
  },
};
