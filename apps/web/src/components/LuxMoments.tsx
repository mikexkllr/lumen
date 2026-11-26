/**
 * Lux as a companion on screen: he talks in a speech bubble, pops in over a
 * lesson with a short line and peeks over the feedback panel after an answer.
 * These moments are decoration on top of feedback that is already there in
 * text, so they are hidden from screen readers unless they carry a message of
 * their own (the speech bubble on the home screen does).
 */
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Lux, type LuxMood } from './Lux.tsx';

/** Lux with a speech bubble next to him. Tapping Lux can make him react. */
export function LuxSay({ mood = 'idle', size = 64, bubbleKey, children, still = false, onTap, tapLabel, className }: { mood?: LuxMood; size?: number; bubbleKey?: string | number; children: ReactNode; still?: boolean; onTap?: () => void; tapLabel?: string; className?: string }) {
  const lux = <Lux mood={mood} size={size} still={still} />;
  return (
    <div className={`lux-say ${className ?? ''}`}>
      {onTap ? (
        <motion.button type="button" className="lux-tap" onClick={onTap} aria-label={tapLabel} whileTap={still ? undefined : { scale: 0.88, rotate: -6 }}>
          {lux}
        </motion.button>
      ) : (
        lux
      )}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={bubbleKey ?? 'bubble'} className="lux-bubble" role="status" initial={still ? false : { opacity: 0, scale: 0.85, x: -10 }} animate={{ opacity: 1, scale: 1, x: 0 }} exit={still ? undefined : { opacity: 0, scale: 0.92, transition: { duration: 0.1 } }} transition={{ type: 'spring', stiffness: 460, damping: 26 }}>
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export interface LuxPopData {
  key: string | number;
  text: string;
  mood: LuxMood;
  /** Hot streaks get the fiery colours. */
  heat?: 1 | 2 | 3;
}

/** Lux drops in from the top of the lesson with a short line and leaves on his own. */
export function LuxPop({ pop, reduce }: { pop: LuxPopData | null; reduce: boolean }) {
  return (
    <AnimatePresence>
      {pop && (
        <motion.div
          key={pop.key}
          className={`lux-pop ${pop.heat ? `heat${pop.heat}` : ''}`}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -46, scale: 0.6, rotate: -10 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: [0.6, 1.08, 1], rotate: [-10, 3, 0] }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -30, scale: 0.85, transition: { duration: 0.22 } }}
          transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
          aria-hidden="true"
        >
          <span className="lp-lux"><Lux mood={pop.mood} size={52} still={reduce} /></span>
          <span className="lp-text">{pop.text}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Lux looks over the edge of the feedback panel: cheering after a hit, wincing after a miss. */
export function LuxPeek({ mood, reduce }: { mood: LuxMood | null; reduce: boolean }) {
  return (
    <AnimatePresence>
      {mood && (
        <motion.span
          key={mood}
          className="lux-peek"
          initial={reduce ? { opacity: 0 } : { y: 46, opacity: 0, rotate: 10 }}
          animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, rotate: 0 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 380, damping: 17, delay: 0.08 }}
          aria-hidden="true"
        >
          <Lux mood={mood} size={66} still={reduce} />
        </motion.span>
      )}
    </AnimatePresence>
  );
}
