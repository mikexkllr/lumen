import { z } from 'zod';
import { formatNumber } from '../expr.ts';
import { evalMath, parseMath } from '../math.ts';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Interactive simulations ("Labor"). A scene has controls (sliders) and
 * derived outputs computed by a pure function, so the same definition drives
 * the animated view, the checks and the tutor. Goals are ranges over controls
 * or outputs (`answer`) or a predicate over the same names.
 */
export interface SimControl {
  id: string;
  label: { de: string; en: string };
  unit?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Hidden and constant unless a lesson unlocks it. */
  fixed?: boolean;
}
export interface SimOutput {
  id: string;
  label: { de: string; en: string };
  unit?: string;
  digits?: number;
}
export interface SimScene {
  title: { de: string; en: string };
  controls: SimControl[];
  outputs: SimOutput[];
  compute(v: Record<string, number>, p: SimParams): Record<string, number>;
}

const r = (x: number, d = 2) => {
  const m = 10 ** d;
  return Math.round(x * m) / m;
};
const rad = (deg: number) => (deg * Math.PI) / 180;
const fx = (p: SimParams, fallback: string) => {
  const node = parseMath(p.expr ?? fallback, ['x']);
  return (x: number) => evalMath(node, { x });
};

export const SIM_SCENES: Record<string, SimScene> = {
  projectile: {
    title: { de: 'Wurfbahn', en: 'Projectile' },
    controls: [
      { id: 'angle', label: { de: 'Winkel', en: 'Angle' }, unit: '°', min: 5, max: 85, step: 5, value: 20 },
      { id: 'speed', label: { de: 'Tempo', en: 'Speed' }, unit: 'm/s', min: 5, max: 30, step: 1, value: 15 },
      { id: 'g', label: { de: 'Schwerkraft', en: 'Gravity' }, unit: 'm/s²', min: 1.6, max: 24.8, step: 0.1, value: 9.8, fixed: true },
    ],
    outputs: [
      { id: 'range', label: { de: 'Weite', en: 'Range' }, unit: 'm', digits: 1 },
      { id: 'height', label: { de: 'Höhe', en: 'Height' }, unit: 'm', digits: 1 },
      { id: 'time', label: { de: 'Flugzeit', en: 'Flight time' }, unit: 's', digits: 2 },
    ],
    compute: (v) => ({
      range: r((v.speed ** 2 * Math.sin(2 * rad(v.angle))) / v.g, 1),
      height: r((v.speed * Math.sin(rad(v.angle))) ** 2 / (2 * v.g), 1),
      time: r((2 * v.speed * Math.sin(rad(v.angle))) / v.g, 2),
    }),
  },
  pendulum: {
    title: { de: 'Pendel', en: 'Pendulum' },
    controls: [
      { id: 'length', label: { de: 'Länge', en: 'Length' }, unit: 'm', min: 0.25, max: 4, step: 0.25, value: 0.5 },
      { id: 'mass', label: { de: 'Masse', en: 'Mass' }, unit: 'kg', min: 0.5, max: 5, step: 0.5, value: 1 },
      { id: 'g', label: { de: 'Schwerkraft', en: 'Gravity' }, unit: 'm/s²', min: 1.6, max: 24.8, step: 0.1, value: 9.8, fixed: true },
    ],
    outputs: [
      { id: 'period', label: { de: 'Periode', en: 'Period' }, unit: 's', digits: 2 },
      { id: 'frequency', label: { de: 'Frequenz', en: 'Frequency' }, unit: 'Hz', digits: 2 },
    ],
    compute: (v) => {
      const T = 2 * Math.PI * Math.sqrt(v.length / v.g);
      return { period: r(T, 2), frequency: r(1 / T, 2) };
    },
  },
  wave: {
    title: { de: 'Welle', en: 'Wave' },
    controls: [
      { id: 'amplitude', label: { de: 'Amplitude', en: 'Amplitude' }, unit: 'cm', min: 1, max: 5, step: 0.5, value: 2 },
      { id: 'wavelength', label: { de: 'Wellenlänge', en: 'Wavelength' }, unit: 'm', min: 0.5, max: 6, step: 0.5, value: 4 },
      { id: 'frequency', label: { de: 'Frequenz', en: 'Frequency' }, unit: 'Hz', min: 0.5, max: 4, step: 0.5, value: 1 },
    ],
    outputs: [
      { id: 'speed', label: { de: 'Tempo', en: 'Speed' }, unit: 'm/s', digits: 2 },
      { id: 'period', label: { de: 'Periode', en: 'Period' }, unit: 's', digits: 2 },
    ],
    compute: (v) => ({ speed: r(v.wavelength * v.frequency, 2), period: r(1 / v.frequency, 2) }),
  },
  circuit: {
    title: { de: 'Stromkreis', en: 'Circuit' },
    controls: [
      { id: 'voltage', label: { de: 'Spannung', en: 'Voltage' }, unit: 'V', min: 1, max: 24, step: 1, value: 6 },
      { id: 'resistance', label: { de: 'Widerstand', en: 'Resistance' }, unit: 'Ω', min: 1, max: 24, step: 1, value: 12 },
    ],
    outputs: [
      { id: 'current', label: { de: 'Stromstärke', en: 'Current' }, unit: 'A', digits: 2 },
      { id: 'power', label: { de: 'Leistung', en: 'Power' }, unit: 'W', digits: 1 },
    ],
    compute: (v) => ({ current: r(v.voltage / v.resistance, 2), power: r(v.voltage ** 2 / v.resistance, 1) }),
  },
  gas: {
    title: { de: 'Gas im Kolben', en: 'Gas in a piston' },
    controls: [
      { id: 'temperature', label: { de: 'Temperatur', en: 'Temperature' }, unit: 'K', min: 100, max: 600, step: 25, value: 300 },
      { id: 'volume', label: { de: 'Volumen', en: 'Volume' }, unit: 'L', min: 1, max: 10, step: 0.5, value: 5 },
      { id: 'amount', label: { de: 'Stoffmenge', en: 'Amount' }, unit: 'mol', min: 0.1, max: 1, step: 0.1, value: 0.2, fixed: true },
    ],
    outputs: [{ id: 'pressure', label: { de: 'Druck', en: 'Pressure' }, unit: 'kPa', digits: 0 }],
    compute: (v) => ({ pressure: r((v.amount * 8.314 * v.temperature) / v.volume, 0) }),
  },
  lever: {
    title: { de: 'Hebel', en: 'Lever' },
    controls: [
      { id: 'm1', label: { de: 'Masse links', en: 'Left mass' }, unit: 'kg', min: 1, max: 10, step: 1, value: 4 },
      { id: 'd1', label: { de: 'Abstand links', en: 'Left distance' }, unit: 'm', min: 0.5, max: 4, step: 0.5, value: 2 },
      { id: 'm2', label: { de: 'Masse rechts', en: 'Right mass' }, unit: 'kg', min: 1, max: 10, step: 1, value: 2 },
      { id: 'd2', label: { de: 'Abstand rechts', en: 'Right distance' }, unit: 'm', min: 0.5, max: 4, step: 0.5, value: 1 },
    ],
    outputs: [
      { id: 'left', label: { de: 'Drehmoment links', en: 'Left torque' }, unit: 'kg·m', digits: 1 },
      { id: 'right', label: { de: 'Drehmoment rechts', en: 'Right torque' }, unit: 'kg·m', digits: 1 },
    ],
    compute: (v) => ({ left: r(v.m1 * v.d1, 1), right: r(v.m2 * v.d2, 1), tilt: Math.sign(r(v.m2 * v.d2 - v.m1 * v.d1, 6)) }),
  },
  tangent: {
    title: { de: 'Sekante & Tangente', en: 'Secant & tangent' },
    controls: [
      { id: 'x', label: { de: 'Stelle x', en: 'Point x' }, min: -2, max: 2, step: 0.5, value: -1 },
      { id: 'h', label: { de: 'Abstand h', en: 'Gap h' }, min: 0.01, max: 2, step: 0.01, value: 2 },
    ],
    outputs: [
      { id: 'secant', label: { de: 'Steigung der Sekante', en: 'Secant slope' }, digits: 2 },
      { id: 'slope', label: { de: 'Steigung der Tangente', en: 'Tangent slope' }, digits: 2 },
    ],
    compute: (v, p) => {
      const f = fx(p, 'x^2');
      return { secant: r((f(v.x + v.h) - f(v.x)) / v.h, 2), slope: r((f(v.x + 1e-5) - f(v.x - 1e-5)) / 2e-5, 2), y: r(f(v.x), 3) };
    },
  },
  riemann: {
    title: { de: 'Fläche aus Rechtecken', en: 'Area from rectangles' },
    controls: [{ id: 'n', label: { de: 'Rechtecke', en: 'Rectangles' }, min: 1, max: 40, step: 1, value: 2 }],
    outputs: [
      { id: 'sum', label: { de: 'Summe', en: 'Sum' }, digits: 3 },
      { id: 'exact', label: { de: 'Exakt', en: 'Exact' }, digits: 3 },
      { id: 'error', label: { de: 'Fehler', en: 'Error' }, digits: 3 },
    ],
    compute: (v, p) => {
      const f = fx(p, 'x^2');
      const [a, b] = p.interval ?? [0, 2];
      const area = (n: number, mid: boolean) => {
        const w = (b - a) / n;
        let s = 0;
        for (let i = 0; i < n; i++) s += f(a + (i + (mid ? 0.5 : 0)) * w) * w;
        return s;
      };
      const sum = area(v.n, false);
      const exact = area(4000, true);
      return { sum: r(sum, 3), exact: r(exact, 3), error: r(Math.abs(exact - sum), 3) };
    },
  },
  unitcircle: {
    title: { de: 'Einheitskreis', en: 'Unit circle' },
    controls: [{ id: 'angle', label: { de: 'Winkel', en: 'Angle' }, unit: '°', min: 0, max: 360, step: 15, value: 15 }],
    outputs: [
      { id: 'cos', label: { de: 'cos', en: 'cos' }, digits: 2 },
      { id: 'sin', label: { de: 'sin', en: 'sin' }, digits: 2 },
    ],
    compute: (v) => ({ cos: r(Math.cos(rad(v.angle)), 2), sin: r(Math.sin(rad(v.angle)), 2) }),
  },
  neuron: {
    title: { de: 'Ein Neuron', en: 'One neuron' },
    controls: [
      { id: 'w1', label: { de: 'Gewicht w₁', en: 'Weight w₁' }, min: -3, max: 3, step: 0.5, value: 1 },
      { id: 'w2', label: { de: 'Gewicht w₂', en: 'Weight w₂' }, min: -3, max: 3, step: 0.5, value: -1 },
      { id: 'b', label: { de: 'Bias b', en: 'Bias b' }, min: -6, max: 6, step: 0.5, value: 0 },
    ],
    outputs: [
      { id: 'correct', label: { de: 'Richtig getrennt', en: 'Correctly split' }, digits: 0 },
      { id: 'total', label: { de: 'Punkte', en: 'Points' }, digits: 0 },
    ],
    compute: (v, p) => {
      const pts = p.points ?? NEURON_POINTS;
      const ok = pts.filter((q) => (v.w1 * q.x + v.w2 * q.y + v.b > 0) === (q.label === 1)).length;
      return { correct: ok, total: pts.length, errors: pts.length - ok };
    },
  },
  descent: {
    title: { de: 'Gradientenabstieg', en: 'Gradient descent' },
    controls: [
      { id: 'rate', label: { de: 'Lernrate', en: 'Learning rate' }, min: 0.05, max: 1.2, step: 0.05, value: 0.05 },
      { id: 'steps', label: { de: 'Schritte', en: 'Steps' }, min: 0, max: 20, step: 1, value: 3 },
    ],
    outputs: [
      { id: 'x', label: { de: 'Position x', en: 'Position x' }, digits: 2 },
      { id: 'loss', label: { de: 'Fehler (Loss)', en: 'Loss' }, digits: 2 },
    ],
    // f(x) = x², start at x = 4: x ← x − rate · 2x
    compute: (v) => {
      const x = 4 * (1 - 2 * v.rate) ** v.steps;
      return { x: r(x, 2), loss: r(x * x, 2) };
    },
  },
  normal: {
    title: { de: 'Normalverteilung', en: 'Normal distribution' },
    controls: [
      { id: 'mean', label: { de: 'Mittelwert μ', en: 'Mean μ' }, min: 80, max: 120, step: 1, value: 90 },
      { id: 'sd', label: { de: 'Streuung σ', en: 'Spread σ' }, min: 2, max: 30, step: 1, value: 25 },
    ],
    outputs: [{ id: 'share', label: { de: 'Anteil im Bereich', en: 'Share in range' }, unit: '%', digits: 1 }],
    compute: (v, p) => {
      const [a, b] = p.interval ?? [85, 115];
      const cdf = (x: number) => 0.5 * (1 + erf((x - v.mean) / (v.sd * Math.SQRT2)));
      return { share: r(100 * (cdf(b) - cdf(a)), 1) };
    },
  },
  decay: {
    title: { de: 'Zerfall', en: 'Decay' },
    controls: [
      { id: 'halflife', label: { de: 'Halbwertszeit', en: 'Half-life' }, unit: 'h', min: 1, max: 10, step: 1, value: 2 },
      { id: 'time', label: { de: 'Zeit', en: 'Time' }, unit: 'h', min: 0, max: 30, step: 1, value: 0 },
    ],
    outputs: [
      { id: 'left', label: { de: 'Übrig', en: 'Left' }, unit: '%', digits: 1 },
      { id: 'halvings', label: { de: 'Halbierungen', en: 'Halvings' }, digits: 2 },
    ],
    compute: (v) => ({ left: r(100 * 0.5 ** (v.time / v.halflife), 1), halvings: r(v.time / v.halflife, 2) }),
  },
  growth: {
    title: { de: 'Wachstum', en: 'Growth' },
    controls: [
      { id: 'rate', label: { de: 'Zuwachs pro Jahr', en: 'Growth per year' }, unit: '%', min: 0, max: 20, step: 1, value: 2 },
      { id: 'years', label: { de: 'Jahre', en: 'Years' }, min: 0, max: 40, step: 1, value: 5 },
      { id: 'start', label: { de: 'Startwert', en: 'Start value' }, min: 100, max: 10000, step: 100, value: 1000, fixed: true },
    ],
    outputs: [
      { id: 'value', label: { de: 'Exponentiell', en: 'Exponential' }, digits: 0 },
      { id: 'linear', label: { de: 'Linear', en: 'Linear' }, digits: 0 },
      { id: 'factor', label: { de: 'Faktor', en: 'Factor' }, digits: 2 },
    ],
    compute: (v) => {
      const f = (1 + v.rate / 100) ** v.years;
      return { value: r(v.start * f, 0), linear: r(v.start * (1 + (v.rate / 100) * v.years), 0), factor: r(f, 2) };
    },
  },
  lens: {
    title: { de: 'Sammellinse', en: 'Converging lens' },
    controls: [
      { id: 'object', label: { de: 'Gegenstandsweite', en: 'Object distance' }, unit: 'cm', min: 12, max: 60, step: 2, value: 60 },
      { id: 'focal', label: { de: 'Brennweite', en: 'Focal length' }, unit: 'cm', min: 5, max: 20, step: 1, value: 10 },
    ],
    outputs: [
      { id: 'image', label: { de: 'Bildweite', en: 'Image distance' }, unit: 'cm', digits: 1 },
      { id: 'magnification', label: { de: 'Vergrößerung', en: 'Magnification' }, digits: 2 },
    ],
    compute: (v) => {
      const d = v.object - v.focal;
      const img = Math.abs(d) < 1e-9 ? 9999 : (v.object * v.focal) / d;
      return { image: r(img, 1), magnification: r(Math.abs(img / v.object), 2) };
    },
  },
  orbit: {
    title: { de: 'Umlaufbahn', en: 'Orbit' },
    controls: [
      { id: 'radius', label: { de: 'Bahnradius', en: 'Orbit radius' }, unit: 'R', min: 1.5, max: 8, step: 0.5, value: 2 },
      { id: 'speed', label: { de: 'Tempo', en: 'Speed' }, unit: 'km/s', min: 1, max: 9, step: 0.1, value: 3 },
    ],
    outputs: [
      { id: 'circular', label: { de: 'Kreisbahn-Tempo', en: 'Circular speed' }, unit: 'km/s', digits: 1 },
      { id: 'escape', label: { de: 'Fluchttempo', en: 'Escape speed' }, unit: 'km/s', digits: 1 },
      { id: 'ecc', label: { de: 'Exzentrizität', en: 'Eccentricity' }, digits: 2 },
    ],
    // GM_earth = 398600 km³/s², R = 6371 km. Launched sideways at `radius`.
    // kind: −1 falls back to Earth, 0 stays in orbit, 1 escapes. ecc = eccentricity.
    compute: (v) => {
      const vc = Math.sqrt(398600 / (6371 * v.radius));
      const q = (v.speed / vc) ** 2;
      const ecc = Math.abs(q - 1);
      const peri = q < 1 ? (v.radius / (2 - q)) * (1 - ecc) : v.radius;
      const kind = q >= 2 ? 1 : peri < 1 - 1e-9 ? -1 : 0;
      return { circular: r(vc, 1), escape: r(vc * Math.SQRT2, 1), ecc: r(ecc, 2), kind };
    },
  },
};

