# 0020. Native code is rebuilt in batches; ios/ and android/ are generated

Status: accepted (2026-11-01)

## Decision

`ios/` and `android/` are Continuous Native Generation output, gitignored. Agents work in JS against a shared dev client; a fingerprint guard says when a change needs a native rebuild. At most one native build, two Metro servers, one simulator and one emulator at a time.

## Why

Cold native builds and parallel simulators overload a laptop.
