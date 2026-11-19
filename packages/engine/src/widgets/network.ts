import { z } from 'zod';
import { exprFunction, formatNumber } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Networks (graphs in the graph-theory sense): nodes and weighted edges.
 *  - mode 'path':   tap nodes one after another to build a route
 *  - mode 'color':  tap nodes to cycle colours (graph colouring)
 *  - mode 'select': tap edges to pick them (e.g. cheapest connection network)
 * Without a predicate the intrinsic goal is: shortest start→end route,
 * a proper colouring, or a minimum spanning tree.
 */
const Params = z.object({
  nodes: z.array(z.object({ id: z.string(), x: z.number().min(0).max(100), y: z.number().min(0).max(100), label: z.string().optional() })).min(2).max(12),
  edges: z.array(z.object({ a: z.string(), b: z.string(), w: z.number().optional() })).min(1).max(24),
  mode: z.enum(['path', 'color', 'select']).default('path'),
  start: z.string().optional(),
  end: z.string().optional(),
  colors: z.number().int().min(2).max(4).default(3),
  /** Show edge weights (defaults to true when weights exist). */
  weights: z.boolean().optional(),
  unit: z.string().optional(),
  /** Height/width ratio of the drawing. */
  aspect: z.number().min(0.3).max(1.4).default(0.62),
});

export type NetworkParams = z.infer<typeof Params>;
export interface NetworkState {
  path: string[];
  colors: Record<string, number>;
  edges: number[];
}
export type NetworkAction = { type: 'visit'; id: string } | { type: 'undo' } | { type: 'color'; id: string } | { type: 'edge'; index: number } | { type: 'clear' };

const w = (e: { w?: number }) => e.w ?? 1;

export function edgeIndex(p: NetworkParams, a: string, b: string): number {
  return p.edges.findIndex((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

export function pathCost(p: NetworkParams, path: string[]): number {
  let c = 0;
  for (let i = 1; i < path.length; i++) {
    const k = edgeIndex(p, path[i - 1], path[i]);
    if (k < 0) return Infinity;
    c += w(p.edges[k]);
  }
  return c;
}

/** Dijkstra; returns [cost, path]. */
export function shortestPath(p: NetworkParams, from: string, to: string): { cost: number; path: string[] } | null {
  const dist = new Map<string, number>(p.nodes.map((n) => [n.id, Infinity]));
  const prev = new Map<string, string>();
  const todo = new Set(p.nodes.map((n) => n.id));
  dist.set(from, 0);
  while (todo.size) {
    let u: string | null = null;
    for (const id of todo) if (u === null || dist.get(id)! < dist.get(u)!) u = id;
    if (u === null || dist.get(u) === Infinity) break;
    todo.delete(u);
    if (u === to) break;
    for (const e of p.edges) {
      const v = e.a === u ? e.b : e.b === u ? e.a : null;
      if (!v || !todo.has(v)) continue;
      const alt = dist.get(u)! + w(e);
      if (alt < dist.get(v)!) {
        dist.set(v, alt);
        prev.set(v, u);
      }
    }
  }
  if (dist.get(to) === Infinity) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0])!);
  return { cost: dist.get(to)!, path };
}

