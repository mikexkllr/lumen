/**
 * Daily streak reminders as local notifications in the native apps (Capacitor).
 * Nothing leaves the device: the next 14 days are scheduled locally and
 * rescheduled whenever the app opens or progress changes, so today's reminder
 * disappears once the learner has kept their streak. In the browser this is a
 * no-op (the web has no reliable scheduled notifications without push).
 */
import { useEffect } from 'react';
import { addDays } from '@lumen/engine';
import { translate, type UiLocale } from './i18n.ts';

const BASE_ID = 4100;
const DAYS = 14;

export function isNativeApp(): boolean {
  return (globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.() === true;
}

/**
 * Wrapped in an object on purpose: a Capacitor plugin is a proxy that answers every property,
 * `then` included, so resolving a promise with it directly calls `LocalNotifications.then()`,
 * which rejects natively ("not implemented on ios") and leaves the await hanging forever.
 */
async function plugin() {
  const m = await import('@capacitor/local-notifications');
  return { ln: m.LocalNotifications };
}

/** Asks for notification permission (Android 13+, iOS). True if reminders can be shown. */
export async function requestReminderPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  const { ln } = await plugin();
  let p = await ln.checkPermissions();
  if (p.display === 'prompt' || p.display === 'prompt-with-rationale') p = await ln.requestPermissions();
  return p.display === 'granted';
}

export interface ReminderPlan {
  id: number;
  at: Date;
  title: string;
  body: string;
}

/**
 * Pure planning step (tested): one reminder per day at `time` for the next
 * DAYS days, skipping today if the streak is already safe or the time passed.
 */
export function planReminders(opts: { time: string | null; today: string; now: Date; streak: number; todayDone: boolean; hasFriends: boolean; locale: UiLocale }): ReminderPlan[] {
  const m = /^(\d{2}):(\d{2})$/.exec(opts.time ?? '');
  if (!m) return [];
  const [hh, mm] = [Number(m[1]), Number(m[2])];
  const out: ReminderPlan[] = [];
  for (let i = 0; i < DAYS; i++) {
    const [y, mo, d] = addDays(opts.today, i).split('-').map(Number);
    const at = new Date(y, mo - 1, d, hh, mm, 0, 0);
    if (i === 0 && (opts.todayDone || at <= opts.now)) continue;
    // Today and tomorrow know the streak; later days get a rotating general nudge.
    const body =
      i <= 1 && opts.streak > 0 ? translate(opts.locale, 'reminder.streak', { n: opts.streak })
      : opts.hasFriends && i % 4 === 2 ? translate(opts.locale, 'reminder.friends')
      : translate(opts.locale, (['reminder.generic1', 'reminder.generic2', 'reminder.generic3'] as const)[i % 3]);
    out.push({ id: BASE_ID + i, at, title: translate(opts.locale, 'reminder.title'), body });
  }
  return out;
}

export async function scheduleReminders(plan: ReminderPlan[]): Promise<void> {
  if (!isNativeApp()) return;
  const { ln } = await plugin();
  await ln.cancel({ notifications: Array.from({ length: DAYS }, (_, i) => ({ id: BASE_ID + i })) });
  if (!plan.length) return;
  const perm = await ln.checkPermissions();
  if (perm.display !== 'granted') return;
  await ln.schedule({
    notifications: plan.map((p) => ({ id: p.id, title: p.title, body: p.body, schedule: { at: p.at, allowWhileIdle: true }, extra: { route: '' } })),
  });
}

/** Keeps the scheduled reminders in line with the setting and today's progress. */
export function useReminders(opts: { time: string | null; today: string; streak: number; todayDone: boolean; hasFriends: boolean; locale: UiLocale; loaded: boolean }): void {
  const { time, today, streak, todayDone, hasFriends, locale, loaded } = opts;
  useEffect(() => {
    if (!loaded || !isNativeApp()) return;
    const plan = planReminders({ time, today, now: new Date(), streak, todayDone, hasFriends, locale });
    void scheduleReminders(plan).catch(() => {});
  }, [time, today, streak, todayDone, hasFriends, locale, loaded]);
}
