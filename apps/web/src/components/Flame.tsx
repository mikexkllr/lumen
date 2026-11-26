/**
 * The streak flame. Lit, it flickers and throws sparks; unlit, it is a grey
 * outline waiting for today's lesson. Decorative – the number next to it
 * carries the meaning.
 */
import { useId } from 'react';

export function Flame({ size = 64, lit = true, still = false, className }: { size?: number; lit?: boolean; still?: boolean; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <span className={`flame ${lit ? 'lit' : 'out'} ${still ? 'still' : ''} ${className ?? ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="0 0 64 64" width={size} height={size} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id={`${uid}o`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff5a1f" />
            <stop offset="0.55" stopColor="#ff8a1f" />
            <stop offset="1" stopColor="#ffb52e" />
          </linearGradient>
          <linearGradient id={`${uid}i`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ffc93d" />
            <stop offset="1" stopColor="#fff3b0" />
          </linearGradient>
          <radialGradient id={`${uid}g`} cx="50%" cy="60%" r="50%">
            <stop offset="0" stopColor="#ff8a1f" stopOpacity="0.45" />
            <stop offset="1" stopColor="#ff8a1f" stopOpacity="0" />
          </radialGradient>
        </defs>
        {lit && <circle className="flame-glow" cx="32" cy="38" r="34" fill={`url(#${uid}g)`} />}
        <g className="flame-body">
          <path
            className="flame-outer"
            d="M33 3 C35 14 47 20 50 34 C53 48 44 60 32 60 C20 60 11 49 14 36 C15.5 30 19 26 21 21 C23 26 25 28 27 28 C27 18 29 9 33 3 Z"
            fill={lit ? `url(#${uid}o)` : 'var(--surface-3)'}
            stroke={lit ? 'none' : 'var(--line-2)'}
            strokeWidth="1.5"
          />
          {lit && <path className="flame-inner" d="M32 30 C34 37 41 40 41 48 C41 54 37 58 32 58 C27 58 23 54 23 48 C23 43 27 41 28 36 C30 37 31 35 32 30 Z" fill={`url(#${uid}i)`} />}
        </g>
        {lit && !still && (
          <g className="flame-sparks" fill="#ffb52e">
            <circle cx="14" cy="22" r="1.6" />
            <circle cx="50" cy="16" r="1.3" />
            <circle cx="42" cy="6" r="1" />
            <circle cx="20" cy="8" r="1.1" />
          </g>
        )}
      </svg>
    </span>
  );
}
