/** Tiny synthesized sounds (no audio files, no network). */
let ctx: AudioContext | null = null;

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.12) {
  if (!ctx) ctx = new AudioContext();
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

const semis = (base: number, n: number) => base * 2 ** (n / 12);

export const sounds = {
  /** Rises a semitone with every answer of a combo (capped). */
  correct(combo = 0) {
    const k = Math.min(combo, 10);
    tone(semis(660, k), 0, 0.16);
    tone(semis(880, k), 0.08, 0.26);
  },
  wrong() { tone(220, 0, 0.2, 'triangle', 0.07); },
  streak() { [0, 4, 7, 12].forEach((s, i) => tone(semis(880, s), i * 0.05, 0.22, 'sine', 0.06)); },
  complete() { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.35, 'sine', 0.1)); },
  levelUp() { [523, 659, 784, 1047, 1319].forEach((f, i) => { tone(f, i * 0.07, 0.4, 'triangle', 0.07); tone(f * 2, i * 0.07 + 0.02, 0.25, 'sine', 0.03); }); },
  achievement() { tone(1175, 0, 0.18, 'sine', 0.08); tone(1568, 0.1, 0.4, 'sine', 0.08); },
  reveal() { tone(740, 0, 0.12, 'sine', 0.06); tone(988, 0.06, 0.2, 'sine', 0.06); },
  tap() { tone(1200, 0, 0.04, 'sine', 0.03); },
};

type SoundName = keyof typeof sounds;

export function play(enabled: boolean, name: SoundName, arg?: number) {
  if (!enabled) return;
  try {
    (sounds[name] as (n?: number) => void)(arg);
  } catch {
    /* audio not available */
  }
}

export function vibrate(enabled: boolean, pattern: number | number[]) {
  if (enabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}
