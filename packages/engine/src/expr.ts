/**
 * A tiny, sandboxed expression language for content predicates such as
 *   state.left.x == 1 && state.right.units == 4
 * It never uses eval/new Function. Only plain data (numbers, strings, booleans,
 * arrays, plain objects) and whitelisted functions/methods are reachable.
 *
 * Semantics worth knowing for authors:
 *  - `==` / `!=` compare structurally (arrays/objects deep) and numbers with a
 *    small tolerance (so 0.1 + 0.2 == 0.3 is true).
 *  - Accessing a missing property yields `undefined` instead of throwing.
 */

import { parseNumber } from './math.ts';

export type Value = number | string | boolean | null | undefined | Value[] | { [k: string]: Value } | Fn;
type Fn = { __fn: (...args: Value[]) => Value };

type Node =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'lit'; v: boolean | null }
  | { t: 'id'; name: string }
  | { t: 'arr'; items: Node[] }
  | { t: 'obj'; entries: [string, Node][] }
  | { t: 'member'; obj: Node; prop: Node; computed: boolean }
  | { t: 'call'; callee: Node; args: Node[] }
  | { t: 'unary'; op: string; arg: Node }
  | { t: 'bin'; op: string; left: Node; right: Node }
  | { t: 'cond'; test: Node; then: Node; else: Node };

export class ExprError extends Error {
  readonly source: string;
  constructor(message: string, source: string) {
    super(`${message} in »${source}«`);
    this.name = 'ExprError';
    this.source = source;
  }
}

type Tok = { k: 'num' | 'str' | 'id' | 'op' | 'eof'; v: string; pos: number };

