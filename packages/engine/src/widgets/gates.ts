import { z } from 'zod';
import { exprFunction } from '../expr.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Logic circuits: switches → gates → lamps. Learners flip switches and/or
 * pick gate types. Check with `goal` (lamp states) or a predicate using the
 * output ids, `table('Q')` (truth table over all free switches) etc.
 * Feedback (a gate fed by a later gate, e.g. two NORs as an SR latch) is
 * allowed: such circuits settle from their previous values, so they remember.
 */
export const GATE_TYPES = ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR'] as const;
export type GateType = (typeof GATE_TYPES)[number];

const Params = z.object({
  inputs: z.array(z.object({ id: z.string(), label: z.string().optional(), value: z.union([z.literal(0), z.literal(1)]).default(0), fixed: z.boolean().default(false) })).min(1).max(4),
  gates: z.array(z.object({ id: z.string(), type: z.union([z.enum(GATE_TYPES), z.literal('?')]), in: z.array(z.string()).min(1).max(3), options: z.array(z.enum(GATE_TYPES)).optional() })).max(6),
  outputs: z.array(z.object({ id: z.string(), from: z.string(), label: z.string().optional() })).min(1).max(3),
  goal: z.record(z.string(), z.union([z.literal(0), z.literal(1)])).optional(),
});

export type GatesParams = z.infer<typeof Params>;
export interface GatesState {
  inputs: Record<string, number>;
  types: Record<string, string>;
  /** Last settled gate values – the memory of circuits with feedback. */
  mem?: Record<string, number>;
}
export type GatesAction = { type: 'toggle'; id: string } | { type: 'cycle'; id: string };

export function gateLabel(type: string, locale: string): string {
  const de: Record<string, string> = { AND: 'UND', OR: 'ODER', NOT: 'NICHT', XOR: 'XOR', NAND: 'NAND', NOR: 'NOR', '?': '?' };
  return locale.startsWith('de') ? de[type] ?? type : type;
}

function applyGate(type: string, vals: number[]): number | null {
  if (vals.some((v) => v === null || v === undefined)) return null;
  switch (type) {
    case 'AND': return vals.every((v) => v === 1) ? 1 : 0;
    case 'OR': return vals.some((v) => v === 1) ? 1 : 0;
    case 'NOT': return vals[0] === 1 ? 0 : 1;
    case 'XOR': return vals.filter((v) => v === 1).length % 2;
    case 'NAND': return vals.every((v) => v === 1) ? 0 : 1;
    case 'NOR': return vals.some((v) => v === 1) ? 0 : 1;
    default: return null;
  }
}

/** Whether some gate depends on its own output (feedback loop). */
export function hasFeedback(p: GatesParams): boolean {
  const gateById = new Map(p.gates.map((g) => [g.id, g]));
  const state: Record<string, 1 | 2> = {};
  const visit = (id: string): boolean => {
    if (state[id] === 2 || !gateById.has(id)) return false;
    if (state[id] === 1) return true;
    state[id] = 1;
    const loop = gateById.get(id)!.in.some(visit);
    state[id] = 2;
    return loop;
  };
  return p.gates.some((g) => visit(g.id));
}

/**
 * Circuits with feedback: start from the previous gate values and update the gates in order until nothing changes
 * (at most 32 rounds; an oscillating circuit keeps its last values).
 */
