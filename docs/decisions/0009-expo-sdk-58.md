# 0009. Expo SDK 58, New Architecture only, Expo Router

Status: accepted (2026-11-01)

## Decision

Expo SDK 58 (React Native 0.88.1, React 19.3.0), Expo Router with typed routes, TypeScript strict. react, react-dom and react-native are pinned once through `pnpm-workspace.yaml` overrides.

## Why

Newest SDK; one version of each core library avoids duplicate-React bugs in a monorepo.
