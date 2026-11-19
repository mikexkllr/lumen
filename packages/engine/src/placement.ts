/**
 * Placement is deliberately rule-based and deterministic (no ML, no LLM):
 * the first wrongly answered item decides where learning starts.
 */
import type { Placement } from './schema.ts';

export function placementRecommendation(placement: Placement, results: boolean[]): { topic: string; unit?: string } {
  const firstWrong = placement.items.findIndex((_, i) => results[i] === false);
  return firstWrong >= 0 ? placement.items[firstWrong].recommends : placement.mastered;
}
