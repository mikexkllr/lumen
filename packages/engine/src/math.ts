/**
 * Math input parsing for learners: numbers in German/English notation,
 * fractions, mixed numbers and algebraic expressions with implicit
 * multiplication (2x, 3(x+1), (x+1)(x-1)). Expressions are checked for
 * equivalence by evaluating at seeded random sample points.
 */
import { mulberry32 } from './rng.ts';

export type MathNode =
  | { t: 'num'; v: number }
  | { t: 'var'; name: string }
  | { t: 'neg'; arg: MathNode }
  | { t: 'op'; op: '+' | '-' | '*' | '/' | '^'; left: MathNode; right: MathNode; implicit?: boolean }
  | { t: 'fn'; name: string; arg: MathNode }
  | { t: 'group'; arg: MathNode };

export class MathParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MathParseError';
  }
}

const FUNCS = new Set(['sqrt', 'abs', 'sin', 'cos', 'tan', 'ln', 'log', 'exp']);
const CONSTS: Record<string, number> = { pi: Math.PI, π: Math.PI };

/** Normalises typographic variants a learner (or keyboard) may produce. */
export function normalizeMathInput(s: string): string {
  return s
    .replace(/[−–—]/g, '-')
    .replace(/[·×⋅]/g, '*')
    .replace(/[÷:]/g, '/')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/√/g, 'sqrt')
    .replace(/(\d),(\d)/g, '$1.$2')
    .trim();
}

type Tok = { k: 'num' | 'id' | 'op'; v: string };

function tokenize(input: string, variables: string[]): Tok[] {
  const s = normalizeMathInput(input);
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));
      if (!m) throw new MathParseError(`Zahl nicht lesbar bei '${s.slice(i)}'`);
      toks.push({ k: 'num', v: m[1] });
      i += m[1].length;
      continue;
    }
    if (/[A-Za-zπ]/.test(c)) {
      const m = /^[A-Za-zπ]+/.exec(s.slice(i))!;
      let word = m[0];
      i += word.length;
      // Split words into known functions/constants/variables: "xy" -> x*y, "sqrtx" -> sqrt x
      while (word.length) {
        const f = [...FUNCS].find((n) => word.toLowerCase().startsWith(n));
        if (f) { toks.push({ k: 'id', v: f }); word = word.slice(f.length); continue; }
        const multi = variables.find((v) => v.length > 1 && word.startsWith(v));
        if (multi) { toks.push({ k: 'id', v: multi }); word = word.slice(multi.length); continue; }
        if (word.toLowerCase().startsWith('pi')) { toks.push({ k: 'id', v: 'pi' }); word = word.slice(2); continue; }
        toks.push({ k: 'id', v: word[0] });
        word = word.slice(1);
      }
      continue;
    }
    if ('+-*/^()'.includes(c)) {
      toks.push({ k: 'op', v: c });
      i++;
      continue;
    }
    throw new MathParseError(`Unerwartetes Zeichen '${c}'`);
  }
  return toks;
}

class MathParser {
  private i = 0;
  private toks: Tok[];
  constructor(toks: Tok[]) {
    this.toks = toks;
  }
  private peek(): Tok | undefined { return this.toks[this.i]; }
  parse(): MathNode {
    if (!this.toks.length) throw new MathParseError('Leere Eingabe');
    const n = this.sum();
    if (this.i < this.toks.length) throw new MathParseError(`Unerwartetes '${this.peek()!.v}'`);
    return n;
  }
  private sum(): MathNode {
    let left = this.product();
    for (;;) {
      const t = this.peek();
      if (t?.k === 'op' && (t.v === '+' || t.v === '-')) {
        this.i++;
        left = { t: 'op', op: t.v, left, right: this.product() };
      } else return left;
    }
  }
  private startsFactor(t: Tok | undefined): boolean {
    return !!t && (t.k === 'num' || t.k === 'id' || (t.k === 'op' && t.v === '('));
  }
  private product(): MathNode {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      if (t?.k === 'op' && (t.v === '*' || t.v === '/')) {
        this.i++;
        left = { t: 'op', op: t.v, left, right: this.unary() };
      } else if (this.startsFactor(t)) {
        left = { t: 'op', op: '*', left, right: this.power(), implicit: true };
      } else return left;
    }
  }
  private unary(): MathNode {
    const t = this.peek();
    if (t?.k === 'op' && (t.v === '-' || t.v === '+')) {
      this.i++;
      const arg = this.unary();
      return t.v === '-' ? { t: 'neg', arg } : arg;
    }
    return this.power();
  }
  private power(): MathNode {
    const base = this.atom();
    const t = this.peek();
    if (t?.k === 'op' && t.v === '^') {
      this.i++;
      return { t: 'op', op: '^', left: base, right: this.unary() };
    }
    return base;
  }
  private atom(): MathNode {
    const t = this.toks[this.i++];
    if (!t) throw new MathParseError('Ausdruck endet unerwartet');
    if (t.k === 'num') return { t: 'num', v: Number(t.v) };
    if (t.k === 'id') {
      if (FUNCS.has(t.v)) {
        const arg = this.power();
        return { t: 'fn', name: t.v, arg };
      }
      if (t.v in CONSTS) return { t: 'num', v: CONSTS[t.v] };
      return { t: 'var', name: t.v };
    }
    if (t.v === '(') {
      const inner = this.sum();
      const close = this.toks[this.i++];
      if (!close || close.v !== ')') throw new MathParseError('Schließende Klammer fehlt');
      return { t: 'group', arg: inner };
    }
    throw new MathParseError(`Unerwartetes '${t.v}'`);
  }
}

export function parseMath(input: string, variables: string[] = ['x']): MathNode {
  return new MathParser(tokenize(input, variables)).parse();
}