/** Default data for the neuron scene: two clouds that a line can separate. */
export const NEURON_POINTS: { x: number; y: number; label: 0 | 1 }[] = [
  { x: 1, y: 1, label: 0 }, { x: 2, y: 1.5, label: 0 }, { x: 1.5, y: 2.5, label: 0 }, { x: 2.5, y: 0.5, label: 0 }, { x: 0.5, y: 2, label: 0 },
  { x: 4, y: 4, label: 1 }, { x: 5, y: 3.5, label: 1 }, { x: 3.5, y: 5, label: 1 }, { x: 4.5, y: 5, label: 1 }, { x: 5, y: 4.5, label: 1 },
];

function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const k = 1 / (1 + 0.3275911 * a);
  const y = 1 - ((((1.061405429 * k - 1.453152027) * k + 1.421413741) * k - 0.284496736) * k + 0.254829592) * k * Math.exp(-a * a);
  return s * y;
}

const Override = z.object({ min: z.number().optional(), max: z.number().optional(), step: z.number().positive().optional(), value: z.number().optional(), fixed: z.boolean().optional() }).strict();

const Params = z.object({
  scene: z.string(),
  /** Per-control overrides: range, start value, fixed (hidden) or unlocked. */
  controls: z.record(z.string(), Override).default({}),
  /** Outputs to show (default: all of the scene). */
  show: z.array(z.string()).optional(),
  /** Function of x for tangent/riemann. */
  expr: z.string().optional(),
  /** Interval for riemann (integration bounds) and normal (range). */
  interval: z.tuple([z.number(), z.number()]).optional(),
  /** Data for the neuron scene. */
  points: z.array(z.object({ x: z.number(), y: z.number(), label: z.union([z.literal(0), z.literal(1)]) }).strict()).optional(),
  /** A target drawn into the scene, e.g. { range: 40 } for the projectile. */
  target: z.record(z.string(), z.number()).optional(),
}).strict();

