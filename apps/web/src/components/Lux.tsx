/**
 * Lux – Lumens Lern-Begleiter und Maskottchen.
 *
 * Lux ist die Einheit dafür, wie viel Licht (Lumen) auf einer Fläche ankommt –
 * Lux bringt das Licht zu dir. Ein kleines, warmes Licht mit Funken auf dem
 * Kopf; Stimmungen über Augen, Mund und Bewegung, alles als SVG.
 */
import { motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';

export type LuxMood = 'idle' | 'think' | 'talk' | 'happy' | 'cheer' | 'oops';

const INK = '#1d1a33';

export function Lux({ mood = 'idle', size = 40, still = false, label = 'Lux', className }: { mood?: LuxMood; size?: number; still?: boolean; label?: string; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (still) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      t = setTimeout(() => {
        setBlink(true);
        t = setTimeout(() => {
          setBlink(false);
          loop();
        }, 130);
      }, 2600 + Math.random() * 2600);
    };
    loop();
    return () => clearTimeout(t);
  }, [still]);

  const happy = mood === 'happy' || mood === 'cheer';
  const body = still
    ? {}
    : mood === 'cheer'
      ? { animate: { y: [0, -7, 0, -3, 0], rotate: [0, -6, 5, 0, 0] }, transition: { duration: 0.9, ease: 'easeOut' as const } }
      : mood === 'happy'
        ? { animate: { y: [0, -4, 0] }, transition: { duration: 0.5, ease: 'easeOut' as const } }
        : mood === 'oops'
          ? { animate: { rotate: [0, -7, 4, -2, 0] }, transition: { duration: 0.7 } }
          : { animate: { y: [0, -1.6, 0] }, transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const } };
  const eyeY = mood === 'think' ? 32.2 : 34;
  const eyeDX = mood === 'think' ? 1.4 : 0;

  return (
    <svg className={`lux ${className ?? ''}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} style={{ overflow: 'visible', flex: 'none' }}>
      <defs>
        <radialGradient id={`${uid}b`} cx="38%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#FFF6CF" />
          <stop offset="34%" stopColor="#FFD45E" />
          <stop offset="100%" stopColor="#FF9A1F" />
        </radialGradient>
        <radialGradient id={`${uid}h`} cx="50%" cy="50%" r="50%">
          <stop offset="55%" stopColor="#FFC24A" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#FFC24A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.circle cx="32" cy="35" r="30" fill={`url(#${uid}h)`} animate={still ? undefined : { opacity: mood === 'think' ? [0.55, 1, 0.55] : [0.75, 1, 0.75] }} transition={{ duration: mood === 'think' ? 1.1 : 2.8, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.g key={mood} style={{ originX: '32px', originY: '40px' }} {...body}>
        {/* Funke auf dem Kopf */}
        <motion.path
          d="M32 3.5 L33.7 9.3 L39.5 11 L33.7 12.7 L32 18.5 L30.3 12.7 L24.5 11 L30.3 9.3 Z"
          fill="#FFC23D"
          style={{ originX: '32px', originY: '11px' }}
          animate={still ? undefined : { scale: happy ? [1, 1.35, 1] : [1, 1.12, 1], rotate: happy ? [0, 45, 0] : [0, 10, 0] }}
          transition={{ duration: happy ? 0.7 : 2.4, repeat: happy ? 0 : Infinity, ease: 'easeInOut' }}
        />
        <circle cx="32" cy="35" r="19" fill={`url(#${uid}b)`} stroke="#E8860F" strokeOpacity="0.35" strokeWidth="0.8" />
        <ellipse cx="24.5" cy="26.5" rx="5.2" ry="3" fill="#fff" opacity="0.5" transform="rotate(-32 24.5 26.5)" />
        <ellipse cx="22.4" cy="40.6" rx="3" ry="1.7" fill="#FF6F4F" opacity="0.26" />
        <ellipse cx="41.6" cy="40.6" rx="3" ry="1.7" fill="#FF6F4F" opacity="0.26" />
        {/* Augen */}
        {happy ? (
          <g fill="none" stroke={INK} strokeWidth="2.3" strokeLinecap="round">
            <path d="M23.2 35 Q25.8 31.4 28.4 35" />
            <path d="M35.6 35 Q38.2 31.4 40.8 35" />
          </g>
        ) : (
          <g fill={INK}>
            <ellipse cx={25.8 + eyeDX} cy={eyeY} rx={mood === 'oops' ? 2.1 : 2.4} ry={blink ? 0.45 : mood === 'oops' ? 2.9 : 3.3} />
            <ellipse cx={38.2 + eyeDX} cy={eyeY} rx={mood === 'oops' ? 2.1 : 2.4} ry={blink ? 0.45 : mood === 'oops' ? 2.9 : 3.3} />
            {!blink && (
              <>
                <circle cx={26.6 + eyeDX} cy={eyeY - 1.4} r="0.85" fill="#fff" />
                <circle cx={39 + eyeDX} cy={eyeY - 1.4} r="0.85" fill="#fff" />
              </>
            )}
          </g>
        )}
        {mood === 'oops' && (
          <g stroke={INK} strokeWidth="1.5" strokeLinecap="round" opacity="0.8">
            <path d="M22.6 29.6 L28 28.4" />
            <path d="M36 28.4 L41.4 29.6" />
          </g>
        )}
        {/* Mund */}
        {mood === 'talk' ? (
          <motion.ellipse cx="32" cy="41.8" rx="2.4" fill={INK} animate={{ ry: [0.7, 2.1, 0.9, 1.8, 0.7] }} transition={{ duration: 0.9, repeat: Infinity }} />
        ) : mood === 'cheer' ? (
          <path d="M26.8 40 Q32 47.5 37.2 40 Z" fill={INK} stroke={INK} strokeWidth="1" strokeLinejoin="round" />
        ) : mood === 'happy' ? (
          <path d="M27.4 40.4 Q32 45.6 36.6 40.4" fill="none" stroke={INK} strokeWidth="2.1" strokeLinecap="round" />
        ) : mood === 'think' ? (
          <path d="M29.6 42.2 L34.6 41.2" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" />
        ) : mood === 'oops' ? (
          <path d="M29 42.6 Q32 40.6 35 42.6" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" />
        ) : (
          <path d="M28.8 41 Q32 43.6 35.2 41" fill="none" stroke={INK} strokeWidth="1.9" strokeLinecap="round" />
        )}
      </motion.g>
      {mood === 'think' && !still && (
        <g fill="#8b86b8">
          {[
            [49, 24, 1.3],
            [53.5, 18.5, 1.8],
            [58.5, 12, 2.4],
          ].map(([x, y, r], i) => (
            <motion.circle key={i} cx={x} cy={y} r={r} animate={{ opacity: [0.15, 1, 0.15] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
          ))}
        </g>
      )}
      {mood === 'cheer' && !still && (
        <g fill="#FFC23D">
          {[
            [8, 18, 0],
            [56, 22, 0.1],
            [12, 52, 0.2],
            [54, 52, 0.05],
          ].map(([x, y, d], i) => (
            <motion.path
              key={i}
              d={`M${x} ${y - 4} L${x + 1.1} ${y - 1.1} L${x + 4} ${y} L${x + 1.1} ${y + 1.1} L${x} ${y + 4} L${x - 1.1} ${y + 1.1} L${x - 4} ${y} L${x - 1.1} ${y - 1.1} Z`}
              style={{ originX: `${x}px`, originY: `${y}px` }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.9, delay: 0.15 + d, ease: 'easeOut' }}
            />
          ))}
        </g>
      )}
    </svg>
  );
}
