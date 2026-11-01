# agentico-ssh

Expo Module for the six SSH primitives (see `src/types.ts`). **No native code yet**:
the SSH spike (roadmap phase 1) adds `ios/`, `android/` and `expo-module.config.json`.
Until then this package is TypeScript only: the interface and `FakeSsh`, a fake for tests.
It is deliberately not a dependency of `apps/mobile`, so autolinking ignores it.
