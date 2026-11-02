# P0-brand-marks: ProgramMark brand logos (Lobe icons, MIT) with react-native-svg and a brands token file
status: done
branch: worktree-wf_40a85a5f-46a-21
changed: packages/core/src/programs.ts (+test, exported from index), packages/ui/src/primitives/ProgramLogo.tsx (new), ProgramMark.tsx (logo from `program`, no `logo` prop), packages/ui/src/theme/programTint.ts (+test), brands.generated.ts (generated), packages/ui/tokens/brands.json, packages/ui/scripts/gen-brands.mjs (hooked into `gen` and `gen:check`), packages/ui/assets/program-logos/*.svg + NOTICE-lobe-icons.txt, THIRD_PARTY_NOTICES.md, gallery ProgramMark specimen (all kinds), two existing tests moved to a monogram program; package.json of ui (react-native-svg 15.16.0, core workspace dep) and apps/mobile (react-native-svg), pnpm-lock.yaml
tests: core `vitest run src/programs.test.ts` → 11/11; ui `pnpm exec jest` → 110+ passing (new: programTint.test, ProgramMark.test); `pnpm verify-fast` green
acceptance:
- react-native-svg added with `npx expo install` (15.16.0): met. NATIVE: the integrator must rebuild native.
- brand colors in a token JSON (hex banned in source): met. `tokens/brands.json` → generated `brands.generated.ts` (colors + SVG path data per brand); the theme-literal rule passes.
- all 19 Swift brands, program resolution ported with the Swift test cases (kinds, aliases, executables, unknown, blank): met in core `programIdentity`.
- tint contrast floor 3:1 on every surface in every theme, black marks reversed, light themes darken: met (programTint.test, ported from AgentProgramIdentityTests).
- monogram fallback for programs with no logo (omp, droid, maki, muse, letta, unknown): met.
- status dot cut into the logo's corner (SVG mask), ring kept only for the monogram, shaped glyph beside the mark at accessibility sizes: met (ProgramMark.test, statusShape.test).
- licenses notice: met (THIRD_PARTY_NOTICES.md + the MIT text and icon list beside the SVGs).
- prebuild --clean + one build per platform with gallery screenshot: met on both: iOS (agentico-app iPhone 17 Pro, ios-marks-indigo.png) and Android (Pixel_3a, android-marks-indigo.png) show all 24 kinds with a done dot cut into the corner; both builds succeeded after `expo prebuild --clean`.
evidence: /private/tmp/claude-501/-Users-eaprules/96b69bbe-4c3e-4245-9ae5-f3863fee18ff/scratchpad/rn/evidence/brand-marks/
left:
- Wire real callers (Home rows, drawer, header, switcher, Usage) to pass `program` as herdr reports it; they get logos for free.
- Swift's `foreground` override and `scalesWithText` are not ported (no caller needs them yet).
notes:
- `ProgramMark` now resolves the brand itself through core's `programIdentity`; `packages/ui` depends on `@openagentspocket/core` for it.
- The mask id comes from `useId`, so several marks in one tree do not share a mask.
- Maestro `takeScreenshot` refuses paths outside its folder; used `xcrun simctl io screenshot` instead.
