/**
 * Variant generation: a problem can declare parameter generators so that
 * every review shows a fresh instance of the same idea.
 *
 *   variants:
 *     params: { a: "int[1,9]", b: "int[2,9]" }
 *     derive: { c: "a + b" }
 *     constraints: ["a != b"]
 *     defaults: { a: 5, b: 7 }
 */
import { evaluate, evaluatePredicate } from './expr.ts';
import { hashString, mulberry32, randInt } from './rng.ts';
import type { VariantSpec } from './schema.ts';

export class VariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VariantError';
  }
}

type Gen = (rnd: () => number) => number;

export function parseGenerator(spec: string): Gen {
  const s = spec.replace(/\s/g, '');
  let m = /^int\[(-?\d+),(-?\d+)\]$/.exec(s);
  if (m) {
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    if (lo > hi) throw new VariantError(`Leerer Bereich in ${spec}`);
    return (r) => randInt(r, lo, hi);
  }
  m = /^nonzero\[(-?\d+),(-?\d+)\]$/.exec(s);
  if (m) {
    const [lo, hi] = [Number(m[1]), Number(m[2])];
    const vals: number[] = [];
    for (let v = lo; v <= hi; v++) if (v !== 0) vals.push(v);
    if (!vals.length) throw new VariantError(`Leerer Bereich in ${spec}`);
    return (r) => vals[Math.floor(r() * vals.length)];
  }
  m = /^choice\[(.+)\]$/.exec(s);
  if (m) {
    const vals = m[1].split(',').map(Number);
    if (vals.some((v) => !Number.isFinite(v))) throw new VariantError(`choice[] braucht Zahlen: ${spec}`);
    return (r) => vals[Math.floor(r() * vals.length)];
  }
  m = /^step\[(-?[\d.]+),(-?[\d.]+),([\d.]+)\]$/.exec(s);
  if (m) {
    const [lo, hi, st] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const n = Math.floor((hi - lo) / st + 1e-9);
    return (r) => Math.round((lo + randInt(r, 0, n) * st) * 1e9) / 1e9;
  }
  throw new VariantError(`Unbekannter Generator »${spec}« (erlaubt: int[a,b], nonzero[a,b], choice[x,y,…], step[a,b,s])`);
}

function deriveAll(spec: VariantSpec, base: Record<string, number>): Record<string, unknown> {
  const vars: Record<string, unknown> = { ...base };
  for (const [k, e] of Object.entries(spec.derive ?? {})) vars[k] = evaluate(e, vars);
  return vars;
}

function satisfies(spec: VariantSpec, vars: Record<string, unknown>): boolean {
  return (spec.constraints ?? []).every((c) => evaluatePredicate(c, vars));
}

/**
 * Seed 0 is the canonical lesson variant (uses `defaults` when given).
 * Any other seed samples (rejection sampling, max 500 tries).
 */
export function sampleVariant(spec: VariantSpec, seed: number): Record<string, unknown> {
  if (seed === 0 && spec.defaults) {
    const vars = deriveAll(spec, spec.defaults);
    if (!satisfies(spec, vars)) throw new VariantError('defaults verletzen die constraints');
    return vars;
  }
  const gens = Object.entries(spec.params).map(([k, g]) => [k, parseGenerator(g)] as const);
  const rnd = mulberry32(hashString(`variant:${seed}`));
  for (let i = 0; i < 500; i++) {
    const base: Record<string, number> = {};
    for (const [k, g] of gens) base[k] = g(rnd);
    const vars = deriveAll(spec, base);
    if (satisfies(spec, vars)) return vars;
  }
  throw new VariantError('Keine gültige Variante nach 500 Versuchen – constraints zu streng?');
}
