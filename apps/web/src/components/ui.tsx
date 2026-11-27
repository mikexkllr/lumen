import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useApp } from '../lib/store.tsx';
import {
  ArrowLeft, ArrowRight, BookOpen, Brain, ChartColumn, Check, ChevronDown, ChevronRight, CircleCheck, Clock, Code, Compass, Cpu, Dices, Download, Eye, Flag, Flame,
  House, Info, Layers, Lightbulb, Lock, Percent, Play, Puzzle, RefreshCw, Repeat, RotateCcw, Scale, Search, Settings, Shapes, Snowflake, Sparkles, Star, Target,
  Trash2, Trophy, Undo2, Upload, User, X, Zap, Divide, Bot, Sunrise, Moon, Gift, Medal, Crown, CalendarCheck, SendHorizontal, MessageCircle, Volume2, Users, UserPlus, Share2, Bell, Ban, Ellipsis, Hand, Copy, Scale as ScaleIcon, LogOut, TriangleAlert, WifiOff, Pencil, type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  learn: House, home: House, review: Repeat, discover: Compass, profile: User, close: X, check: Check, lock: Lock, star: Star, flame: Flame, bolt: Zap, zap: Zap,
  bulb: Lightbulb, flag: Flag, reset: RotateCcw, chevron: ChevronRight, down: ChevronDown, search: Search, sync: RefreshCw, download: Download, upload: Upload,
  trash: Trash2, robot: Bot, chart: ChartColumn, ai: Brain, geometry: Shapes, dice: Dices, percent: Percent, code: Code, fraction: Divide, balance: Scale,
  puzzle: Puzzle, play: Play, clock: Clock, book: BookOpen, target: Target, sparkles: Sparkles, arrow: ArrowRight, back: ArrowLeft, settings: Settings, eye: Eye,
  info: Info, done: CircleCheck, snow: Snowflake, layers: Layers, trophy: Trophy, undo: Undo2, cpu: Cpu,
  compass: Compass, sunrise: Sunrise, moon: Moon, gift: Gift, medal: Medal, crown: Crown, calendar: CalendarCheck, send: SendHorizontal, chat: MessageCircle, volume: Volume2,
  users: Users, userPlus: UserPlus, share: Share2, bell: Bell, ban: Ban, more: Ellipsis, nudge: Hand, copy: Copy, legal: ScaleIcon, logout: LogOut,
  alert: TriangleAlert, offline: WifiOff, edit: Pencil,
};

export function Icon({ name, size = 20, label, strokeWidth = 1.9, className }: { name: string; size?: number; label?: string; strokeWidth?: number; className?: string }) {
  const C = ICONS[name] ?? Star;
  return <C size={size} strokeWidth={strokeWidth} className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} focusable="false" />;
}

/** App mark: Lux's head on the brand colour (same drawing as the app icon, scripts/build-icons.ts). */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="lumen-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b6dff" />
          <stop offset="1" stopColor="#3b2fd0" />
        </linearGradient>
        <linearGradient id="lumen-logo-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#e3defa" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#lumen-logo)" />
      <g transform="translate(32 34) scale(1.08) translate(-32 -22.6)">
        <line x1="32" y1="13" x2="32" y2="7.6" stroke="#cfc8ff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="32" cy="6" r="3.4" fill="#ffc93d" />
        <rect x="9.4" y="23" width="5" height="11" rx="2.5" fill="#d4ccff" />
        <rect x="49.6" y="23" width="5" height="11" rx="2.5" fill="#d4ccff" />
        <rect x="12" y="12.5" width="40" height="32" rx="14" fill="url(#lumen-logo-shell)" />
        <rect x="17" y="18" width="30" height="21" rx="9" fill="#1f1b4d" />
        <rect x="22.4" y="23.6" width="5.2" height="7.4" rx="2.6" fill="#ffe27a" />
        <rect x="36.4" y="23.6" width="5.2" height="7.4" rx="2.6" fill="#ffe27a" />
        <path d="M29.4 34 Q32 36 34.6 34" fill="none" stroke="#ffe27a" strokeWidth="1.8" strokeLinecap="round" />
      </g>
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

/**
 * The head of a screen: its title, a way back for screens below a tab, and room for one or
 * two actions. Every screen uses it, so titles sit in the same place at the same size.
 */
/** The way back from a screen below a tab: to where the learner came from, else to `to`. */
export function BackButton({ to = '', className = '' }: { to?: string | (() => void); className?: string }) {
  const { t } = useApp();
  const goBack = () => {
    if (typeof to === 'function') to();
    else if (history.length > 1) history.back();
    else location.hash = `#/${to}`;
  };
  return <button type="button" className={`icon-btn back ${className}`} onClick={goBack} aria-label={t('onb.back')}><Icon name="back" /></button>;
}

