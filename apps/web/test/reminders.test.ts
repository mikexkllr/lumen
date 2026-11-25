import { afterEach, describe, expect, it, vi } from 'vitest';
import { planReminders, requestReminderPermission, scheduleReminders } from '../src/lib/reminders.ts';

// Like a Capacitor plugin on iOS: a proxy that answers every property with a native call,
// so `then` exists too and rejects ("not implemented") without ever settling the await.
const calls: string[] = [];
let display = 'prompt';
const native: Record<string, (...a: unknown[]) => Promise<unknown>> = {
  checkPermissions: async () => ({ display }),
  requestPermissions: async () => ({ display: (display = 'granted') }),
  cancel: async () => undefined,
  schedule: async () => undefined,
};
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: new Proxy({}, {
    get: (_, prop: string) => (...args: unknown[]) => {
      calls.push(prop);
      return native[prop]?.(...args) ?? Promise.reject(new Error(`LocalNotifications.${prop}() is not implemented on ios`));
    },
  }),
}));

const base = { today: '2026-11-23', streak: 5, hasFriends: false, locale: 'de' as const };

describe('streak reminders', () => {
  it('plans one reminder a day at the chosen time and names the streak', () => {
    const plan = planReminders({ ...base, time: '18:30', now: new Date(2026, 10, 23, 9, 0), todayDone: false });
    expect(plan).toHaveLength(14);
    expect(plan[0].at).toEqual(new Date(2026, 10, 23, 18, 30));
    expect(plan[0].body).toContain('5 Tagen');
    expect(plan[13].at).toEqual(new Date(2026, 11, 6, 18, 30));
    expect(new Set(plan.map((p) => p.id)).size).toBe(14);
  });

  it('skips today once the streak is safe or the time has passed', () => {
    expect(planReminders({ ...base, time: '18:30', now: new Date(2026, 10, 23, 9, 0), todayDone: true })[0].at).toEqual(new Date(2026, 10, 24, 18, 30));
    expect(planReminders({ ...base, time: '08:00', now: new Date(2026, 10, 23, 9, 0), todayDone: false })).toHaveLength(13);
  });

  it('plans nothing without a time', () => {
    expect(planReminders({ ...base, time: null, now: new Date(), todayDone: false })).toEqual([]);
  });

  it('uses the learner’s language', () => {
    expect(planReminders({ ...base, locale: 'en', time: '18:30', now: new Date(2026, 10, 23, 9, 0), todayDone: false })[0].title).toBe('Time for Lumen');
  });
});

describe('streak reminders on the phone', () => {
  const g = globalThis as { Capacitor?: unknown };
  afterEach(() => { delete g.Capacitor; calls.length = 0; display = 'prompt'; });
  const onPhone = () => { g.Capacitor = { isNativePlatform: () => true }; };
  const settle = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, no) => setTimeout(() => no(new Error('never settled')), 500))]);

  it('do nothing in the browser', async () => {
    expect(await requestReminderPermission()).toBe(false);
    await scheduleReminders([{ id: 1, at: new Date(), title: 't', body: 'b' }]);
    expect(calls).toEqual([]);
  });

  it('ask for permission without touching then() on the native plugin', async () => {
    onPhone();
    expect(await settle(requestReminderPermission())).toBe(true);
    expect(calls).toEqual(['checkPermissions', 'requestPermissions']);
  });

  it('replace the scheduled reminders once allowed', async () => {
    onPhone();
    display = 'granted';
    await settle(scheduleReminders(planReminders({ ...base, time: '18:30', now: new Date(2026, 10, 23, 9, 0), todayDone: false })));
    expect(calls).toEqual(['cancel', 'checkPermissions', 'schedule']);
  });

  it('only cancel while notifications are not allowed', async () => {
    onPhone();
    display = 'denied';
    await settle(scheduleReminders(planReminders({ ...base, time: '18:30', now: new Date(2026, 10, 23, 9, 0), todayDone: false })));
    expect(calls).toEqual(['cancel', 'checkPermissions']);
  });
});
