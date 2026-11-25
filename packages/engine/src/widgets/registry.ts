import type { WidgetDefinition, WidgetContext } from './types.ts';
import { choiceWidget } from './choice.ts';
import { numericWidget } from './numeric.ts';
import { expressionWidget } from './expression.ts';
import { orderWidget } from './order.ts';
import { tilesWidget } from './tiles.ts';
import { graphWidget } from './graph.ts';
import { sliderWidget } from './slider.ts';
import { balanceWidget } from './balance.ts';
import { fractionWidget } from './fraction.ts';
import { numberLineWidget } from './numberline.ts';
import { logicGridWidget } from './logicgrid.ts';
import { robotWidget } from './robot.ts';
import { chartWidget } from './chart.ts';
import { distributionWidget } from './distribution.ts';
import { bucketsWidget } from './buckets.ts';
import { matchWidget } from './match.ts';
import { pixelsWidget } from './pixels.ts';
import { bitsWidget } from './bits.ts';
import { gatesWidget } from './gates.ts';
import { vennWidget } from './venn.ts';
import { networkWidget } from './network.ts';
import { nimWidget } from './nim.ts';
import { hanoiWidget } from './hanoi.ts';
import { angleWidget } from './angle.ts';
import { rectWidget } from './rect.ts';
import { swapWidget } from './swap.ts';
import { estimateWidget } from './estimate.ts';
import { swipeWidget } from './swipe.ts';
import { clozeWidget } from './cloze.ts';
import { teachWidget } from './teach.ts';
import { simWidget } from './sim.ts';
import { flipWidget } from './flip.ts';

const registry = new Map<string, WidgetDefinition>();

export function registerWidget(def: WidgetDefinition): void {
  registry.set(def.kind, def);
}

export function getWidget(kind: string): WidgetDefinition | undefined {
  return registry.get(kind);
}

export function listWidgets(): WidgetDefinition[] {
  return [...registry.values()];
}

for (const w of [choiceWidget, numericWidget, expressionWidget, orderWidget, tilesWidget, graphWidget, sliderWidget, balanceWidget, fractionWidget, numberLineWidget, logicGridWidget, robotWidget, chartWidget, distributionWidget, bucketsWidget, matchWidget, pixelsWidget, bitsWidget, gatesWidget, vennWidget, networkWidget, nimWidget, hanoiWidget, angleWidget, rectWidget, swapWidget, estimateWidget, swipeWidget, clozeWidget, teachWidget, simWidget, flipWidget]) {
  registerWidget(w as WidgetDefinition);
}

/**
 * Object-style instance matching the contract in the spec:
 * init(params), getState(), applyAction(action), isSolved(), describe(), solve(params).
 */
export function createWidgetInstance<S = unknown>(kind: string, params: unknown, ctx: WidgetContext, answer?: unknown) {
  const def = getWidget(kind);
  if (!def) throw new Error(`Unbekanntes Widget: ${kind}`);
  const p = def.params.parse(params);
  const ans = answer !== undefined && def.answer ? def.answer.parse(answer) : answer;
  let state: S = def.init(p, ctx);
  return {
    definition: def,
    params: p,
    getState: () => state,
    setState: (s: S) => { state = s; },
    applyAction(action: unknown) {
      state = def.applyAction(state, action, p);
      return state;
    },
    isSolved(): boolean {
      if (ans !== undefined && def.checkAnswer) return def.checkAnswer(state, ans, p);
      return def.isSolved ? def.isSolved(state, p) : false;
    },
    describe: (locale = ctx.locale) => def.describe(state, p, locale),
    solve: () => def.solve?.(p, ans, ctx) ?? null,
  };
}