const OPS = ['===', '!==', '**', '==', '!=', '<=', '>=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '(', ')', '[', ']', '{', '}', ',', '.', '?', ':'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i))!;
      out.push({ k: 'num', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; continue; }
        s += src[j++];
      }
      if (j >= src.length) throw new ExprError('Unbeendeter String', src);
      out.push({ k: 'str', v: s, pos: i });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_$äöüÄÖÜß]/.test(c)) {
      const m = /^[A-Za-z_$äöüÄÖÜß][A-Za-z0-9_$äöüÄÖÜß]*/.exec(src.slice(i))!;
      out.push({ k: 'id', v: m[0], pos: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unerwartetes Zeichen '${c}'`, src);
    out.push({ k: 'op', v: op, pos: i });
    i += op.length;
  }
  out.push({ k: 'eof', v: '', pos: src.length });
  return out;
}

class Parser {
  private i = 0;
  private toks: Tok[];
  private src: string;
  constructor(src: string) {
    this.src = src;
    this.toks = tokenize(src);
  }
  private peek() { return this.toks[this.i]; }
  private next() { return this.toks[this.i++]; }
  private isOp(v: string) { const t = this.peek(); return t.k === 'op' && t.v === v; }
  private expect(v: string) {
    const t = this.next();
    if (t.k !== 'op' || t.v !== v) throw new ExprError(`'${v}' erwartet, '${t.v || 'Ende'}' gefunden`, this.src);
  }
  parse(): Node {
    const n = this.ternary();
    if (this.peek().k !== 'eof') throw new ExprError(`Unerwartetes '${this.peek().v}'`, this.src);
    return n;
  }
  private ternary(): Node {
    const test = this.binary(0);
    if (this.isOp('?')) {
      this.next();
      const a = this.ternary();
      this.expect(':');
      const b = this.ternary();
      return { t: 'cond', test, then: a, else: b };
    }
    return test;
  }
  private static PREC: Record<string, number> = {
    '||': 1, '&&': 2, '==': 3, '!=': 3, '===': 3, '!==': 3,
    '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6,
  };
  private binary(minPrec: number): Node {
    let left = this.unary();
    for (;;) {
      const t = this.peek();
      const p = t.k === 'op' ? Parser.PREC[t.v] : undefined;
      if (p === undefined || p <= minPrec - 1 || p < minPrec) break;
      this.next();
      const right = this.binary(p + 1);
      left = { t: 'bin', op: t.v, left, right };
    }
    return left;
  }
  private unary(): Node {
    if (this.isOp('!') || this.isOp('-') || this.isOp('+')) {
      const op = this.next().v;
      return { t: 'unary', op, arg: this.unary() };
    }
    return this.power();
  }
  private power(): Node {
    const base = this.postfix();
    if (this.isOp('**')) {
      this.next();
      return { t: 'bin', op: '**', left: base, right: this.unary() };
    }
    return base;
  }
  private postfix(): Node {
    let n = this.primary();
    for (;;) {
      if (this.isOp('.')) {
        this.next();
        const id = this.next();
        if (id.k !== 'id') throw new ExprError('Eigenschaftsname erwartet', this.src);
        n = { t: 'member', obj: n, prop: { t: 'str', v: id.v }, computed: false };
      } else if (this.isOp('[')) {
        this.next();
        const prop = this.ternary();
        this.expect(']');
        n = { t: 'member', obj: n, prop, computed: true };
      } else if (this.isOp('(')) {
        this.next();
        const args: Node[] = [];
        if (!this.isOp(')')) {
          do { args.push(this.ternary()); } while (this.isOp(',') && this.next());
        }
        this.expect(')');
        n = { t: 'call', callee: n, args };
      } else break;
    }
    return n;
  }
  private primary(): Node {
    const t = this.next();
    if (t.k === 'num') return { t: 'num', v: Number(t.v) };
    if (t.k === 'str') return { t: 'str', v: t.v };
    if (t.k === 'id') {
      if (t.v === 'true') return { t: 'lit', v: true };
      if (t.v === 'false') return { t: 'lit', v: false };
      if (t.v === 'null') return { t: 'lit', v: null };
      return { t: 'id', name: t.v };
    }
    if (t.k === 'op' && t.v === '(') {
      const n = this.ternary();
      this.expect(')');
      return n;
    }
    if (t.k === 'op' && t.v === '[') {
      const items: Node[] = [];
      if (!this.isOp(']')) {
        do { items.push(this.ternary()); } while (this.isOp(',') && this.next());
      }
      this.expect(']');
      return { t: 'arr', items };
    }
    if (t.k === 'op' && t.v === '{') {
      const entries: [string, Node][] = [];
      if (!this.isOp('}')) {
        do {
          const k = this.next();
          if (k.k !== 'id' && k.k !== 'str') throw new ExprError('Schlüssel erwartet', this.src);
          this.expect(':');
          entries.push([k.v, this.ternary()]);
        } while (this.isOp(',') && this.next());
      }
      this.expect('}');
      return { t: 'obj', entries };
    }
    throw new ExprError(`Unerwartetes '${t.v || 'Ende'}'`, this.src);
  }
}

const cache = new Map<string, Node>();

export function parseExpr(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    n = new Parser(src).parse();
    if (cache.size > 2000) cache.clear();
    cache.set(src, n);
  }
  return n;
}

const EPS = 1e-9;

export function deepEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b || Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const ka = Object.keys(a as object).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
    const kb = Object.keys(b as object).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

function gcd(a: number, b: number): number {
  a = Math.abs(Math.round(a));
  b = Math.abs(Math.round(b));
  while (b) [a, b] = [b, a % b];
  return a;
}

const fn = (f: (...a: any[]) => Value): Fn => ({ __fn: f });

/** Functions available in every expression. */
export const BUILTINS: Record<string, Fn> = {
  abs: fn((x: number) => Math.abs(x)),
  min: fn((...xs: number[]) => Math.min(...(Array.isArray(xs[0]) ? (xs[0] as unknown as number[]) : xs))),
  max: fn((...xs: number[]) => Math.max(...(Array.isArray(xs[0]) ? (xs[0] as unknown as number[]) : xs))),
  round: fn((x: number, d = 0) => Math.round(x * 10 ** d) / 10 ** d),
  floor: fn((x: number) => Math.floor(x)),
  ceil: fn((x: number) => Math.ceil(x)),
  sqrt: fn((x: number) => Math.sqrt(x)),
  pow: fn((a: number, b: number) => a ** b),
  sign: fn((x: number) => Math.sign(x)),
  bin: fn((x: number, width = 0) => Math.trunc(x).toString(2).padStart(width, '0')),
  hex: fn((x: number, width = 0) => Math.trunc(x).toString(16).toUpperCase().padStart(width, '0')),
  mod: fn((a: number, b: number) => ((a % b) + b) % b),
  chr: fn((i: number) => String.fromCharCode(65 + ((((Math.trunc(i)) % 26) + 26) % 26))),
  ord: fn((c: string) => String(c).toUpperCase().charCodeAt(0) - 65),
  gcd: fn((a: number, b: number) => gcd(a, b)),
  lcm: fn((a: number, b: number) => Math.abs(a * b) / (gcd(a, b) || 1)),
  len: fn((x: unknown) => (Array.isArray(x) || typeof x === 'string' ? x.length : 0)),
  sum: fn((xs: number[]) => (Array.isArray(xs) ? xs.reduce((s, x) => s + Number(x), 0) : 0)),
  count: fn((xs: unknown[], v: unknown) => (Array.isArray(xs) ? xs.filter((x) => deepEqual(x, v)).length : 0)),
  keys: fn((o: unknown) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o) : [])),
  values: fn((o: unknown) => (o && typeof o === 'object' && !Array.isArray(o) ? (Object.values(o) as Value[]) : [])),
  sorted: fn((xs: unknown[]) => (Array.isArray(xs) ? [...(xs as Value[])].sort((a, b) => (a! < b! ? -1 : a! > b! ? 1 : 0)) : [])),
  int: fn((x: unknown) => Math.trunc(Number(x))),
  num: fn((x: unknown) => Number(x)),
  str: fn((x: unknown) => String(x)),
  isInt: fn((x: unknown) => typeof x === 'number' && Number.isInteger(x)),
  approx: fn((a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol),
  mean: fn((xs: number[]) => (Array.isArray(xs) && xs.length ? xs.reduce((s, x) => s + Number(x), 0) / xs.length : 0)),
  median: fn((xs: number[]) => {
    if (!Array.isArray(xs) || !xs.length) return 0;
    const s = [...xs].map(Number).sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }),
  /** Reads learner number input ("3/4", "0,75", "1 1/2") → number or null. */
  numval: fn((x: unknown) => (typeof x === 'number' ? x : (parseNumber(String(x ?? ''))?.value ?? null))),
};

const METHODS: Record<string, (self: any, ...args: any[]) => Value> = {
  includes: (s, v) => (Array.isArray(s) ? s.some((x) => deepEqual(x, v)) : typeof s === 'string' ? s.includes(String(v)) : false),
  indexOf: (s, v) => (Array.isArray(s) ? s.findIndex((x) => deepEqual(x, v)) : typeof s === 'string' ? s.indexOf(String(v)) : -1),
  join: (s, sep = ',') => (Array.isArray(s) ? s.join(sep) : String(s)),
  slice: (s, a, b) => (Array.isArray(s) || typeof s === 'string' ? s.slice(a, b) : undefined),
  startsWith: (s, v) => typeof s === 'string' && s.startsWith(v),
  endsWith: (s, v) => typeof s === 'string' && s.endsWith(v),
  toLowerCase: (s) => (typeof s === 'string' ? s.toLowerCase() : s),
  toUpperCase: (s) => (typeof s === 'string' ? s.toUpperCase() : s),
  trim: (s) => (typeof s === 'string' ? s.trim() : s),
};

const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

type Bound = { __method: string; self: unknown };

function getMember(obj: unknown, prop: unknown, src: string): Value | Bound {
  const key = String(prop);
  if (FORBIDDEN.has(key)) throw new ExprError(`Zugriff auf '${key}' ist nicht erlaubt`, src);
  if (obj === null || obj === undefined) return undefined;
  if ((Array.isArray(obj) || typeof obj === 'string') && key === 'length') return obj.length;
  if (key in METHODS && (Array.isArray(obj) || typeof obj === 'string')) return { __method: key, self: obj };
  if (Array.isArray(obj)) {
    const idx = Number(key);
    return Number.isInteger(idx) ? (obj[idx < 0 ? obj.length + idx : idx] as Value) : undefined;
  }
  if (typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key)) {
    return (obj as Record<string, Value>)[key];
  }
  return undefined;
}

function truthy(v: unknown): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return Boolean(v);
}

function evalNode(n: Node, scope: Record<string, unknown>, src: string): Value {
  switch (n.t) {
    case 'num':
    case 'str':
    case 'lit':
      return n.v;
    case 'id': {
      if (Object.prototype.hasOwnProperty.call(scope, n.name)) return scope[n.name] as Value;
      if (n.name in BUILTINS) return BUILTINS[n.name];
      if (n.name === 'undefined') return undefined;
      throw new ExprError(`Unbekannter Name '${n.name}'`, src);
    }
    case 'arr':
      return n.items.map((x) => evalNode(x, scope, src));
    case 'obj': {
      const o: Record<string, Value> = {};
      for (const [k, v] of n.entries) {
        if (FORBIDDEN.has(k)) throw new ExprError(`Schlüssel '${k}' ist nicht erlaubt`, src);
        o[k] = evalNode(v, scope, src);
      }
      return o;
    }
    case 'member': {
      const obj = evalNode(n.obj, scope, src);
      const prop = n.computed ? evalNode(n.prop, scope, src) : (n.prop as { v: string }).v;
      const m = getMember(obj, prop, src);
      if (m && typeof m === 'object' && '__method' in m) {
        throw new ExprError(`Methode '${(m as Bound).__method}' muss aufgerufen werden`, src);
      }
      return m as Value;
    }
    case 'call': {
      let target: unknown;
      if (n.callee.t === 'member') {
        const obj = evalNode(n.callee.obj, scope, src);
        const prop = n.callee.computed ? evalNode(n.callee.prop, scope, src) : (n.callee.prop as { v: string }).v;
        target = getMember(obj, prop, src);
      } else {
        target = evalNode(n.callee, scope, src);
      }
      const args = n.args.map((a) => evalNode(a, scope, src));
      if (target && typeof target === 'object' && '__method' in target) {
        const b = target as Bound;
        return METHODS[b.__method](b.self, ...args);
      }
      if (target && typeof target === 'object' && '__fn' in target) {
        return (target as Fn).__fn(...args);
      }
      throw new ExprError('Aufruf eines Nicht-Funktionswerts', src);
    }
    case 'unary': {
      const v = evalNode(n.arg, scope, src);
      if (n.op === '!') return !truthy(v);
      if (n.op === '-') return -Number(v);
      return Number(v);
    }
    case 'bin': {
      if (n.op === '&&') {
        const l = evalNode(n.left, scope, src);
        return truthy(l) ? evalNode(n.right, scope, src) : l;
      }
      if (n.op === '||') {
        const l = evalNode(n.left, scope, src);
        return truthy(l) ? l : evalNode(n.right, scope, src);
      }
      const a = evalNode(n.left, scope, src);
      const b = evalNode(n.right, scope, src);
      switch (n.op) {
        case '==': case '===': return deepEqual(a, b);
        case '!=': case '!==': return !deepEqual(a, b);
        case '<': return (a as number) < (b as number);
        case '<=': return (a as number) <= (b as number) || deepEqual(a, b);
        case '>': return (a as number) > (b as number);
        case '>=': return (a as number) >= (b as number) || deepEqual(a, b);
        case '+':
          if (typeof a === 'string' || typeof b === 'string') return String(a) + String(b);
          return Number(a) + Number(b);
        case '-': return Number(a) - Number(b);
        case '*': return Number(a) * Number(b);
        case '/': return Number(a) / Number(b);
        case '%': return Number(a) % Number(b);
        case '**': return Number(a) ** Number(b);
      }
      throw new ExprError(`Unbekannter Operator ${n.op}`, src);
    }
    case 'cond':
      return truthy(evalNode(n.test, scope, src)) ? evalNode(n.then, scope, src) : evalNode(n.else, scope, src);
  }
}

/** Evaluates an expression against a scope of plain data. Throws ExprError on syntax/runtime problems. */
export function evaluate(src: string, scope: Record<string, unknown> = {}): Value {
  return evalNode(parseExpr(src), scope, src);
}

/** Evaluates an expression and coerces to boolean. */
export function evaluatePredicate(src: string, scope: Record<string, unknown> = {}): boolean {
  return truthy(evaluate(src, scope));
}

/** Validates syntax without evaluating. Returns an error message or null. */
export function checkSyntax(src: string): string | null {
  try {
    parseExpr(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

/** Builds a callable function value usable inside expression scopes. */
export function exprFunction(f: (...args: any[]) => unknown): Fn {
  return { __fn: f as (...args: Value[]) => Value };
}

export function formatNumber(n: number, locale: string): string {
  if (!Number.isFinite(n)) return String(n);
  const r = Math.round(n * 1e9) / 1e9;
  const s = String(r);
  return locale.startsWith('de') ? s.replace('.', ',') : s;
}

const TEMPLATE = /\{\{\s*([^}]+?)\s*\}\}/g;

/**
 * Replaces {{ expr }} in strings. If the whole string is a single template,
 * the raw value is returned (so numbers stay numbers).
 */
export function interpolate(input: string, scope: Record<string, unknown>, locale = 'de'): unknown {
  const whole = /^\{\{\s*([^}]+?)\s*\}\}$/.exec(input);
  if (whole) return evaluate(whole[1], scope);
  return input.replace(TEMPLATE, (_, e: string) => {
    const v = evaluate(e, scope);
    return typeof v === 'number' ? formatNumber(v, locale) : String(v);
  });
}

export function hasTemplate(s: string): boolean {
  TEMPLATE.lastIndex = 0;
  return TEMPLATE.test(s);
}

/** Applies interpolate() deeply through arrays/objects. */
export function interpolateDeep<T>(value: T, scope: Record<string, unknown>, locale = 'de'): T {
  if (typeof value === 'string') return (hasTemplate(value) ? interpolate(value, scope, locale) : value) as T;
  if (Array.isArray(value)) return value.map((v) => interpolateDeep(v, scope, locale)) as T;
  if (value && typeof value === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) o[k] = interpolateDeep(v, scope, locale);
    return o as T;
  }
  return value;
}
