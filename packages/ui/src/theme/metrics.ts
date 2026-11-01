const BASE = 4;
const SCALE = 1.3;
const step = (multiple: number) => Math.round(BASE * multiple * SCALE);

/** 4-pt base scaled by 1.3 (airy density): 5, 10, 16, 21, 31, 42. */
export const spacing = {
  xxs: step(1),
  xs: step(2),
  sm: step(3),
  md: step(4),
  lg: step(6),
  xl: step(8),
} as const;

export const metrics = {
  screenInset: 21,
  cardRadius: 8,
  hairlineWidth: 1,
  /** Share of the primary text color used for card borders. */
  hairlineOpacity: 0.16,
  minTapSize: 44,
} as const;

export type SpacingKey = keyof typeof spacing;
