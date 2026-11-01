# 0007. Visual direction: Índigo, Papel, Noche

Status: accepted (2026-11-01)

## Decision

Themes are tokens in one JSON each (`packages/ui/tokens/themes`): Índigo (dark, default; accent #8E7CFF), Papel (light, paper canvas, deepened indigo accent), Noche (optional; true black, green accent). Cards: radius 8 with a 1 pt hairline at 16% of the primary text color. System font. Airy density: spacing 4-pt base times 1.3, screen inset 21. No color literal outside the tokens (enforced by `scripts/check-theme-literals.mjs`).

## Why

One source of truth for color; the grep rule keeps agents from drifting.
