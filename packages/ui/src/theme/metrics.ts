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

/**
 * The x1.3 map for the Swift views' off-scale literals (docs/ux/design-system.md section 3).
 * Type, glyphs, tap targets, strokes and the usage ring are never scaled.
 */
export const airy = {
  /** Host card padding, banner horizontal padding (14). */
  card: 18,
  /** Gap before a Home section (20). */
  sectionGap: 26,
  /** Banner and session tile vertical padding (10). */
  tile: 13,
  /** Stack spacing in rows and the composer, badge horizontal padding (6). */
  stack: 8,
  /** Chip vertical padding, tiny gaps (3). */
  chipV: 4,
  /** Badge vertical padding (2). */
  badgeV: 3,
  /** Title-to-subtitle gap, a glyph's nudge onto the first line, thin insets (1-2). Not scaled. */
  line: 2,
  /** List row top and bottom inset (4). */
  rowInset: 5,
  /** Status dot diameters: list rows (8) and the status line (7). Not scaled. */
  dot: 8,
  statusLineDot: 7,
} as const;

/**
 * The one corner scale, in the current iOS look (large, continuous corners; `rounded()` adds the
 * continuous curve). A shape nested in another steps down: its radius is about the outer radius minus
 * the inset between them, never larger. `scripts/check-radius-literals.mjs` rejects any other number.
 */
export const radius = {
  /** Tiny shapes: legend swatches, meter segments, icon bubbles under 20 pt, text placeholders. */
  mark: 4,
  /** Chips, small tags and tiles, inline code, keys. */
  chip: 8,
  /** Control size, alone or inside a card: buttons, inputs, code blocks, thumbnails, menus, rows. */
  control: 12,
  /** Cards, grouped panels, banners, toasts, bubbles. */
  card: 20,
  /** Top corners of a sheet (iOS 26 style), alerts and the drawer; the native form sheet too. */
  sheet: 28,
  /** Fully rounded: pills, capsules, round buttons and dots. */
  capsule: 999,
} as const;

export type RadiusKey = keyof typeof radius;

export const metrics = {
  screenInset: 21,
  /** A sheet is never shorter than this share of the window, nor taller than the max one. */
  sheetMinShare: 0.3,
  sheetMaxShare: 0.92,
  sheetGrabberWidth: 36,
  sheetGrabberHeight: 5,
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
  /**
   * How far a bottom bar reaches into the home indicator's safe strip on iOS: with the usual 34 pt
   * strip its edge lands 20 pt from the bottom, where iOS's own floating bars sit, clear of the
   * indicator (about 8 pt from the bottom, 5 pt tall).
   */
  homeIndicatorOverlap: 14,
  /** Airy grouped-row minimum height: 44 x1.3, rounded. */
  rowMinHeight: 56,
  /** Swift ScreenBackground: glow radius and height in points. */
  glowSize: 320,
  /** Share of the glow color painted at the top edge. */
  glowOpacity: 0.55,
  /** Widest a reading column grows on tablets and landscape. */
  readableWidth: 720,
} as const;

export type SpacingKey = keyof typeof spacing;
