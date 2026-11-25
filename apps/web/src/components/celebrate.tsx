/**
 * Small rewards that make right answers feel good: a particle burst, a glow, a streak banner.
 * All of them are decorative (aria-hidden) and switch off with reduced motion.
 */
import { useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { mix } from './art.tsx';

const GOLD = ['#f59e0b', '#fcd34d', '#fbbf24'];

/** Particles flying out of a point (in % of the parent box). `power` grows with the streak. */
export function Burst({ color = '#5145f0', power = 1, x = '50%', y = '50%', seed = 0 }: { color?: string; power?: number; x?: string; y?: string; seed?: number }) {
  const parts = useMemo(() => {
    const n = Math.round(14 + Math.min(power, 4) * 6);
    const colors = [color, mix(color, '#ffffff', 0.45), ...GOLD];
    let r = (seed * 9301 + 49297) % 233280;
    const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: n }, (_v, i) => {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.5;
      const d = 60 + rnd() * (70 + power * 30);
      return { dx: Math.cos(a) * d, dy: Math.sin(a) * d * 0.8 - 20, s: 5 + rnd() * 6, c: colors[i % colors.length], star: i % 3 === 0, rot: (rnd() - 0.5) * 360, delay: rnd() * 0.06 };
    });
  }, [color, power, seed]);
  return (
    <div className="burst" style={{ left: x, top: y }} aria-hidden="true">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className={p.star ? 'star' : 'dot'}
          style={{ width: p.s, height: p.s, background: p.star ? 'none' : p.c, color: p.c }}
          initial={{ x: 0, y: 0, scale: 0.4, opacity: 1, rotate: 0 }}
          animate={{ x: p.dx, y: [0, p.dy, p.dy + 40], scale: [0.4, 1.15, 0.6], opacity: [1, 1, 0], rotate: p.rot }}
          transition={{ duration: 0.85, delay: p.delay, ease: [0.2, 0.8, 0.3, 1] }}
        >
          {p.star ? '✦' : null}
        </motion.span>
      ))}
    </div>
  );
}

/** Big pill that springs in for streak milestones (3, 5, 10, …). */
export function StreakBanner({ n, label }: { n: number | null; label: string }) {
  return (
    <AnimatePresence>
      {n !== null && (
        <motion.div
          key={n}
          className={`streak-banner heat${n >= 10 ? 3 : n >= 5 ? 2 : 1}`}
          initial={{ opacity: 0, scale: 0.5, y: -10 }}
          animate={{ opacity: 1, scale: [0.5, 1.12, 1], y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -16, transition: { duration: 0.25 } }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          aria-hidden="true"
        >
          <span className="fire">🔥</span> {label}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Soft coloured glow that washes over the screen from the bottom and fades. */
export function Glow({ on, tone = 'ok' }: { on: boolean; tone?: 'ok' | 'topic' }) {
  return (
    <AnimatePresence>
      {on && (
        <motion.div key="glow" className={`answer-glow ${tone}`} initial={{ opacity: 0 }} animate={{ opacity: [0, 1, 0] }} exit={{ opacity: 0 }} transition={{ duration: 0.9, ease: 'easeOut' }} aria-hidden="true" />
      )}
    </AnimatePresence>
  );
}
