/**
 * Lux – Lumens Lern-Begleiter und Maskottchen.
 *
 * Lux ist die Einheit dafür, wie viel Licht (Lumen) auf einer Fläche ankommt – und hier ein
 * kleiner Roboter, der das Licht zu dir bringt: runder Kopf mit Bildschirm-Gesicht, leuchtende
 * Augen, eine Glühbirne als Antenne und ein Brustlicht. Stimmungen über Augen, Mund, Arme und
 * Bewegung, alles als SVG (das App-Icon zeigt denselben Lux, apps/mobile/assets/icon-ios.svg).
 */
import { motion } from 'motion/react';
import { useEffect, useId, useState } from 'react';

export type LuxMood = 'idle' | 'think' | 'talk' | 'happy' | 'cheer' | 'oops' | 'wave' | 'party' | 'love' | 'wow' | 'sleepy';

const GLOW = '#FFE27A';
const BULB = '#FFC93D';
const PURPLE = '#6C5CE7';

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

  const happy = mood === 'happy' || mood === 'cheer' || mood === 'party' || mood === 'wave';
  const body = still
    ? {}
    : mood === 'party'
      ? { animate: { y: [0, -9, 0, -5, 0], rotate: [0, -6, 6, -3, 0], scaleY: [1, 1.05, 0.95, 1.03, 1] }, transition: { duration: 1.05, repeat: Infinity, repeatDelay: 0.3, ease: 'easeOut' as const } }
      : mood === 'cheer'
        ? { animate: { y: [0, -7, 0, -3, 0], rotate: [0, -5, 4, 0, 0] }, transition: { duration: 0.9, ease: 'easeOut' as const } }
        : mood === 'happy' || mood === 'love'
          ? { animate: { y: [0, -4, 0] }, transition: { duration: 0.5, ease: 'easeOut' as const } }
          : mood === 'wow'
            ? { animate: { y: [0, -6, 0], scale: [1, 1.07, 1] }, transition: { duration: 0.45, ease: 'easeOut' as const } }
            : mood === 'wave'
              ? { animate: { rotate: [0, -3, 2, -2, 0] }, transition: { duration: 1.6, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' as const } }
              : mood === 'oops'
                ? { animate: { rotate: [0, -7, 4, -2, 0] }, transition: { duration: 0.7 } }
                : mood === 'sleepy'
                  ? { animate: { y: [0, 1.4, 0], rotate: [0, 2.5, 0] }, transition: { duration: 4.2, repeat: Infinity, ease: 'easeInOut' as const } }
                  : { animate: { y: [0, -1.6, 0] }, transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' as const } };
  // eyes look up and to the side while thinking
  const ex = mood === 'think' ? 1.4 : 0;
  const ey = mood === 'think' ? -1.2 : 0;
  const armUp = mood === 'cheer' || mood === 'party';
  // arms hang at the sides; when cheering they go up in front of the head, when waving one of them swings
  const arms = [-1, 1].map((side) => {
    const ox = side < 0 ? 21 : 43;
    const waving = mood === 'wave' && side > 0;
    return (
      <rect key={side} x={ox - 2.5} y="45.5" width="5" height="9.5" rx="2.5" fill={PURPLE} transform={`rotate(${armUp ? side * -125 : waving ? -138 : side * -40} ${ox} 47)`}>
        {waving && !still && <animateTransform attributeName="transform" type="rotate" values={`-150 ${ox} 47; -112 ${ox} 47; -150 ${ox} 47`} dur="0.55s" repeatCount="indefinite" />}
        {mood === 'party' && !still && <animateTransform attributeName="transform" type="rotate" values={`${side * -135} ${ox} 47; ${side * -108} ${ox} 47; ${side * -135} ${ox} 47`} dur="0.42s" repeatCount="indefinite" />}
      </rect>
    );
  });
  const pulse = still ? undefined : { opacity: mood === 'think' ? [0.5, 1, 0.5] : mood === 'sleepy' ? [0.35, 0.6, 0.35] : [0.8, 1, 0.8] };
  const heart = (cx: number, cy: number, r: number) => `M${cx} ${cy + r} C${cx - r * 2.1} ${cy - r * 0.4} ${cx - r * 0.7} ${cy - r * 1.7} ${cx} ${cy - r * 0.5} C${cx + r * 0.7} ${cy - r * 1.7} ${cx + r * 2.1} ${cy - r * 0.4} ${cx} ${cy + r} Z`;

  return (
    <svg className={`lux ${className ?? ''}`} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={label} style={{ overflow: 'visible', flex: 'none' }}>
      <defs>
        <linearGradient id={`${uid}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E3DEFA" />
        </linearGradient>
        <linearGradient id={`${uid}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2E2869" />
          <stop offset="1" stopColor="#16133A" />
        </linearGradient>
        <radialGradient id={`${uid}h`} cx="50%" cy="50%" r="50%">
          <stop offset="40%" stopColor="#FFC24A" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#FFC24A" stopOpacity="0" />
        </radialGradient>
      </defs>
      <motion.circle cx="32" cy="32" r="30" fill={`url(#${uid}h)`} animate={pulse} transition={{ duration: mood === 'think' ? 1.1 : 2.8, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.g key={mood} style={{ originX: '32px', originY: '44px' }} {...body}>
        {!armUp && (mood === 'wave' ? arms[0] : arms)}
        {/* body with chest light */}
        <rect x="21" y="43" width="22" height="14" rx="6.5" fill={`url(#${uid}s)`} stroke="#C9C2F0" strokeWidth="0.9" />
        <motion.circle cx="32" cy="50.6" r="2.4" fill={BULB} animate={pulse} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }} />
        {/* antenna with a light bulb */}
        <line x1="32" y1="13" x2="32" y2="7.6" stroke="#9A90DE" strokeWidth="1.8" strokeLinecap="round" />
        <motion.g style={{ originX: '32px', originY: '6px' }} animate={still ? undefined : { scale: happy ? [1, 1.3, 1] : [1, 1.08, 1] }} transition={{ duration: happy ? 0.6 : 2.4, repeat: happy ? 0 : Infinity, ease: 'easeInOut' }}>
          <circle cx="32" cy="6" r="5.4" fill={BULB} opacity="0.25" />
          <circle cx="32" cy="6" r="3.2" fill={BULB} />
          <circle cx="31" cy="5" r="1" fill="#fff" opacity="0.8" />
        </motion.g>
        {/* ears */}
        <rect x="9.4" y="23" width="5" height="11" rx="2.5" fill={PURPLE} />
        <rect x="49.6" y="23" width="5" height="11" rx="2.5" fill={PURPLE} />
        {/* head and face screen */}
        <rect x="12" y="12.5" width="40" height="32" rx="14" fill={`url(#${uid}s)`} stroke="#C9C2F0" strokeWidth="0.9" />
        <rect x="17" y="18" width="30" height="21" rx="9" fill={`url(#${uid}f)`} />
        <path d="M21 21.4 Q24 19.6 28 19.8" fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.4" strokeLinecap="round" />
        <ellipse cx="21.4" cy="33.4" rx="2.3" ry="1.3" fill="#FF8FB3" opacity="0.55" />
        <ellipse cx="42.6" cy="33.4" rx="2.3" ry="1.3" fill="#FF8FB3" opacity="0.55" />
        {armUp ? arms : mood === 'wave' ? arms[1] : null}
        {/* eyes */}
        {mood === 'love' ? (
          <g fill="#FF7AA8">
            <path d={heart(25, 26.8, 2.5)} />
            <path d={heart(39, 26.8, 2.5)} />
          </g>
        ) : mood === 'wow' ? (
          <g fill={GLOW}>
            <circle cx="25" cy="26.6" r="3.5" />
            <circle cx="39" cy="26.6" r="3.5" />
            <circle cx="26.2" cy="25.3" r="1.1" fill="#fff" />
            <circle cx="40.2" cy="25.3" r="1.1" fill="#fff" />
          </g>
        ) : mood === 'sleepy' ? (
          <g fill="none" stroke={GLOW} strokeWidth="2" strokeLinecap="round">
            <path d="M22.6 27 Q25 29.4 27.4 27" />
            <path d="M36.6 27 Q39 29.4 41.4 27" />
          </g>
        ) : happy ? (
          <g fill="none" stroke={GLOW} strokeWidth="2.4" strokeLinecap="round">
            <path d="M22.4 29.2 Q25 25 27.6 29.2" />
            <path d="M36.4 29.2 Q39 25 41.6 29.2" />
          </g>
        ) : mood === 'oops' ? (
          <g fill="none" stroke={GLOW} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 25.2 L27 27.6 L23 30" />
            <path d="M41 25.2 L37 27.6 L41 30" />
          </g>
        ) : (
          <g fill={GLOW}>
            <rect x={22.4 + ex} y={blink ? 26.6 + ey : 23.6 + ey} width="5.2" height={blink ? 1.4 : mood === 'think' ? 6.4 : 7.4} rx={blink ? 0.7 : 2.6} />
            <rect x={36.4 + ex} y={blink ? 26.6 + ey : 23.6 + ey} width="5.2" height={blink ? 1.4 : mood === 'think' ? 6.4 : 7.4} rx={blink ? 0.7 : 2.6} />
            {!blink && (
              <>
                <circle cx={26 + ex} cy={25.6 + ey} r="0.95" fill="#fff" />
                <circle cx={40 + ex} cy={25.6 + ey} r="0.95" fill="#fff" />
              </>
            )}
          </g>
        )}
        {/* mouth */}
        {mood === 'talk' ? (
          <motion.ellipse cx="32" cy="34.6" rx="2.2" fill={GLOW} animate={{ ry: [0.6, 1.8, 0.8, 1.6, 0.6] }} transition={{ duration: 0.9, repeat: Infinity }} />
        ) : mood === 'cheer' || mood === 'party' ? (
          <path d="M28.2 33 Q32 38.6 35.8 33 Z" fill={GLOW} stroke={GLOW} strokeWidth="0.8" strokeLinejoin="round" />
        ) : mood === 'wow' ? (
          <ellipse cx="32" cy="34.8" rx="1.9" ry="2.3" fill={GLOW} />
        ) : mood === 'sleepy' ? (
          <ellipse cx="32" cy="35" rx="1.3" ry="1" fill={GLOW} opacity="0.8" />
        ) : mood === 'happy' || mood === 'love' || mood === 'wave' ? (
          <path d="M28.6 33.4 Q32 37 35.4 33.4" fill="none" stroke={GLOW} strokeWidth="1.8" strokeLinecap="round" />
        ) : mood === 'think' ? (
          <path d="M30.2 35 L34.2 34.2" fill="none" stroke={GLOW} strokeWidth="1.6" strokeLinecap="round" />
        ) : mood === 'oops' ? (
          <path d="M29.4 35.4 Q32 33.6 34.6 35.4" fill="none" stroke={GLOW} strokeWidth="1.6" strokeLinecap="round" />
        ) : (
          <path d="M29.4 34 Q32 36 34.6 34" fill="none" stroke={GLOW} strokeWidth="1.6" strokeLinecap="round" />
        )}
      </motion.g>
      {mood === 'think' && !still && (
        <g fill="#8b86b8">
          {[
            [52, 17, 1.3],
            [56, 11.5, 1.8],
            [60.5, 5.5, 2.4],
          ].map(([x, y, r], i) => (
            <motion.circle key={i} cx={x} cy={y} r={r} animate={{ opacity: [0.15, 1, 0.15] }} transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }} />
          ))}
        </g>
      )}
      {mood === 'sleepy' && !still && (
        <g fill="#8b86b8" fontFamily="inherit" fontWeight="800">
          {[
            [50, 16, 6, 0],
            [55.5, 10, 8, 0.5],
            [61, 3, 10, 1],
          ].map(([x, y, fs, d], i) => (
            <motion.text key={i} x={x} y={y} fontSize={fs} animate={{ opacity: [0, 1, 0], y: [y + 2, y - 2] }} transition={{ duration: 2.4, repeat: Infinity, delay: d }}>z</motion.text>
          ))}
        </g>
      )}
      {mood === 'love' && !still && (
        <g fill="#FF7AA8">
          {[
            [9, 14, 2.2, 0],
            [56, 10, 2.8, 0.25],
            [52, 24, 1.8, 0.5],
          ].map(([x, y, r, d], i) => (
            <motion.path key={i} d={heart(x, y, r)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: [0, 1, 0], y: [6, -6] }} transition={{ duration: 1.5, repeat: Infinity, delay: d, ease: 'easeOut' }} />
          ))}
        </g>
      )}
      {mood === 'party' && !still && (
        <g>
          {[
            [5, 20, '#FF7AA8', 0],
            [59, 16, BULB, 0.15],
            [3, 40, '#5FD3A8', 0.3],
            [61, 38, '#8FA8FF', 0.1],
            [14, 4, BULB, 0.4],
            [50, 3, '#FF7AA8', 0.25],
          ].map(([x, y, c, d], i) => (
            <motion.rect key={i} x={(x as number) - 1.6} y={(y as number) - 1.6} width="3.2" height="3.2" rx={i % 2 ? 1.6 : 0.6} fill={c as string} animate={{ opacity: [0, 1, 1, 0], y: [(y as number) - 5, (y as number) + 7], rotate: [0, i % 2 ? 160 : -160] }} transition={{ duration: 1.3, repeat: Infinity, delay: d as number, ease: 'easeIn' }} />
          ))}
        </g>
      )}
      {mood === 'cheer' && !still && (
        <g fill={BULB}>
          {[
            [6, 16, 0],
            [58, 22, 0.1],
            [8, 50, 0.2],
            [57, 50, 0.05],
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