function components(p: NetworkParams, edgeIdx: number[]): number {
  const parent = new Map(p.nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  for (const k of edgeIdx) {
    const e = p.edges[k];
    parent.set(find(e.a), find(e.b));
  }
  return new Set(p.nodes.map((n) => find(n.id))).size;
}

export function minimumSpanningTree(p: NetworkParams): { weight: number; edges: number[] } {
  const order = p.edges.map((_, i) => i).sort((a, b) => w(p.edges[a]) - w(p.edges[b]) || a - b);
  const parent = new Map(p.nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => (parent.get(x) === x ? x : find(parent.get(x)!));
  const chosen: number[] = [];
  let weight = 0;
  for (const k of order) {
    const e = p.edges[k];
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    parent.set(ra, rb);
    chosen.push(k);
    weight += w(e);
  }
  return { weight, edges: chosen.sort((a, b) => a - b) };
}

function colorConflicts(p: NetworkParams, colors: Record<string, number>): number {
  return p.edges.filter((e) => colors[e.a] && colors[e.a] === colors[e.b]).length;
}

function colorGraph(p: NetworkParams): Record<string, number> | null {
  const ids = p.nodes.map((n) => n.id);
  const colors: Record<string, number> = {};
  const ok = (id: string, c: number) => p.edges.every((e) => !((e.a === id && colors[e.b] === c) || (e.b === id && colors[e.a] === c)));
  const go = (i: number): boolean => {
    if (i === ids.length) return true;
    for (let c = 1; c <= p.colors; c++) {
      if (!ok(ids[i], c)) continue;
      colors[ids[i]] = c;
      if (go(i + 1)) return true;
      delete colors[ids[i]];
    }
    return false;
  };
  return go(0) ? { ...colors } : null;
}

function analyse(p: NetworkParams, s: NetworkState) {
  const usedEdges = new Map<number, number>();
  for (let i = 1; i < s.path.length; i++) {
    const k = edgeIndex(p, s.path[i - 1], s.path[i]);
    usedEdges.set(k, (usedEdges.get(k) ?? 0) + 1);
  }
  const selW = s.edges.reduce((sum, k) => sum + w(p.edges[k]), 0);
  const comps = components(p, s.edges);
  return {
    cost: pathCost(p, s.path),
    last: s.path[s.path.length - 1] ?? null,
    complete: !!p.end && s.path[s.path.length - 1] === p.end && (!p.start || s.path[0] === p.start),
    visitedAll: p.nodes.every((n) => s.path.includes(n.id)),
    simple: new Set(s.path).size === s.path.length,
    everyEdgeOnce: usedEdges.size === p.edges.length && [...usedEdges.values()].every((n) => n === 1),
    conflicts: colorConflicts(p, s.colors),
    colored: Object.values(s.colors).filter((c) => c > 0).length,
    colorsUsed: new Set(Object.values(s.colors).filter((c) => c > 0)).size,
    selectedWeight: selW,
    connected: comps === 1,
    isTree: comps === 1 && s.edges.length === p.nodes.length - 1,
  };
}

export const networkWidget: WidgetDefinition<NetworkParams, NetworkState, NetworkAction> = {
  kind: 'network',
  title: { de: 'Netzwerk', en: 'Network' },
  params: Params,
  interactive: true,
  init: (p) => ({ path: p.mode === 'path' && p.start ? [p.start] : [], colors: {}, edges: [] }),
  applyAction(s, a, p) {
    if (a.type === 'clear') return networkWidget.init(p, { locale: 'de', seed: 0 });
    if (p.mode === 'path') {
      if (a.type === 'undo') return s.path.length > (p.start ? 1 : 0) ? { ...s, path: s.path.slice(0, -1) } : s;
      if (a.type !== 'visit' || !p.nodes.some((n) => n.id === a.id)) return s;
      const last = s.path[s.path.length - 1];
      if (!last) return p.start && a.id !== p.start ? s : { ...s, path: [a.id] };
      if (s.path.length >= 2 && s.path[s.path.length - 2] === a.id) return { ...s, path: s.path.slice(0, -1) };
      if (edgeIndex(p, last, a.id) < 0) return s;
      if (s.path.length >= 30) return s;
      return { ...s, path: [...s.path, a.id] };
    }
    if (p.mode === 'color' && a.type === 'color') {
      if (!p.nodes.some((n) => n.id === a.id)) return s;
      return { ...s, colors: { ...s.colors, [a.id]: ((s.colors[a.id] ?? 0) + 1) % (p.colors + 1) } };
    }
    if (p.mode === 'select' && a.type === 'edge') {
      if (a.index < 0 || a.index >= p.edges.length) return s;
      const edges = s.edges.includes(a.index) ? s.edges.filter((k) => k !== a.index) : [...s.edges, a.index].sort((x, y) => x - y);
      return { ...s, edges };
    }
    return s;
  },
  actions(s, p) {
    if (p.mode === 'path') {
      const last = s.path[s.path.length - 1];
      const out: NetworkAction[] = [];
      if (!last) return p.nodes.filter((n) => !p.start || n.id === p.start).map((n) => ({ type: 'visit', id: n.id }));
      for (const e of p.edges) {
        const v = e.a === last ? e.b : e.b === last ? e.a : null;
        if (v) out.push({ type: 'visit', id: v });
      }
      return out;
    }
    if (p.mode === 'color') return p.nodes.map((n) => ({ type: 'color', id: n.id }));
    return p.edges.map((_, index) => ({ type: 'edge', index }));
  },
  isAnswered(s, p) {
    if (p.mode === 'path') return s.path.length >= 2;
    if (p.mode === 'color') return p.nodes.every((n) => (s.colors[n.id] ?? 0) > 0);
    return s.edges.length > 0;
  },
  isSolved(s, p) {
    const an = analyse(p, s);
    if (p.mode === 'path') {
      if (!p.start || !p.end || !an.complete) return false;
      const best = shortestPath(p, p.start, p.end);
      return !!best && Math.abs(an.cost - best.cost) < 1e-9;
    }
    if (p.mode === 'color') return an.colored === p.nodes.length && an.conflicts === 0;
    return an.isTree && Math.abs(an.selectedWeight - minimumSpanningTree(p).weight) < 1e-9;
  },
  diagnose(s, _a, p, locale) {
    const an = analyse(p, s);
    if (p.mode === 'path' && p.end) {
      if (!an.complete) return t(locale, `Die Route endet noch nicht bei ${p.end}.`, `The route does not end at ${p.end} yet.`);
      return t(locale, `Deine Route kostet ${formatNumber(an.cost, locale)}. Es geht kürzer.`, `Your route costs ${an.cost}. There is a shorter one.`);
    }
    if (p.mode === 'color' && an.conflicts) return t(locale, `${an.conflicts} Verbindung(en) haben an beiden Enden dieselbe Farbe.`, `${an.conflicts} edge(s) have the same colour at both ends.`);
    if (p.mode === 'select') {
      if (!an.connected) return t(locale, 'Noch sind nicht alle Punkte verbunden.', 'Not all points are connected yet.');
      if (!an.isTree) return t(locale, 'Es gibt einen Kreis – eine Verbindung ist überflüssig.', 'There is a cycle – one edge is redundant.');
      return t(locale, `Gesamt ${formatNumber(an.selectedWeight, locale)}. Es geht günstiger.`, `Total ${an.selectedWeight}. It can be cheaper.`);
    }
    return null;
  },
  solve(p) {
    if (p.mode === 'path') {
      if (!p.start || !p.end) return null;
      const best = shortestPath(p, p.start, p.end);
      return best ? { path: best.path, colors: {}, edges: [] } : null;
    }
    if (p.mode === 'color') {
      const colors = colorGraph(p);
      return colors ? { path: [], colors, edges: [] } : null;
    }
    return { path: [], colors: {}, edges: minimumSpanningTree(p).edges };
  },
  scope(s, p) {
    const an = analyse(p, s);
    const best = p.start && p.end ? shortestPath(p, p.start, p.end) : null;
    return { ...an, path: s.path, colors: s.colors, selected: s.edges, shortest: best?.cost ?? null, mst: minimumSpanningTree(p).weight, color: exprFunction((id: string) => s.colors[id] ?? 0) };
  },
  describe(s, p, locale) {
    const label = (id: string) => p.nodes.find((n) => n.id === id)?.label ?? id;
    const edges = p.edges.map((e) => `${label(e.a)}–${label(e.b)}${e.w !== undefined ? ` (${formatNumber(e.w, locale)}${p.unit ? ` ${p.unit}` : ''})` : ''}`).join(', ');
    let st = '';
    if (p.mode === 'path') st = s.path.length ? t(locale, ` Route: ${s.path.map(label).join(' → ')}.`, ` Route: ${s.path.map(label).join(' → ')}.`) : '';
    if (p.mode === 'color') st = t(locale, ` Farben: ${p.nodes.map((n) => `${label(n.id)} ${s.colors[n.id] ?? 0}`).join(', ')}.`, ` Colours: ${p.nodes.map((n) => `${label(n.id)} ${s.colors[n.id] ?? 0}`).join(', ')}.`);
    if (p.mode === 'select') st = t(locale, ` Gewählt: ${s.edges.map((k) => `${label(p.edges[k].a)}–${label(p.edges[k].b)}`).join(', ') || 'nichts'}.`, ` Selected: ${s.edges.map((k) => `${label(p.edges[k].a)}–${label(p.edges[k].b)}`).join(', ') || 'none'}.`);
    return t(locale, `Netzwerk mit ${p.nodes.length} Punkten. Verbindungen: ${edges}.${st}`, `Network with ${p.nodes.length} nodes. Edges: ${edges}.${st}`);
  },
  validateState(s, p) {
    for (let i = 1; i < s.path.length; i++) if (edgeIndex(p, s.path[i - 1], s.path[i]) < 0) return ['path uses missing edge'];
    if (Object.values(s.colors).some((c) => c < 0 || c > p.colors)) return ['colour range'];
    return s.edges.every((k) => k >= 0 && k < p.edges.length) ? [] : ['edge index'];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const ids = new Set(p.nodes.map((n) => n.id));
    for (const e of p.edges) if (!ids.has(e.a) || !ids.has(e.b)) issues.push({ level: 'error', code: 'network.ref', message: `Kante ${e.a}–${e.b}: unbekannter Punkt.` });
    if (p.mode === 'path' && ((p.start && !ids.has(p.start)) || (p.end && !ids.has(p.end)))) issues.push({ level: 'error', code: 'network.ref', message: 'start/end unbekannt.' });
    for (let i = 0; i < p.nodes.length; i++)
      for (let j = i + 1; j < p.nodes.length; j++) {
        const a = p.nodes[i];
        const b = p.nodes[j];
        if (Math.hypot(a.x - b.x, (a.y - b.y) * p.aspect) < 9) issues.push({ level: 'warning', code: 'visual.overlap', message: t(locale, `Punkte ${a.id} und ${b.id} liegen zu dicht.`, `Nodes ${a.id} and ${b.id} are too close.`) });
      }
    return issues;
  },
};
