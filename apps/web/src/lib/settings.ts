import { detectLocale, translate, type UiLocale } from './i18n.ts';

export type AgeBand = 'u13' | '13-15' | '16+';

export interface Settings {
  locale: UiLocale;
  theme: 'system' | 'light' | 'dark';
  highContrast: boolean;
  hyperlegible: boolean;
  fontScale: number;
  reduceMotion: 'system' | 'reduce' | 'full';
  sound: boolean;
  haptics: boolean;
  dailyGoal: number;
  reminder: string | null;
  onboarded: boolean;
  interests: string[];
  goal: 'school' | 'work' | 'curious' | null;
  age: AgeBand | null;
  /** Current path on the home screen. */
  pathId: string | null;
  /** Where the placement check suggests to start. */
  startAt: { topic: string; unit?: string } | null;
  sync: { serverUrl: string; token: string; lastSync: number | null; cursor: number; consent: boolean; linked?: { apple: boolean; email: boolean } } | null;
  /** Lux may use the language model on the Lumen server (off: rule tutor only). */
  tutor: boolean;
  /** The learner agreed that Lux may send the task and their messages to the language model (asked before first use). */
  tutorConsent: boolean;
  /** Another Lumen server instead of the build default (e.g. a self-hosted one); null: default. */
  serverUrl: string | null;
  /** Learner's own API key for Lux (stays on the device); null: the server's model. */
  tutorByok: { url: string; model: string; key: string } | null;
  /** Cached social profile (the server is the source of truth); needs sync. */
  social: { userId: string; handle: string } | null;
}

export const DEFAULT_SETTINGS: Settings = {
  locale: detectLocale(),
  theme: 'system',
  highContrast: false,
  hyperlegible: false,
  fontScale: 1,
  reduceMotion: 'system',
  sound: true,
  haptics: true,
  dailyGoal: 10,
  reminder: null,
  onboarded: false,
  interests: [],
  goal: null,
  age: null,
  pathId: null,
  startAt: null,
  sync: null,
  tutor: true,
  tutorConsent: false,
  serverUrl: null,
  tutorByok: null,
  social: null,
};

const KEY = 'lumen.settings.v1';

/** Learning paths were regrouped into one path per subject (Fach). */
const OLD_PATHS: Record<string, string> = {
  'path.mathe-grundlagen': 'path.math',
  'path.algebra': 'path.math',
  'path.geometrie': 'path.math',
  'path.alltag': 'path.math',
  'path.daten-zufall': 'path.data',
  'path.logisches-denken': 'path.logic',
  'path.coding': 'path.cs',
  'path.ki': 'path.ai',
  'path.naturwissenschaften': 'path.physics',
};

export function migrateSettings(s: Settings): Settings {
  const pathId = s.pathId && OLD_PATHS[s.pathId] ? OLD_PATHS[s.pathId] : s.pathId;
  const interests = [...new Set((s.interests ?? []).flatMap((i) => (i === 'science' ? ['physics', 'chemistry'] : [i])))];
  return { ...s, pathId, interests };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrateSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
  } catch {
    /* storage unavailable (private mode) – fall back to defaults */
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Kids mode: below 16 (GDPR Art. 8 in Germany) – no social features (friends, leagues, feed), no LLM tutor, sync needs parental consent. */
export const isKid = (s: Settings) => s.age === 'u13' || s.age === '13-15';

export function applyDocumentSettings(s: Settings): void {
  const root = document.documentElement;
  root.lang = s.locale;
  document.title = translate(s.locale, 'seo.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', translate(s.locale, 'seo.description'));
  if (s.theme === 'system') root.removeAttribute('data-theme');
  else root.dataset.theme = s.theme;
  if (s.highContrast) root.dataset.contrast = 'high';
  else root.removeAttribute('data-contrast');
  if (s.hyperlegible) root.dataset.font = 'hyperlegible';
  else root.removeAttribute('data-font');
  if (s.reduceMotion === 'system') root.removeAttribute('data-motion');
  else root.dataset.motion = s.reduceMotion;
  root.style.setProperty('--scale', String(s.fontScale));
}

export function prefersReducedMotion(s: Settings): boolean {
  if (s.reduceMotion !== 'system') return s.reduceMotion === 'reduce';
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
