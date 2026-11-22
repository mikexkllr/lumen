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

/** SIR epidemic, daily steps for 365 days: share of susceptible, infected and recovered (0–1). Vaccinated people are immune from day 0. */
export function sirSeries(r0: number, vaccinated: number, recovery = 7): { s: number; i: number; r: number }[] {
  const gamma = 1 / recovery;
  const beta = r0 * gamma;
  const v = vaccinated / 100;
  let S = Math.max(0, 1 - v - 0.001);
  let I = 0.001;
  let R = 0;
  const out = [{ s: S, i: I, r: R }];
  for (let d = 0; d < 365; d++) {
    for (let k = 0; k < 4; k++) {
      const inf = beta * S * I * 0.25;
      const rec = gamma * I * 0.25;
      S -= inf;
      I += inf - rec;
      R += rec;
    }
    out.push({ s: S, i: I, r: R });
  }
  return out;
}

/** Logistic growth, one value per generation: N(t+1) = N + r·N·(1 − N/K). */
export function logisticSeries(rate: number, capacity: number, start: number, gens: number): number[] {
  const out = [start];
  let n = start;
  for (let g = 0; g < gens; g++) {
    n = Math.max(0, n + (rate / 100) * n * (1 - n / capacity));
    out.push(n);
  }
  return out;
}

