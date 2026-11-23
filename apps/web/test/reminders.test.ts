import { describe, expect, it } from 'vitest';
import { planReminders } from '../src/lib/reminders.ts';

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