const Range = z.union([z.number(), z.tuple([z.number(), z.number()])]);
/** Each named control/output must equal the number or lie in [lo, hi]. */
const Answer = z.record(z.string(), Range);

export type SimParams = z.infer<typeof Params>;
export type SimAnswer = z.infer<typeof Answer>;
export interface SimState {
  values: Record<string, number>;
  /** Controls the learner has moved (a lab is "answered" once something was tried). */
  touched: boolean;
}
export type SimAction = { type: 'set'; id: string; value: number };

/** The scene's controls with the lesson's overrides applied. */
export function simControls(p: SimParams): SimControl[] {
  const scene = SIM_SCENES[p.scene];
  if (!scene) return [];
  return scene.controls.map((c) => ({ ...c, ...(p.controls[c.id] ?? {}) }));
}

export function simOutputs(p: SimParams): SimOutput[] {
  const scene = SIM_SCENES[p.scene];
  if (!scene) return [];
  return p.show ? scene.outputs.filter((o) => p.show!.includes(o.id)) : scene.outputs;
}

const snap = (v: number, c: SimControl) => r(Math.min(c.max, Math.max(c.min, c.min + Math.round((v - c.min) / c.step) * c.step)), 6);

export function simCompute(p: SimParams, values: Record<string, number>): Record<string, number> {
  const scene = SIM_SCENES[p.scene];
  if (!scene) return {};
  try {
    return scene.compute(values, p);
  } catch {
    return {};
  }
}