function settle(p: GatesParams, inputs: Record<string, number>, types: Record<string, string>, prev: Record<string, number> = {}): Record<string, number | null> {
  const v: Record<string, number | null> = { ...inputs };
  for (const g of p.gates) v[g.id] = prev[g.id] ?? 0;
  for (let round = 0; round < 32; round++) {
    let changed = false;
    for (const g of p.gates) {
      const next = applyGate(types[g.id] ?? g.type, g.in.map((x) => v[x] ?? null) as number[]);
      if (next !== v[g.id]) {
        v[g.id] = next;
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const o of p.outputs) v[o.id] = v[o.from] ?? null;
  return v;
}

/** Evaluates every node. Unknown gates ('?') yield null. Circuits with feedback settle from `prev`. */
export function evaluateCircuit(p: GatesParams, inputs: Record<string, number>, types: Record<string, string>, prev?: Record<string, number>): Record<string, number | null> {
  if (hasFeedback(p)) return settle(p, inputs, types, prev);
  const memo: Record<string, number | null> = {};
  const visiting = new Set<string>();
  const gateById = new Map(p.gates.map((g) => [g.id, g]));
  const val = (id: string): number | null => {
    if (id in memo) return memo[id];
    if (id in inputs) return (memo[id] = inputs[id]);
    const g = gateById.get(id);
    if (!g || visiting.has(id)) return null;
    visiting.add(id);
    const v = applyGate(types[id] ?? g.type, g.in.map(val) as number[]);
    visiting.delete(id);
    return (memo[id] = v);
  };
  for (const g of p.gates) val(g.id);
  for (const o of p.outputs) memo[o.id] = val(o.from);
  return memo;
}

const freeInputs = (p: GatesParams) => p.inputs.filter((i) => !i.fixed).map((i) => i.id);

function outputs(p: GatesParams, s: GatesState): Record<string, number | null> {
  const all = evaluateCircuit(p, s.inputs, s.types, s.mem);
  return Object.fromEntries(p.outputs.map((o) => [o.id, all[o.id]]));
}

/** Output column of the truth table over all free inputs (first input = most significant). */
export function truthTable(p: GatesParams, s: GatesState, outId: string): (number | null)[] {
  const free = freeInputs(p);
  const rows: (number | null)[] = [];
  for (let k = 0; k < 2 ** free.length; k++) {
    const inputs = { ...s.inputs };
    free.forEach((id, i) => (inputs[id] = (k >> (free.length - 1 - i)) & 1));
    rows.push(evaluateCircuit(p, inputs, s.types, s.mem)[outId] ?? null);
  }
  return rows;
}

/** Column / row layout for rendering: depth of every node. */
export function circuitDepths(p: GatesParams): Record<string, number> {
  const depth: Record<string, number> = {};
  for (const i of p.inputs) depth[i.id] = 0;
  const gateById = new Map(p.gates.map((g) => [g.id, g]));
  const visiting = new Set<string>();
  // a feedback wire (to a gate still being placed) does not push the gate further right
  const d = (id: string): number => {
    if (id in depth) return depth[id];
    const g = gateById.get(id);
    if (!g || visiting.has(id)) return 0;
    visiting.add(id);
    const v = 1 + Math.max(0, ...g.in.map(d));
    visiting.delete(id);
    return (depth[id] = v);
  };
  for (const g of p.gates) d(g.id);
  const maxD = Math.max(0, ...Object.values(depth));
  for (const o of p.outputs) depth[o.id] = maxD + 1;
  return depth;
}

/** Stores the settled gate values of a circuit with feedback (others need no memory). */
function remember(p: GatesParams, s: GatesState): GatesState {
  if (!hasFeedback(p)) return s;
  const all = evaluateCircuit(p, s.inputs, s.types, s.mem);
  return { ...s, mem: Object.fromEntries(p.gates.map((g) => [g.id, all[g.id] ?? 0])) };
}

export const gatesWidget: WidgetDefinition<GatesParams, GatesState, GatesAction> = {
  kind: 'gates',
  title: { de: 'Logikgatter', en: 'Logic gates' },
  params: Params,
  interactive: true,
  init: (p) => remember(p, {
    inputs: Object.fromEntries(p.inputs.map((i) => [i.id, i.value])),
    types: Object.fromEntries(p.gates.map((g) => [g.id, g.type])),
  }),
  applyAction(s, a, p) {
    if (a.type === 'toggle') {
      const inp = p.inputs.find((i) => i.id === a.id);
      if (!inp || inp.fixed) return s;
      return remember(p, { ...s, inputs: { ...s.inputs, [a.id]: 1 - s.inputs[a.id] } });
    }
    const g = p.gates.find((x) => x.id === a.id);
    if (!g?.options?.length) return s;
    const cur = g.options.indexOf(s.types[a.id] as GateType);
    return remember(p, { ...s, types: { ...s.types, [a.id]: g.options[(cur + 1) % g.options.length] } });
  },
  actions(_s, p) {
    return [
      ...p.inputs.filter((i) => !i.fixed).map((i) => ({ type: 'toggle' as const, id: i.id })),
      ...p.gates.filter((g) => g.options?.length).map((g) => ({ type: 'cycle' as const, id: g.id })),
    ];
  },
  isAnswered: (s) => Object.values(s.types).every((v) => v !== '?'),
  isSolved(s, p) {
    if (!p.goal) return false;
    const out = outputs(p, s);
    return Object.entries(p.goal).every(([id, v]) => out[id] === v);
  },
  scope(s, p) {
    const out = outputs(p, s);
    return { ...out, out, inputs: s.inputs, types: s.types, table: exprFunction((id: string) => truthTable(p, s, id)) };
  },
  describe(s, p, locale) {
    const all = evaluateCircuit(p, s.inputs, s.types, s.mem);
    const ins = p.inputs.map((i) => `${i.label ?? i.id} = ${s.inputs[i.id]}`).join(', ');
    const gs = p.gates.map((g) => `${g.id}: ${gateLabel(s.types[g.id], locale)}(${g.in.join(', ')}) = ${all[g.id] ?? '?'}`).join('; ');
    const outs = p.outputs.map((o) => `${o.label ?? o.id} ${all[o.id] === 1 ? t(locale, 'leuchtet', 'on') : t(locale, 'aus', 'off')}`).join(', ');
    return t(locale, `Schaltung. Schalter: ${ins}. Gatter: ${gs}. Lampen: ${outs}.`, `Circuit. Switches: ${ins}. Gates: ${gs}. Lamps: ${outs}.`);
  },
  validateState(s, p) {
    if (Object.values(s.inputs).some((v) => v !== 0 && v !== 1)) return ['input value'];
    for (const g of p.gates) if (g.options && s.types[g.id] !== g.type && !g.options.includes(s.types[g.id] as GateType)) return ['gate type'];
    return [];
  },
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    const known = new Set([...p.inputs.map((i) => i.id), ...p.gates.map((g) => g.id)]);
    for (const g of p.gates) {
      for (const x of g.in) if (!known.has(x) || x === g.id) issues.push({ level: 'error', code: 'gates.ref', message: `Gatter ${g.id}: unbekannter Eingang ${x}.` });
      if (g.type === 'NOT' && g.in.length !== 1) issues.push({ level: 'error', code: 'gates.arity', message: `NICHT-Gatter ${g.id} braucht genau einen Eingang.` });
      if (g.type === '?' && !g.options?.length) issues.push({ level: 'error', code: 'gates.unknown', message: `Gatter ${g.id} ist »?« ohne Auswahl.` });
      if (g.options?.includes('NOT') && g.in.length !== 1) issues.push({ level: 'error', code: 'gates.arity', message: `Gatter ${g.id}: NICHT braucht genau einen Eingang.` });
    }
    for (const o of p.outputs) if (!known.has(o.from)) issues.push({ level: 'error', code: 'gates.ref', message: `Lampe ${o.id}: unbekannte Quelle ${o.from}.` });
    if (Math.max(...Object.values(circuitDepths(p))) > 5) issues.push({ level: 'warning', code: 'visual.dense', message: t(locale, 'Mehr als 4 Gatter hintereinander werden auf dem Handy zu breit.', 'More than 4 gates in a row get too wide on phones.') });
    return issues;
  },
};
