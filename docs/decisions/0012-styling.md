# 0012. Plain StyleSheet with a theme hook

Status: accepted (2026-11-01)

## Decision

`useTheme()` plus a tiny `makeStyles(theme => ...)` helper over generated tokens. No Unistyles, NativeWind or Tamagui.

## Why

Fewest dependencies and no extra native module; tokens stay type-checked.
