import { describe, expect, it } from 'vitest';
import { checkSyntax, evaluate, evaluatePredicate, interpolate, interpolateDeep } from '../src/expr.ts';
import { mathEquivalent, parseNumber, evaluateMathString, isSimplified, isFactored, parseMath } from '../src/math.ts';

describe('expression language', () => {
  it('evaluates arithmetic with precedence', () => {
    expect(evaluate('1 + 2 * 3')).toBe(7);
    expect(evaluate('(1 + 2) * 3')).toBe(9);
    expect(evaluate('2 ** 3 ** 2')).toBe(512);
    expect(evaluate('-2 ** 2')).toBe(-4);
    expect(evaluate('10 % 4')).toBe(2);
  });

  it('compares structurally and with float tolerance', () => {
    expect(evaluatePredicate("state.left == ['x']", { state: { left: ['x'] } })).toBe(true);
    expect(evaluatePredicate('0.1 + 0.2 == 0.3')).toBe(true);
    expect(evaluatePredicate('{a: 1, b: [2]} == {b: [2], a: 1}')).toBe(true);
    expect(evaluatePredicate('[1,2] != [2,1]')).toBe(true);
  });

  it('supports the predicates from the spec example', () => {
    const state = { left: ['x', 3], right: [4] };
    expect(evaluatePredicate("state.left.includes(3) && !state.right.includes(7)", { state })).toBe(true);
    expect(evaluatePredicate('state.left.length == 2 && state.right[0] == 4', { state })).toBe(true);
  });

  it('short-circuits and supports ternaries', () => {
    expect(evaluate('false && missing.prop')).toBe(false);
    expect(evaluate('x > 2 ? "big" : "small"', { x: 3 })).toBe('big');
  });

  it('returns undefined for missing properties instead of throwing', () => {
    expect(evaluate('state.nothing.here', { state: {} })).toBeUndefined();
  });

  it('offers whitelisted builtins', () => {
    expect(evaluate('gcd(12, 18)')).toBe(6);
    expect(evaluate('sum([1,2,3]) + count([1,1,2], 1)')).toBe(8);
    expect(evaluate('max(3, 9, 2)')).toBe(9);
  });

  it('refuses prototype access and unknown names', () => {
    expect(() => evaluate('state.constructor', { state: {} })).toThrow(/nicht erlaubt/);
    expect(() => evaluate('state["__proto__"]', { state: {} })).toThrow(/nicht erlaubt/);
    expect(() => evaluate('process.exit()')).toThrow(/Unbekannter Name/);
    expect(evaluate('[].map')).toBeUndefined();
    expect(() => evaluate('[].map(1)')).toThrow(/Nicht-Funktionswert/);
  });

  it('reports syntax errors', () => {
    expect(checkSyntax('1 +')).toMatch(/Ende/);
    expect(checkSyntax('a == b')).toBeNull();
  });

  it('interpolates templates and keeps raw values for whole-string templates', () => {
    expect(interpolate('Löse: x + {{a}} = {{a + b}}', { a: 5, b: 7 })).toBe('Löse: x + 5 = 12');
    expect(interpolate('{{a / 2}}', { a: 5 })).toBe(2.5);
    expect(interpolate('Hälfte: {{a / 2}}', { a: 5 }, 'de')).toBe('Hälfte: 2,5');
    expect(interpolateDeep({ left: { units: '{{b}}' }, list: ['{{a}}'] }, { a: 1, b: 2 })).toEqual({ left: { units: 2 }, list: [1] });
  });
});

describe('math input', () => {
  it('parses German and English number notation', () => {
    expect(parseNumber('0,75')?.value).toBe(0.75);
    expect(parseNumber('0.75')?.value).toBe(0.75);
    expect(parseNumber('-3/4')?.value).toBe(-0.75);
    expect(parseNumber('1 1/2')).toMatchObject({ value: 1.5, kind: 'mixed', num: 3, den: 2 });
    expect(parseNumber('−2')?.value).toBe(-2);
    expect(parseNumber('3/0')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
  });

  it('knows simplified fractions', () => {
    expect(isSimplified(parseNumber('2/4')!)).toBe(false);
    expect(isSimplified(parseNumber('1/2')!)).toBe(true);
    expect(isSimplified(parseNumber('4/2')!)).toBe(false);
  });

  it('handles implicit multiplication and typography', () => {
    expect(evaluateMathString('2x + 3', { x: 2 })).toBe(7);
    expect(evaluateMathString('3(x - 1)', { x: 4 })).toBe(9);
    expect(evaluateMathString('(x+1)(x-1)', { x: 3 })).toBe(8);
    expect(evaluateMathString('2·3 − 1')).toBe(5);
    expect(evaluateMathString('12 : 4')).toBe(3);
    expect(evaluateMathString('x²', { x: 3 })).toBe(9);
  });

  it('checks equivalence by sampling', () => {
    expect(mathEquivalent('2(x+3)', '2x + 6')).toBe(true);
    expect(mathEquivalent('(x+1)^2', 'x^2 + 2x + 1')).toBe(true);
    expect(mathEquivalent('x^2 + 1', 'x^2 - 1')).toBe(false);
    expect(mathEquivalent('a b', 'ab', ['a', 'b'])).toBe(true);
  });

  it('detects factored form', () => {
    expect(isFactored(parseMath('2(x+3)'))).toBe(true);
    expect(isFactored(parseMath('2x+6'))).toBe(false);
  });
});

describe('exponential and logarithm functions', () => {
  it('evaluates exp, ln, log10 and log2', () => {
    expect(evaluate('exp(0)')).toBe(1);
    expect(evaluate('round(ln(exp(2)), 6)')).toBe(2);
    expect(evaluate('log10(1000)')).toBe(3);
    expect(evaluate('log2(8)')).toBe(3);
    expect(evaluate('round(20 * log10(0.5), 1)')).toBe(-6);
  });
});