/** Predator–prey (Lotka–Volterra), RK4 in 0.02-year steps over 30 years: [prey, predators]. Equilibrium: prey 40, predators birth/hunt·10. */
export function predatorSeries(birth: number, hunt: number, prey0 = 60, pred0 = 10): [number, number][] {
  const a = birth / 100;
  const b = hunt / 1000;
  const c = 0.4;
  const d = 0.01;
  const f = (x: number, y: number): [number, number] => [a * x - b * x * y, d * x * y - c * y];
  let x = prey0;
  let y = pred0;
  const h = 0.02;
  const out: [number, number][] = [[x, y]];
  for (let k = 0; k < 1500; k++) {
    const k1 = f(x, y);
    const k2 = f(x + (h / 2) * k1[0], y + (h / 2) * k1[1]);
    const k3 = f(x + (h / 2) * k2[0], y + (h / 2) * k2[1]);
    const k4 = f(x + h * k3[0], y + h * k3[1]);
    x = Math.max(1e-6, x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]));
    y = Math.max(1e-6, y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]));
    out.push([x, y]);
  }
  return out;
}

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
      { id: 'period', label: { de: 'Umlaufzeit', en: 'Orbital period' }, unit: 'h', digits: 2 },
    ],
    // GM_earth = 398600 km³/s², R = 6371 km. Launched sideways at `radius`.
    // kind: −1 falls back to Earth, 0 stays in orbit, 1 escapes. ecc = eccentricity.
    compute: (v) => {
      const vc = Math.sqrt(398600 / (6371 * v.radius));
      const q = (v.speed / vc) ** 2;
      const ecc = Math.abs(q - 1);
      const peri = q < 1 ? (v.radius / (2 - q)) * (1 - ecc) : v.radius;
      const kind = q >= 2 ? 1 : peri < 1 - 1e-9 ? -1 : 0;
      // vis-viva: semi-major axis a = 1 / (2/r − v²/GM); period T = 2π·√(a³/GM), infinite when unbound
      const rk = 6371 * v.radius;
      const a = 1 / (2 / rk - (v.speed * v.speed) / 398600);
      const period = a > 0 ? (2 * Math.PI * Math.sqrt(a ** 3 / 398600)) / 3600 : Infinity;
      return { circular: r(vc, 1), escape: r(vc * Math.SQRT2, 1), ecc: r(ecc, 2), kind, period: r(period, 2) };
    },
  },
  arrhenius: {
    title: { de: 'Reaktionstempo', en: 'Reaction rate' },
    controls: [
      { id: 'temperature', label: { de: 'Temperatur', en: 'Temperature' }, unit: '°C', min: 0, max: 200, step: 5, value: 25 },
      { id: 'ea', label: { de: 'Aktivierungsenergie Eₐ', en: 'Activation energy Eₐ' }, unit: 'kJ/mol', min: 10, max: 150, step: 5, value: 50 },
      { id: 'catalyst', label: { de: 'Katalysator senkt Eₐ um', en: 'Catalyst lowers Eₐ by' }, unit: 'kJ/mol', min: 0, max: 60, step: 5, value: 0, fixed: true },
    ],
    outputs: [
      { id: 'factor', label: { de: 'Tempo im Vergleich zu 25 °C', en: 'Rate compared with 25 °C' }, unit: '×', digits: 1 },
      { id: 'eaeff', label: { de: 'Wirksame Eₐ', en: 'Effective Eₐ' }, unit: 'kJ/mol', digits: 0 },
    ],
    // Arrhenius: k ∝ exp(−Eₐ/RT); compared with the uncatalysed reaction at 25 °C
    compute: (v) => {
      const R = 8.314e-3;
      const T = v.temperature + 273.15;
      const eaeff = Math.max(1, v.ea - v.catalyst);
      const factor = Math.exp(-eaeff / (R * T) + v.ea / (R * 298.15));
      return { factor: r(Math.min(factor, 1e12), 1), eaeff: r(eaeff, 0) };
    },
  },
  // ---------- Biologie ----------
  population: {
    title: { de: 'Population', en: 'Population' },
    controls: [
      { id: 'rate', label: { de: 'Vermehrung pro Generation', en: 'Growth per generation' }, unit: '%', min: 0, max: 100, step: 5, value: 30 },
      { id: 'capacity', label: { de: 'Kapazität', en: 'Carrying capacity' }, min: 100, max: 1000, step: 50, value: 500 },
      { id: 'gens', label: { de: 'Generationen', en: 'Generations' }, min: 0, max: 40, step: 1, value: 10 },
      { id: 'start', label: { de: 'Startbestand', en: 'Start size' }, min: 2, max: 100, step: 1, value: 10, fixed: true },
    ],
    outputs: [
      { id: 'size', label: { de: 'Bestand', en: 'Population' }, digits: 0 },
      { id: 'unlimited', label: { de: 'Ohne Grenze', en: 'Unlimited' }, digits: 0 },
      { id: 'share', label: { de: 'Anteil an K', en: 'Share of K' }, unit: '%', digits: 0 },
    ],
    compute: (v) => {
      const n = logisticSeries(v.rate, v.capacity, v.start, v.gens).at(-1)!;
      return { size: r(n, 0), unlimited: r(Math.min(1e9, v.start * (1 + v.rate / 100) ** v.gens), 0), share: r((100 * n) / v.capacity, 0) };
    },
  },
  epidemic: {
    title: { de: 'Epidemie', en: 'Epidemic' },
    controls: [
      { id: 'r0', label: { de: 'Basisreproduktionszahl R₀', en: 'Basic reproduction number R₀' }, min: 0.5, max: 6, step: 0.1, value: 2.5 },
      { id: 'vaccinated', label: { de: 'Geimpft', en: 'Vaccinated' }, unit: '%', min: 0, max: 95, step: 5, value: 0 },
      { id: 'recovery', label: { de: 'Krankheitsdauer', en: 'Days infectious' }, unit: 'd', min: 3, max: 14, step: 1, value: 7, fixed: true },
    ],
    outputs: [
      { id: 'peak', label: { de: 'Höchstens gleichzeitig krank', en: 'Peak infected' }, unit: '%', digits: 1 },
      { id: 'total', label: { de: 'Insgesamt angesteckt', en: 'Ever infected' }, unit: '%', digits: 0 },
      { id: 'herd', label: { de: 'Herdenschutz ab', en: 'Herd immunity at' }, unit: '%', digits: 0 },
      { id: 'reff', label: { de: 'R zu Beginn', en: 'R at the start' }, digits: 2 },
    ],
    compute: (v) => {
      const series = sirSeries(v.r0, v.vaccinated, v.recovery);
      const peak = Math.max(...series.map((x) => x.i));
      const end = series.at(-1)!;
      return { peak: r(100 * peak, 1), total: r(100 * (end.r + end.i), 0), herd: r(Math.max(0, 100 * (1 - 1 / v.r0)), 0), reff: r(v.r0 * (1 - v.vaccinated / 100), 2) };
    },
  },
  hardy: {
    title: { de: 'Hardy-Weinberg', en: 'Hardy–Weinberg' },
    controls: [{ id: 'p', label: { de: 'Anteil Allel A (p)', en: 'Share of allele A (p)' }, min: 0, max: 1, step: 0.05, value: 0.5 }],
    outputs: [
      { id: 'AA', label: { de: 'AA (p²)', en: 'AA (p²)' }, unit: '%', digits: 1 },
      { id: 'Aa', label: { de: 'Aa (2pq)', en: 'Aa (2pq)' }, unit: '%', digits: 1 },
      { id: 'aa', label: { de: 'aa (q²)', en: 'aa (q²)' }, unit: '%', digits: 1 },
    ],
    compute: (v) => {
      const q = 1 - v.p;
      return { q: r(q, 2), AA: r(100 * v.p * v.p, 1), Aa: r(200 * v.p * q, 1), aa: r(100 * q * q, 1) };
    },
  },
  enzyme: {
    title: { de: 'Enzym-Kinetik', en: 'Enzyme kinetics' },
    controls: [
      { id: 'substrate', label: { de: 'Substrat [S]', en: 'Substrate [S]' }, unit: 'mM', min: 0, max: 50, step: 1, value: 5 },
      { id: 'km', label: { de: 'Michaelis-Konstante Kₘ', en: 'Michaelis constant Kₘ' }, unit: 'mM', min: 1, max: 20, step: 1, value: 5 },
      { id: 'inhibitor', label: { de: 'Kompetitiver Hemmstoff', en: 'Competitive inhibitor' }, unit: '×Kₘ', min: 1, max: 5, step: 0.5, value: 1, fixed: true },
      { id: 'vmax', label: { de: 'vₘₐₓ', en: 'vₘₐₓ' }, unit: '%', min: 10, max: 100, step: 10, value: 100, fixed: true },
    ],
    outputs: [
      { id: 'rate', label: { de: 'Reaktionstempo', en: 'Reaction rate' }, unit: '% vₘₐₓ', digits: 0 },
      { id: 'kmeff', label: { de: 'Wirksames Kₘ', en: 'Apparent Kₘ' }, unit: 'mM', digits: 1 },
    ],
    compute: (v) => {
      const km = v.km * v.inhibitor;
      return { rate: r((v.vmax * v.substrate) / (km + v.substrate), 0), kmeff: r(km, 1) };
    },
  },
  predator: {
    title: { de: 'Räuber und Beute', en: 'Predator and prey' },
    controls: [
      { id: 'birth', label: { de: 'Vermehrung der Beute', en: 'Prey growth' }, unit: '%/a', min: 20, max: 100, step: 5, value: 60 },
      { id: 'hunt', label: { de: 'Jagderfolg', en: 'Hunting success' }, unit: '‰', min: 5, max: 40, step: 1, value: 20 },
    ],
    outputs: [
      { id: 'preymax', label: { de: 'Beute höchstens', en: 'Prey at most' }, digits: 0 },
      { id: 'predmax', label: { de: 'Räuber höchstens', en: 'Predators at most' }, digits: 0 },
      { id: 'preymean', label: { de: 'Beute im Mittel', en: 'Prey on average' }, digits: 0 },
      { id: 'predmean', label: { de: 'Räuber im Mittel', en: 'Predators on average' }, digits: 0 },
    ],
    compute: (v) => {
      const s = predatorSeries(v.birth, v.hunt);
      return { preymax: r(Math.max(...s.map((x) => x[0])), 0), predmax: r(Math.max(...s.map((x) => x[1])), 0), preymean: r(s.reduce((a, x) => a + x[0], 0) / s.length, 0), predmean: r(s.reduce((a, x) => a + x[1], 0) / s.length, 0) };
    },
  },
  // ---------- Elektrotechnik ----------
  rc: {
    title: { de: 'Kondensator laden', en: 'Charging a capacitor' },
    controls: [
      { id: 'resistance', label: { de: 'Widerstand R', en: 'Resistance R' }, unit: 'kΩ', min: 1, max: 100, step: 1, value: 10 },
      { id: 'capacitance', label: { de: 'Kapazität C', en: 'Capacitance C' }, unit: 'µF', min: 1, max: 100, step: 1, value: 10 },
      { id: 'time', label: { de: 'Zeit t', en: 'Time t' }, unit: 'ms', min: 0, max: 2000, step: 10, value: 100 },
      { id: 'voltage', label: { de: 'Quellspannung', en: 'Source voltage' }, unit: 'V', min: 1, max: 24, step: 1, value: 10, fixed: true },
    ],
    outputs: [
      { id: 'tau', label: { de: 'Zeitkonstante τ = R·C', en: 'Time constant τ = R·C' }, unit: 'ms', digits: 0 },
      { id: 'charge', label: { de: 'Ladezustand', en: 'Charge level' }, unit: '%', digits: 1 },
      { id: 'uc', label: { de: 'Spannung am C', en: 'Capacitor voltage' }, unit: 'V', digits: 2 },
    ],
    compute: (v) => {
      const tau = v.resistance * v.capacitance; // kΩ · µF = ms
      const q = 1 - Math.exp(-v.time / tau);
      return { tau: r(tau, 0), charge: r(100 * q, 1), uc: r(v.voltage * q, 2), taus: r(v.time / tau, 2) };
    },
  },
  divider: {
    title: { de: 'Spannungsteiler', en: 'Voltage divider' },
    controls: [
      { id: 'voltage', label: { de: 'Eingangsspannung', en: 'Input voltage' }, unit: 'V', min: 1, max: 24, step: 1, value: 12 },
      { id: 'r1', label: { de: 'R₁ (oben)', en: 'R₁ (top)' }, unit: 'kΩ', min: 1, max: 20, step: 1, value: 10 },
      { id: 'r2', label: { de: 'R₂ (unten)', en: 'R₂ (bottom)' }, unit: 'kΩ', min: 1, max: 20, step: 1, value: 10 },
      { id: 'load', label: { de: 'Last am Ausgang', en: 'Load at the output' }, unit: 'kΩ', min: 1, max: 1000000, step: 1, value: 1000000, fixed: true },
    ],
    outputs: [
      { id: 'out', label: { de: 'Ausgangsspannung', en: 'Output voltage' }, unit: 'V', digits: 2 },
      { id: 'current', label: { de: 'Querstrom', en: 'Divider current' }, unit: 'mA', digits: 2 },
      { id: 'ratio', label: { de: 'Teilerverhältnis', en: 'Divider ratio' }, digits: 2 },
    ],
    compute: (v) => {
      const r2 = (v.r2 * v.load) / (v.r2 + v.load);
      const ratio = r2 / (v.r1 + r2);
      return { out: r(v.voltage * ratio, 2), current: r(v.voltage / (v.r1 + r2), 2), ratio: r(ratio, 2) };
    },
  },
  lowpass: {
    title: { de: 'RC-Tiefpass', en: 'RC low-pass filter' },
    controls: [
      { id: 'resistance', label: { de: 'Widerstand R', en: 'Resistance R' }, unit: 'kΩ', min: 1, max: 20, step: 1, value: 10 },
      { id: 'capacitance', label: { de: 'Kapazität C', en: 'Capacitance C' }, unit: 'nF', min: 1, max: 100, step: 1, value: 16 },
      { id: 'frequency', label: { de: 'Signalfrequenz', en: 'Signal frequency' }, unit: 'Hz', min: 10, max: 10000, step: 10, value: 100 },
    ],
    outputs: [
      { id: 'cutoff', label: { de: 'Grenzfrequenz', en: 'Cut-off frequency' }, unit: 'Hz', digits: 0 },
      { id: 'gain', label: { de: 'Durchgelassen', en: 'Passed through' }, unit: '%', digits: 1 },
      { id: 'db', label: { de: 'Dämpfung', en: 'Gain' }, unit: 'dB', digits: 1 },
    ],
    compute: (v) => {
      const cutoff = 1 / (2 * Math.PI * v.resistance * 1e3 * v.capacitance * 1e-9);
      const g = 1 / Math.sqrt(1 + (v.frequency / cutoff) ** 2);
      return { cutoff: r(cutoff, 0), gain: r(100 * g, 1), db: r(20 * Math.log10(g), 1) };
    },
  },
  resonance: {
    title: { de: 'Schwingkreis', en: 'LC resonance' },
    controls: [
      { id: 'inductance', label: { de: 'Induktivität L', en: 'Inductance L' }, unit: 'mH', min: 1, max: 100, step: 1, value: 10 },
      { id: 'capacitance', label: { de: 'Kapazität C', en: 'Capacitance C' }, unit: 'µF', min: 1, max: 100, step: 1, value: 10 },
    ],
    outputs: [
      { id: 'f0', label: { de: 'Resonanzfrequenz', en: 'Resonant frequency' }, unit: 'Hz', digits: 0 },
      { id: 'period', label: { de: 'Periode', en: 'Period' }, unit: 'ms', digits: 2 },
    ],
    compute: (v) => {
      const f0 = 1 / (2 * Math.PI * Math.sqrt(v.inductance * 1e-3 * v.capacitance * 1e-6));
      return { f0: r(f0, 0), period: r(1000 / f0, 2) };
    },
  },
  transformer: {
    title: { de: 'Transformator', en: 'Transformer' },
    controls: [
      { id: 'n1', label: { de: 'Windungen primär', en: 'Primary turns' }, min: 50, max: 2000, step: 50, value: 1000 },
      { id: 'n2', label: { de: 'Windungen sekundär', en: 'Secondary turns' }, min: 10, max: 2000, step: 10, value: 100 },
      { id: 'u1', label: { de: 'Primärspannung', en: 'Primary voltage' }, unit: 'V', min: 10, max: 400, step: 10, value: 230, fixed: true },
      { id: 'i2', label: { de: 'Strom sekundär', en: 'Secondary current' }, unit: 'A', min: 0.1, max: 10, step: 0.1, value: 1, fixed: true },
    ],
    outputs: [
      { id: 'u2', label: { de: 'Sekundärspannung', en: 'Secondary voltage' }, unit: 'V', digits: 1 },
      { id: 'i1', label: { de: 'Strom primär', en: 'Primary current' }, unit: 'A', digits: 3 },
      { id: 'ratio', label: { de: 'Übersetzung n₁ : n₂', en: 'Turns ratio n₁ : n₂' }, digits: 2 },
    ],
    compute: (v) => ({ u2: r((v.u1 * v.n2) / v.n1, 1), i1: r((v.i2 * v.n2) / v.n1, 3), ratio: r(v.n1 / v.n2, 2) }),
  },
  sampling: {
    title: { de: 'Abtasten', en: 'Sampling' },
    controls: [
      { id: 'signal', label: { de: 'Signalfrequenz', en: 'Signal frequency' }, unit: 'Hz', min: 1, max: 20, step: 1, value: 3 },
      { id: 'rate', label: { de: 'Abtastrate', en: 'Sample rate' }, unit: 'Hz', min: 2, max: 50, step: 1, value: 20 },
    ],
    outputs: [
      { id: 'nyquist', label: { de: 'Nyquist-Grenze', en: 'Nyquist limit' }, unit: 'Hz', digits: 1 },
      { id: 'seen', label: { de: 'Gemessene Frequenz', en: 'Frequency you see' }, unit: 'Hz', digits: 1 },
      { id: 'aliased', label: { de: 'Aliasing (1 = ja)', en: 'Aliasing (1 = yes)' }, digits: 0 },
    ],
    compute: (v) => {
      const k = Math.round(v.signal / v.rate);
      const seen = Math.abs(v.signal - k * v.rate);
      return { nyquist: r(v.rate / 2, 1), seen: r(seen, 1), aliased: v.signal > v.rate / 2 ? 1 : 0 };
    },
  },
  // ---------- Physik ----------
  spring: {
    title: { de: 'Federpendel', en: 'Mass on a spring' },
    controls: [
      { id: 'mass', label: { de: 'Masse', en: 'Mass' }, unit: 'kg', min: 0.1, max: 5, step: 0.1, value: 1 },
      { id: 'stiffness', label: { de: 'Federhärte D', en: 'Spring constant k' }, unit: 'N/m', min: 1, max: 100, step: 1, value: 10 },
      { id: 'amplitude', label: { de: 'Auslenkung', en: 'Amplitude' }, unit: 'cm', min: 1, max: 20, step: 1, value: 10, fixed: true },
    ],
    outputs: [
      { id: 'period', label: { de: 'Periode', en: 'Period' }, unit: 's', digits: 2 },
      { id: 'frequency', label: { de: 'Frequenz', en: 'Frequency' }, unit: 'Hz', digits: 2 },
      { id: 'energy', label: { de: 'Schwingungsenergie', en: 'Energy' }, unit: 'J', digits: 3 },
    ],
    compute: (v) => {
      const T = 2 * Math.PI * Math.sqrt(v.mass / v.stiffness);
      return { period: r(T, 2), frequency: r(1 / T, 2), energy: r(0.5 * v.stiffness * (v.amplitude / 100) ** 2, 3) };
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
