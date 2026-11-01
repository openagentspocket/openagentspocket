# 0015. Vitest for core, jest-expo + RNTL for UI, Maestro for E2E

Status: accepted (2026-11-01)

## Decision

Pure logic runs in Vitest (no React Native). Components and screens use jest-expo and React Native Testing Library. Maestro drives one iOS simulator and one Android emulator. Tests pin behavior, never copy. Golden JSON exported from the Swift parsers diff-tests the TS ports.

## Why

Cheap tests where possible, real devices only for flows.
