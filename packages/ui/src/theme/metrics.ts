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
  /** Chips and the capsule-less badges. */
  chipRadius: 6,
  /** Top corners of a sheet. */
  sheetRadius: 16,
  hairlineWidth: 1,
  /** Share of the primary text color used for card borders. */
  hairlineOpacity: 0.16,
  /** Share of a status or tone color washed under its own ink (pills, banners, diff lines). */
  washOpacity: 0.15,
  /** Outline of a card that asks for attention. */
  accentOutlineOpacity: 0.4,
  /** Dimmed backdrop (the theme's scrim ink) behind sheets, menus and alerts. */
  backdropOpacity: 0.45,
  /**
   * Font scale above which text sizes count as accessibility sizes: between iOS's largest
   * standard size (xxxLarge, 1.353) and its first accessibility size (AX1, 1.786), and
   * between Android's 1.3 and 1.5 steps.
   */
  accessibilityFontScale: 1.4,
  minTapSize: 44,
  /** Widest a reading column grows on tablets and landscape. */
  readableWidth: 720,
} as const;

export type SpacingKey = keyof typeof spacing;