export function evalMath(node: MathNode, env: Record<string, number> = {}): number {
  switch (node.t) {
    case 'num': return node.v;
    case 'var':
      if (!(node.name in env)) {
        if (node.name === 'e') return Math.E;
        throw new MathParseError(`Unbekannte Variable '${node.name}'`);
      }
      return env[node.name];
    case 'neg': return -evalMath(node.arg, env);
    case 'group': return evalMath(node.arg, env);
    case 'fn': {
      const a = evalMath(node.arg, env);
      switch (node.name) {
        case 'sqrt': return Math.sqrt(a);
        case 'abs': return Math.abs(a);
        case 'sin': return Math.sin(a);
        case 'cos': return Math.cos(a);
        case 'tan': return Math.tan(a);
        case 'ln': return Math.log(a);
        case 'log': return Math.log10(a);
        case 'exp': return Math.exp(a);
      }
      return NaN;
    }
    case 'op': {
      const l = evalMath(node.left, env);
      const r = evalMath(node.right, env);
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return l / r;
        case '^': return l ** r;
      }
    }
  }
}

export function collectVariables(node: MathNode, out = new Set<string>()): Set<string> {
  if (node.t === 'var') out.add(node.name);
  else if (node.t === 'neg' || node.t === 'group' || node.t === 'fn') collectVariables(node.arg, out);
  else if (node.t === 'op') { collectVariables(node.left, out); collectVariables(node.right, out); }
  return out;
}

export function containsGroup(node: MathNode): boolean {
  if (node.t === 'group') return true;
  if (node.t === 'neg' || node.t === 'fn') return containsGroup(node.arg);
  if (node.t === 'op') return containsGroup(node.left) || containsGroup(node.right);
  return false;
}

/** True when the top level is a product that contains at least one parenthesised factor. */
export function isFactored(node: MathNode): boolean {
  const n = node.t === 'neg' ? node.arg : node;
  return n.t === 'op' && n.op === '*' && containsGroup(n);
}

export function evaluateMathString(input: string, env: Record<string, number> = {}): number {
  return evalMath(parseMath(input, Object.keys(env)), env);
}

/**
 * Numerical equivalence test: both expressions are evaluated at seeded pseudo
 * random points. Points where either side is undefined are skipped.
 */
export function mathEquivalent(a: string | MathNode, b: string | MathNode, variables: string[] = ['x'], seed = 7): boolean {
  const na = typeof a === 'string' ? parseMath(a, variables) : a;
  const nb = typeof b === 'string' ? parseMath(b, variables) : b;
  const vars = new Set([...variables, ...collectVariables(na), ...collectVariables(nb)]);
  vars.delete('e');
  const rnd = mulberry32(seed);
  let valid = 0;
  for (let k = 0; k < 40 && valid < 12; k++) {
    const env: Record<string, number> = {};
    for (const v of vars) env[v] = Math.round((rnd() * 10 - 5) * 1000) / 1000 + 0.0137;
    let x: number, y: number;
    try {
      x = evalMath(na, env);
      y = evalMath(nb, env);
    } catch {
      return false;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    valid++;
    if (Math.abs(x - y) > 1e-7 * Math.max(1, Math.abs(x), Math.abs(y))) return false;
  }
  return valid >= 5;
}

// ---------- Numbers & fractions ----------

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export interface ParsedNumber {
  value: number;
  kind: 'integer' | 'decimal' | 'fraction' | 'mixed';
  num?: number;
  den?: number;
}

/**
 * Parses learner number input: "7", "-2", "0,75", "0.75", "3/4", "-3/4", "1 1/2".
 * Returns null if it cannot be read.
 */
export function parseNumber(raw: string): ParsedNumber | null {
  const s = normalizeMathInput(raw).replace(/\s+/g, ' ');
  if (!s) return null;
  let m = /^([+-]?)(\d+)$/.exec(s);
  if (m) return { value: Number(m[1] + m[2]), kind: 'integer' };
  m = /^([+-]?)(\d*\.\d+|\d+\.\d*)$/.exec(s);
  if (m) return { value: Number(m[1] + m[2]), kind: 'decimal' };
  m = /^([+-]?)\s*(\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const den = Number(m[3]);
    if (den === 0) return null;
    const sign = m[1] === '-' ? -1 : 1;
    return { value: (sign * Number(m[2])) / den, kind: 'fraction', num: sign * Number(m[2]), den };
  }
  m = /^([+-]?)(\d+) (\d+)\s*\/\s*(\d+)$/.exec(s);
  if (m) {
    const den = Number(m[4]);
    if (den === 0) return null;
    const sign = m[1] === '-' ? -1 : 1;
    const num = Number(m[2]) * den + Number(m[3]);
    return { value: (sign * num) / den, kind: 'mixed', num: sign * num, den };
  }
  return null;
}

/** Resolves an author-supplied target ("3/4", 0.75, "7/12", "2*3") to a number. */
export function resolveNumber(v: number | string): number {
  if (typeof v === 'number') return v;
  const p = parseNumber(v);
  if (p) return p.value;
  return evaluateMathString(v);
}

export function isSimplified(p: ParsedNumber): boolean {
  if (p.kind !== 'fraction' && p.kind !== 'mixed') return true;
  return gcd(p.num!, p.den!) === 1 && p.den !== 1;
}

export function toFraction(value: number, maxDen = 1000): { num: number; den: number } {
  for (let den = 1; den <= maxDen; den++) {
    const num = Math.round(value * den);
    if (Math.abs(num / den - value) < 1e-9) {
      const g = gcd(num, den) || 1;
      return { num: num / g, den: den / g };
    }
  }
  return { num: value, den: 1 };
}

export function formatFraction(num: number, den: number): string {
  return den === 1 ? String(num) : `${num}/${den}`;
}
