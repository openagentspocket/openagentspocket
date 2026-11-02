import type { ProgramBrand } from '@openagentspocket/core';
import { brandColors } from './brands.generated';
import type { ThemeTokens } from './tokens.generated';

/** Marks follow the theme's floor for status and accent colors: 3:1. */
export const MARK_CONTRAST_FLOOR = 3;

type Rgb = [number, number, number];

function parse(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function format(rgb: Rgb): string {
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two #RRGGBB colors. */
export function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Black, white or a gray: a mark in such a color is drawn reversed rather than tinted. */
export function isAchromatic(hex: string): boolean {
  const channels = parse(hex);
  return (Math.max(...channels) - Math.min(...channels)) / 255 < 0.1;
}

/** `from` mixed `fraction` (0..1) of the way to `to`. */
export function mixed(from: string, to: string, fraction: number): string {
  const [a, b] = [parse(from), parse(to)];
  return format(a.map((c, i) => Math.round(c + ((b[i] ?? c) - c) * fraction)) as Rgb);
}

/** The color itself, or the first 5% step toward `target` that reaches `floor` on every surface. */
export function raisedToContrast(
  hex: string,
  floor: number,
  surfaces: readonly string[],
  target: string,
): string {
  for (let step = 0; step <= 20; step++) {
    const candidate = mixed(hex, target, step / 20);
    if (surfaces.every((surface) => contrast(candidate, surface) >= floor)) return candidate;
  }
  return target;
}

/** Every fill a mark is drawn on: screen, cards, drawers, controls and a selected row. */
export function markSurfaces(theme: Pick<ThemeTokens, 'colors'>): string[] {
  const c = theme.colors;
  return [c.canvas, c.surface, c.surfaceRaised, c.surfaceOverlay, c.control, c.accentContainer];
}

/**
 * The color a brand mark is drawn in on `theme`: the brand's hue, lightened (darkened on a light
 * theme) just enough to clear the 3:1 floor on every surface. A black or white brand mark is
 * drawn reversed in the primary text color, as brand kits do; no brand takes the secondary color.
 */
export function programTint(brand: ProgramBrand | undefined, theme: ThemeTokens): string {
  if (!brand) return theme.colors.textSecondary;
  const color = brandColors[brand];
  if (isAchromatic(color)) return theme.colors.textPrimary;
  const toward = format(theme.appearance === 'dark' ? [255, 255, 255] : [0, 0, 0]);
  return raisedToContrast(color, MARK_CONTRAST_FLOOR, markSurfaces(theme), toward);
}