function matches(p: SimParams, values: Record<string, number>, a: SimAnswer): boolean {
  const all = { ...values, ...simCompute(p, values) };
  return Object.entries(a).every(([k, want]) => {
    const v = all[k];
    if (v === undefined || !Number.isFinite(v)) return false;
    return Array.isArray(want) ? v >= want[0] - 1e-9 && v <= want[1] + 1e-9 : Math.abs(v - want) < 1e-6;
  });
}

function initValues(p: SimParams): Record<string, number> {
  return Object.fromEntries(simControls(p).map((c) => [c.id, c.fixed ? c.value : snap(c.value, c)]));
}

export const simWidget: WidgetDefinition<SimParams, SimState, SimAction, SimAnswer> = {
  kind: 'sim',
  title: { de: 'Labor', en: 'Lab' },
  params: Params,
  answer: Answer as unknown as z.ZodType<SimAnswer>,
  interactive: true,
  autoHints: true,
  init: (p) => ({ values: initValues(p), touched: false }),
  applyAction(s, a, p) {
    const c = simControls(p).find((x) => x.id === a.id);
    if (a.type !== 'set' || !c || c.fixed || !Number.isFinite(a.value)) return s;
    return { values: { ...s.values, [a.id]: snap(a.value, c) }, touched: true };
  },
  actions(_s, p) {
    const out: SimAction[] = [];
    for (const c of simControls(p)) {
      if (c.fixed) continue;
      const n = Math.round((c.max - c.min) / c.step);
      const stride = Math.max(1, Math.ceil(n / 12));
      for (let k = 0; k <= n; k += stride) out.push({ type: 'set', id: c.id, value: snap(c.min + k * c.step, c) });
    }
    return out;
  },
  isAnswered: (s) => s.touched,
  checkAnswer: (s, a, p) => matches(p, s.values, a),
  diagnose(s, a, p, locale) {
    if (!a) return null;
    const all = { ...s.values, ...simCompute(p, s.values) };
    const scene = SIM_SCENES[p.scene];
    for (const [k, want] of Object.entries(a)) {
      const v = all[k];
      const [lo, hi] = Array.isArray(want) ? want : [want, want];
      if (v >= lo - 1e-9 && v <= hi + 1e-9) continue;
      const def = [...scene.outputs, ...scene.controls].find((o) => o.id === k);
      const name = def ? t(locale, def.label.de, def.label.en) : k;
      return v < lo ? t(locale, `${name} ist noch zu klein (${formatNumber(v, locale)}). Dreh weiter an den Reglern.`, `${name} is still too small (${formatNumber(v, locale)}). Keep adjusting.`) : t(locale, `${name} ist noch zu groß (${formatNumber(v, locale)}). Dreh weiter an den Reglern.`, `${name} is still too large (${formatNumber(v, locale)}). Keep adjusting.`);
    }
    return null;
  },
  /** Grid search over the free controls. */
  solve(p, a) {
    if (!a) return null;
    const free = simControls(p).filter((c) => !c.fixed);
    const base = initValues(p);
    const grids = free.map((c) => {
      const n = Math.round((c.max - c.min) / c.step);
      const stride = Math.max(1, Math.ceil(n / (free.length > 2 ? 24 : 240)));
      const g: number[] = [];
      for (let k = 0; k <= n; k += stride) g.push(snap(c.min + k * c.step, c));
      return g;
    });
    let found: Record<string, number> | null = null;
    const walk = (i: number, cur: Record<string, number>): boolean => {
      if (i === free.length) {
        if (matches(p, cur, a)) found = { ...cur };
        return !!found;
      }
      for (const v of grids[i]) if (walk(i + 1, { ...cur, [free[i].id]: v })) return true;
      return false;
    };
    walk(0, base);
    return found ? { values: found, touched: true } : null;
  },
  scope: (s, p) => ({ ...s.values, ...simCompute(p, s.values), touched: s.touched }),
  describe(s, p, locale) {
    const scene = SIM_SCENES[p.scene];
    if (!scene) return p.scene;
    const out = simCompute(p, s.values);
    const ctl = simControls(p).filter((c) => !c.fixed).map((c) => `${t(locale, c.label.de, c.label.en)} = ${formatNumber(s.values[c.id], locale)}${c.unit ? ` ${c.unit}` : ''}`);
    const res = simOutputs(p).map((o) => `${t(locale, o.label.de, o.label.en)} = ${formatNumber(out[o.id], locale)}${o.unit ? ` ${o.unit}` : ''}`);
    return t(locale, `Labor »${scene.title.de}«. Regler: ${ctl.join(', ')}. Ergebnis: ${res.join(', ')}.`, `Lab "${scene.title.en}". Controls: ${ctl.join(', ')}. Result: ${res.join(', ')}.`);
  },
  validateState(s, p) {
    return simControls(p).flatMap((c) => {
      const v = s.values[c.id];
      return v === undefined || (!c.fixed && (v < c.min - 1e-9 || v > c.max + 1e-9)) ? [`control ${c.id} out of range`] : [];
    });
  },
  lint(p, a, locale) {
    const issues: LintIssue[] = [];
    const scene = SIM_SCENES[p.scene];
    if (!scene) return [{ level: 'error', code: 'sim.scene', message: `Unbekannte Szene »${p.scene}«. Vorhanden: ${Object.keys(SIM_SCENES).join(', ')}.` }];
    const names = new Set([...scene.controls.map((c) => c.id), ...Object.keys(simCompute(p, initValues(p)))]);
    for (const k of Object.keys(p.controls)) if (!scene.controls.some((c) => c.id === k)) issues.push({ level: 'error', code: 'sim.control', message: `Szene ${p.scene} hat keinen Regler »${k}«.` });
    for (const k of Object.keys(a ?? {})) if (!names.has(k)) issues.push({ level: 'error', code: 'sim.answer', message: `Szene ${p.scene} kennt »${k}« nicht.` });
    for (const k of p.show ?? []) if (!scene.outputs.some((o) => o.id === k)) issues.push({ level: 'error', code: 'sim.show', message: `Szene ${p.scene} hat keine Ausgabe »${k}«.` });
    if (p.expr) {
      try {
        parseMath(p.expr, ['x']);
      } catch (e) {
        issues.push({ level: 'error', code: 'sim.expr', message: `expr nicht lesbar: ${(e as Error).message}` });
      }
    }
    for (const c of simControls(p)) if (c.min >= c.max) issues.push({ level: 'error', code: 'sim.range', message: `Regler ${c.id}: min ≥ max.` });
    if (!simControls(p).some((c) => !c.fixed)) issues.push({ level: 'error', code: 'sim.frozen', message: t(locale, 'Alle Regler sind fest.', 'Every control is fixed.') });
    return issues;
  },
};
