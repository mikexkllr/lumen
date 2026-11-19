import type { ReactNode } from 'react';
import {
  ArrowLeft, ArrowRight, BookOpen, Brain, ChartColumn, Check, ChevronDown, ChevronRight, CircleCheck, Clock, Code, Compass, Cpu, Dices, Download, Eye, Flag, Flame,
  House, Info, Layers, Lightbulb, Lock, Percent, Play, Puzzle, RefreshCw, Repeat, RotateCcw, Scale, Search, Settings, Shapes, Snowflake, Sparkles, Star, Target,
  Trash2, Trophy, Undo2, Upload, User, X, Zap, Divide, Bot, Sunrise, Moon, Gift, Medal, Crown, CalendarCheck, SendHorizontal, MessageCircle, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  learn: House, home: House, review: Repeat, discover: Compass, profile: User, close: X, check: Check, lock: Lock, star: Star, flame: Flame, bolt: Zap, zap: Zap,
  bulb: Lightbulb, flag: Flag, reset: RotateCcw, chevron: ChevronRight, down: ChevronDown, search: Search, sync: RefreshCw, download: Download, upload: Upload,
  trash: Trash2, robot: Bot, chart: ChartColumn, ai: Brain, geometry: Shapes, dice: Dices, percent: Percent, code: Code, fraction: Divide, balance: Scale,
  puzzle: Puzzle, play: Play, clock: Clock, book: BookOpen, target: Target, sparkles: Sparkles, arrow: ArrowRight, back: ArrowLeft, settings: Settings, eye: Eye,
  info: Info, done: CircleCheck, snow: Snowflake, layers: Layers, trophy: Trophy, undo: Undo2, cpu: Cpu,
  compass: Compass, sunrise: Sunrise, moon: Moon, gift: Gift, medal: Medal, crown: Crown, calendar: CalendarCheck, send: SendHorizontal, chat: MessageCircle,
};

export function Icon({ name, size = 20, label, strokeWidth = 1.9, className }: { name: string; size?: number; label?: string; strokeWidth?: number; className?: string }) {
  const C = ICONS[name] ?? Star;
  return <C size={size} strokeWidth={strokeWidth} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" />;
}

/** Wordmark glyph: a rounded tile with a ray of light. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lumen-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b6dff" />
          <stop offset="1" stopColor="#3b2fd0" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#lumen-logo)" />
      <path d="M11 8.5v15h10" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21.5" cy="10.5" r="2.6" fill="#ffd166" />
    </svg>
  );
}

export function Ring({ value, size = 44, stroke = 5, children, label, color }: { value: number; size?: number; stroke?: number; children?: ReactNode; label?: string; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <span style={{ position: 'relative', width: size, height: size, display: 'inline-grid', placeItems: 'center', flex: 'none' }} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color ?? (v >= 1 ? 'var(--ok)' : 'var(--accent)')} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: 'stroke-dashoffset 0.8s var(--ease)' }} />
      </svg>
      <span style={{ position: 'relative', fontSize: '0.75rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }} aria-hidden="true">{children}</span>
    </span>
  );
}

export function Switch({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange(v: boolean): void; hint?: string }) {
  return (
    <label className="switch-row">
      <span>
        <span className="lbl" style={{ fontWeight: 550 }}>{label}</span>
        {hint && <span className="small faint" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <span className="switch">
        <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span />
      </span>
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function relativeDay(date: Date, today: Date, t: (k: 'today' | 'tomorrow' | 'days', v?: Record<string, number>) => string): string {
  const d0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const d1 = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const n = Math.round((d1 - d0) / 86400000);
  if (n <= 0) return t('today');
  if (n === 1) return t('tomorrow');
  return `in ${t('days', { n })}`;
}