export function PageHeader({ title, sub, back, actions, id }: { title: ReactNode; sub?: ReactNode; back?: string | (() => void); actions?: ReactNode; id?: string }) {
  return (
    <header className="page-head">
      {back !== undefined && <BackButton to={back} />}
      <div className="ph-body">
        <h1 className="page-title" id={id}>{title}</h1>
        {sub && <p className="ph-sub">{sub}</p>}
      </div>
      {actions && <div className="ph-actions">{actions}</div>}
    </header>
  );
}

const NOTE_ICONS = { plain: 'info', info: 'info', ok: 'done', warn: 'alert', bad: 'alert' } as const;

/** A message in line with the content, in the colour of what it means. */
export function Note({ tone = 'plain', icon, role, children, style }: { tone?: keyof typeof NOTE_ICONS; icon?: string; role?: 'status' | 'alert'; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <p className={`note ${tone}`} role={role} style={style}>
      <Icon name={icon ?? NOTE_ICONS[tone]} size={17} />
      <span>{children}</span>
    </p>
  );
}

/** Nothing to show yet: say so, and offer the way to change it. */
export function Empty({ icon = 'sparkles', title, children, action }: { icon?: string; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="em-ico" aria-hidden="true"><Icon name={icon} size={22} /></span>
      {title && <strong>{title}</strong>}
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function LoadingRow() {
  const { t } = useApp();
  return <div className="loading-row" role="status"><span className="spinner" aria-hidden="true" /> {t('loading')}</div>;
}

/** Keeps focus inside an open layer, closes it on Escape and puts focus back where it was. */
function useLayer(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const el = ref.current;
    const before = document.activeElement as HTMLElement | null;
    const focusable = () => [...(el?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])') ?? [])];
    if (el && !el.contains(document.activeElement)) (el.querySelector<HTMLElement>('[autofocus]') ?? focusable()[0] ?? el).focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close.current();
      } else if (e.key === 'Tab') {
        const f = focusable();
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    addEventListener('keydown', key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      removeEventListener('keydown', key);
      document.body.style.overflow = overflow;
      before?.focus?.({ preventScroll: true });
    };
  }, []);
  return ref;
}

/** A sheet from the bottom on phones, a centred panel on wider screens. */
export function Sheet({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
  const { t } = useApp();
  const ref = useLayer(onClose);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={ref} tabIndex={-1}>
        <div className="grab" />
        <div className="sheet-head">
          <h2>{label}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('player.close')}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </>
  );
}

export interface ConfirmOptions {
  title: string;
  body?: string;
  /** What the confirming button says – the action itself, not "OK". */
  confirm: string;
  cancel?: string;
  /** Deleting, leaving, blocking: the confirming button turns red. */
  danger?: boolean;
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/**
 * Asks before something that cannot be taken back, in the app's own dialog. Without the
 * provider (a screen rendered on its own in a test) it falls back to the browser's.
 */
export function useConfirm(): (o: ConfirmOptions) => Promise<boolean> {
  const ask = useContext(ConfirmContext);
  return ask ?? (async (o) => window.confirm([o.title, o.body].filter(Boolean).join('\n\n')));
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<(ConfirmOptions & { resolve(v: boolean): void }) | null>(null);
  const ask = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setOpen({ ...o, resolve })), []);
  const answer = (v: boolean) => {
    open?.resolve(v);
    setOpen(null);
  };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {open && <ConfirmDialog options={open} onAnswer={answer} />}
    </ConfirmContext.Provider>
  );
}

function ConfirmDialog({ options: o, onAnswer }: { options: ConfirmOptions; onAnswer(v: boolean): void }) {
  const { t } = useApp();
  const ref = useLayer(() => onAnswer(false));
  return (
    <>
      <div className="dialog-backdrop" onClick={() => onAnswer(false)} />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby={o.body ? 'confirm-body' : undefined} ref={ref} tabIndex={-1}>
        <h2 id="confirm-title">{o.title}</h2>
        {o.body && <p id="confirm-body">{o.body}</p>}
        <div className="dialog-actions">
          <button type="button" className={`btn lg block ${o.danger ? 'bad' : 'primary'}`} onClick={() => onAnswer(true)}>{o.confirm}</button>
          <button type="button" className="btn lg block quiet" autoFocus onClick={() => onAnswer(false)}>{o.cancel ?? t('cancel')}</button>
        </div>
      </div>
    </>
  );
}
