import type { ComponentType } from 'react';
import { getWidget } from '@lumen/engine';
import { OrderView, TilesView } from './Arrange.tsx';
import { GraphView, SliderView } from './Graphs.tsx';
import { ChoiceView, ExpressionView, NumericView } from './Inputs.tsx';
import { BalanceView, FractionView, LogicGridView, NumberLineView } from './Manipulatives.tsx';
import { ChartView, DistributionView, RobotView } from './Explore.tsx';
import { BitsView, BucketsView, GatesView, MatchView, NetworkView, PixelsView, VennView } from './Interactive.tsx';
import { AngleView, HanoiView, NimView, RectView, SwapView } from './Games.tsx';
import { EstimateView, SwipeView, ClozeView, TeachView } from './Micro.tsx';
import { SimView } from './Sim.tsx';
import { useState } from 'react';
import type { WidgetViewProps } from './types.ts';

export const VIEWS: Record<string, ComponentType<WidgetViewProps>> = {
  choice: ChoiceView,
  numeric: NumericView,
  expression: ExpressionView,
  order: OrderView,
  tiles: TilesView,
  graph: GraphView,
  slider: SliderView,
  balance: BalanceView,
  fraction: FractionView,
  numberline: NumberLineView,
  'logic-grid': LogicGridView,
  robot: RobotView,
  chart: ChartView,
  distribution: DistributionView,
  buckets: BucketsView,
  match: MatchView,
  pixels: PixelsView,
  bits: BitsView,
  gates: GatesView,
  venn: VennView,
  network: NetworkView,
  nim: NimView,
  hanoi: HanoiView,
  angle: AngleView,
  rect: RectView,
  swap: SwapView,
  estimate: EstimateView,
  swipe: SwipeView,
  cloze: ClozeView,
  teach: TeachView,
  sim: SimView,
};

/** Widgets that draw no own surface get a card behind them. */
const CARDED = new Set(['fraction', 'balance', 'distribution', 'bits', 'pixels', 'chart', 'logic-grid', 'robot']);

/** Display-only rendering of a widget (explain visuals, problem visuals). */
export function Visual({ widget, params, locale, alt, interactive = false }: { widget: string; params: Record<string, unknown>; locale: string; alt?: string; interactive?: boolean }) {
  const def = getWidget(widget);
  const View = VIEWS[widget];
  const p = def?.params.parse(params);
  const [state, setState] = useState<unknown>(() => (def ? def.init(p, { locale, seed: 1 }) : null));
  if (!def || !View) return null;
  return (
    <figure className={`visual ${CARDED.has(widget) ? 'visual-card' : ''}`}>
      <View params={p} state={state} dispatch={(a) => interactive && setState((s: unknown) => def.applyAction(s, a, p))} readOnly={!interactive} locale={locale} />
      <figcaption className="sr-only">{alt ?? def.describe(state, p, locale)}</figcaption>
    </figure>
  );
}

export type { WidgetViewProps };
