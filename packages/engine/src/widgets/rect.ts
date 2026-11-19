import { z } from 'zod';
import { t, type LintIssue, type WidgetDefinition } from './types.ts';

/**
 * Drag a rectangle on a unit grid. Optional fixed perimeter couples width and
 * height (the classic "largest pen from a fixed fence" problem).
 */
const Params = z.object({
  maxW: z.number().int().min(2).max(14).default(10),
  maxH: z.number().int().min(2).max(10).default(8),
  w: z.number().int().min(1).default(2),
  h: z.number().int().min(1).default(2),
  /** If set, height follows width so that 2·(w + h) stays this value. */
  perimeter: z.number().int().min(4).optional(),
  show: z.array(z.enum(['area', 'perimeter'])).default(['area', 'perimeter']),
  unit: z.string().default('m'),
});

export type RectParams = z.infer<typeof Params>;
export interface RectState {
  w: number;
  h: number;
}
export type RectAction = { type: 'set'; w: number; h: number };

function clamp(p: RectParams, w: number, h: number): RectState {
  let W = Math.max(1, Math.min(p.maxW, Math.round(w)));
  let H = Math.max(1, Math.min(p.maxH, Math.round(h)));
  if (p.perimeter) {
    H = p.perimeter / 2 - W;
    if (H < 1 || H > p.maxH) {
      H = Math.max(1, Math.min(p.maxH, H));
      W = p.perimeter / 2 - H;
    }
  }
  return { w: W, h: H };
}

export const rectWidget: WidgetDefinition<RectParams, RectState, RectAction> = {
  kind: 'rect',
  title: { de: 'Rechteck', en: 'Rectangle' },
  params: Params,
  interactive: true,
  init: (p) => clamp(p, p.w, p.h),
  applyAction: (s, a, p) => (a.type === 'set' ? clamp(p, a.w, a.h) : s),
  actions(_s, p) {
    const out: RectAction[] = [];
    for (let w = 1; w <= p.maxW; w++) for (let h = 1; h <= (p.perimeter ? 1 : p.maxH); h++) out.push({ type: 'set', w, h });
    return out;
  },
  isAnswered: () => true,
  scope: (s) => ({ w: s.w, h: s.h, area: s.w * s.h, perimeter: 2 * (s.w + s.h), square: s.w === s.h }),
  describe(s, p, locale) {
    return t(locale, `Rechteck ${s.w} × ${s.h} ${p.unit}: Fläche ${s.w * s.h} ${p.unit}², Umfang ${2 * (s.w + s.h)} ${p.unit}.${p.perimeter ? ` Der Umfang bleibt ${p.perimeter} ${p.unit}.` : ''}`, `Rectangle ${s.w} × ${s.h} ${p.unit}: area ${s.w * s.h} ${p.unit}², perimeter ${2 * (s.w + s.h)} ${p.unit}.${p.perimeter ? ` Perimeter stays ${p.perimeter} ${p.unit}.` : ''}`);
  },
  validateState: (s, p) => (s.w >= 1 && s.h >= 1 && s.w <= p.maxW && s.h <= p.maxH && (!p.perimeter || 2 * (s.w + s.h) === p.perimeter) ? [] : ['rect out of range']),
  lint(p, _a, locale) {
    const issues: LintIssue[] = [];
    if (p.perimeter && (p.perimeter % 2 !== 0 || p.perimeter / 2 - 1 > p.maxW + p.maxH)) issues.push({ level: 'error', code: 'rect.perimeter', message: t(locale, 'Der feste Umfang passt nicht ins Raster.', 'Fixed perimeter does not fit the grid.') });
    return issues;
  },
};
