/**
 * Reference solving for evals: authored solution → widget solver → bounded
 * breadth-first search over widget actions.
 */
import { initialState, isCorrect, type ResolvedProblem } from './runtime.ts';

export interface SolveResult {
  state: unknown;
  method: 'authored' | 'widget' | 'search';
  /** Number of actions on the shortest path (search only). */
  depth?: number;
}

export function stableKey(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableKey).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableKey(o[k])}`)
    .join(',')}}`;
}

function safeCorrect(rp: ResolvedProblem, s: unknown): boolean {
  try {
    return isCorrect(rp, s);
  } catch {
    return false;
  }
}

export interface SearchOptions {
  maxNodes?: number;
  maxDepth?: number;
  /** Stop after this many distinct solutions. */
  limit?: number;
}

export function searchSolutions(rp: ResolvedProblem, opts: SearchOptions = {}): { solutions: { state: unknown; depth: number }[]; exhausted: boolean } {
  const { maxNodes = 20000, maxDepth = 14, limit = 1 } = opts;
  const actionsOf = rp.widget.actions;
  if (!actionsOf) return { solutions: [], exhausted: false };
  const start = initialState(rp);
  const seen = new Set<string>([stableKey(start)]);
  let frontier: unknown[] = [start];
  const solutions: { state: unknown; depth: number }[] = [];
  if (safeCorrect(rp, start)) solutions.push({ state: start, depth: 0 });
  let nodes = 1;
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: unknown[] = [];
    for (const s of frontier) {
      for (const a of actionsOf(s, rp.params)) {
        const n = rp.widget.applyAction(s, a, rp.params);
        const k = stableKey(n);
        if (seen.has(k)) continue;
        seen.add(k);
        if (++nodes > maxNodes) return { solutions, exhausted: false };
        if (safeCorrect(rp, n)) {
          solutions.push({ state: n, depth });
          if (solutions.length >= limit) return { solutions, exhausted: false };
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return { solutions, exhausted: frontier.length === 0 };
}

function deepMerge(base: unknown, patch: unknown): unknown {
  if (patch && typeof patch === 'object' && !Array.isArray(patch) && base && typeof base === 'object' && !Array.isArray(base)) {
    const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
    for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v);
    return out;
  }
  return patch;
}

export function referenceSolve(rp: ResolvedProblem): SolveResult | null {
  const sol = rp.step.solution;
  if (sol?.actions?.length) {
    let s = initialState(rp);
    for (const a of sol.actions) s = rp.widget.applyAction(s, a, rp.params);
    return { state: s, method: 'authored' };
  }
  if (sol?.state) return { state: deepMerge(initialState(rp), sol.state), method: 'authored' };
  const w = rp.widget.solve?.(rp.params, rp.answer, { locale: rp.locale, seed: rp.seed + 1 });
  if (w && safeCorrect(rp, w)) return { state: w, method: 'widget' };
  const found = searchSolutions(rp, { limit: 1 }).solutions[0];
  if (found) return { state: found.state, method: 'search', depth: found.depth };
  return w ? { state: w, method: 'widget' } : null;
}
