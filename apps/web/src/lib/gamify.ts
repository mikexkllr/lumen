import { useMemo } from 'react';
import { dailyPuzzle, dailyQuests, dailySolved, deriveAchievements, levelInfo } from '@lumen/engine';
import { useApp } from './store.tsx';

/** Levels, achievements, daily quests and the daily puzzle – all derived from the event log. */
export function useGamification() {
  const { events, lib, progress, today, settings } = useApp();
  return useMemo(() => {
    const catalog = lib?.catalog ?? null;
    return {
      level: levelInfo(progress.xpTotal),
      achievements: deriveAchievements(events, catalog, progress),
      quests: dailyQuests(events, today, { dailyGoal: settings.dailyGoal, catalog }),
      daily: catalog ? dailyPuzzle(catalog, today) : null,
      dailyState: dailySolved(events, today),
    };
  }, [events, lib, progress, today, settings.dailyGoal]);
}

export const TIER_COLORS = { 1: '#0f9d8a', 2: '#6d5cf0', 3: '#d99a1e' } as const;
