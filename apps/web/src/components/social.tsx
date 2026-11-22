import { useEffect, type ReactNode } from 'react';
import { Atom, Bird, Cat, Coffee, Dog, Fish, Flower, Heart, Leaf, Moon, Mountain, Music, Rocket, Star, Sun, Zap, type LucideIcon } from 'lucide-react';
import { Icon } from './ui.tsx';
import { useApp } from '../lib/store.tsx';
import { ApiError, parseAvatar, TIER_COLORS, TIERS, type Tier } from '../lib/social.ts';
import type { TKey } from '../lib/i18n.ts';

const AVATAR_GLYPHS: Record<string, LucideIcon> = { atom: Atom, rocket: Rocket, star: Star, leaf: Leaf, cat: Cat, dog: Dog, bird: Bird, fish: Fish, flower: Flower, moon: Moon, sun: Sun, zap: Zap, heart: Heart, music: Music, mountain: Mountain, coffee: Coffee };

/** Preset avatars only (colour + glyph) – no uploads, nothing to moderate. */
export function Avatar({ avatar, size = 40, label }: { avatar: string; size?: number; label?: string }) {
  const { color, icon } = parseAvatar(avatar);
  const G = AVATAR_GLYPHS[icon] ?? Star;
  return (
    <span className="sc-avatar" style={{ width: size, height: size, ['--av' as string]: color }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <G size={Math.round(size * 0.52)} strokeWidth={2.1} aria-hidden="true" />
    </span>
  );
}

export function tierName(t: (k: TKey) => string, tier: Tier | string): string {
  return t(`tier.${tier}` as TKey);
}

/** A faceted gem for a league tier. */
export function TierBadge({ tier, size = 44, locked = false, current = false }: { tier: Tier; size?: number; locked?: boolean; current?: boolean }) {
  const c = TIER_COLORS[tier];
  const i = TIERS.indexOf(tier);
  return (
    <span className={`tier-badge ${locked ? 'locked' : ''} ${current ? 'current' : ''}`} style={{ width: size, height: size, ['--tier' as string]: c }} aria-hidden="true">
      <svg viewBox="0 0 40 40" width={size} height={size}>
        <path d="M20 3 35 12v16L20 37 5 28V12z" fill="var(--tier)" />
        <path d="M20 3 35 12 20 20 5 12z" fill="#fff" opacity="0.28" />
        <path d="M20 20v17L5 28V12z" fill="#000" opacity="0.12" />
        <text x="20" y="25" textAnchor="middle" fontSize="12" fontWeight="800" fill="#fff">{i + 1}</text>
      </svg>
    </span>
  );
}

export function Sheet({ label, onClose, children }: { label: string; onClose(): void; children: ReactNode }) {
  const { t } = useApp();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label}>
        <div className="grab" />
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: '1.125rem' }}>{label}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('player.close')}><Icon name="close" /></button>
        </div>
        {children}
      </div>
    </>
  );
}

/** Localised message for an API error code. */
export function errorText(t: (k: TKey, v?: Record<string, string | number>) => string, e: unknown): string {
  const code = e instanceof ApiError ? e.code : e instanceof Error ? e.message : String(e);
  const key = `social.err.${code}` as TKey;
  const out = t(key);
  return out && out !== key ? out : t('social.err.generic', { code });
}

/** "3 min ago" etc. in the UI language. */
export function relTime(ts: number, locale: string, now = Date.now()): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const s = Math.round((ts - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(s / 86400), 'day');
  return new Date(ts).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
