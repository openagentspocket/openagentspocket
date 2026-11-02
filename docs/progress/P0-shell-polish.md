# P0-shell-polish: status bar, native headers, brand copy and spacing fixes from the wave-2 native check
status: done
branch: worktree-wf_13f28540-ff4-4
changed: apps/mobile/src/navigation/{screenOptions,useStackScreenOptions}.ts (+test), apps/mobile/src/app/_layout.tsx (themed StatusBar, AppStack with a title per route), changes/hosts/ports `_layout.tsx` (shared options), SettingsScreen/LicenseNoticeScreen (dropped `headerShown` hacks), UsageScreen/LimitsScreen (in-screen title removed, the header has it; one test retargeted), packages/i18n/scripts/xcstrings.mjs (+d.mts, `brand`), regenerated catalogs, sync.test.ts, convert.test.ts, CustomRelaySection, ChangedFileRow, ui CopyButton (CopyableValueRow slot)
tests: i18n suite green with AGENTICO_SWIFT_DIR (sync tests pin Swift source through `brand`); `pnpm verify-fast` green
acceptance:
- status bar follows the theme (light on Indigo/Noche, dark on Papel): met (`statusBarStyle`, tested per theme).
- one header options object from tokens for every Stack, opaque (`headerTransparent: false`, no blur), title/tint/background from tokens: met (`stackScreenOptions`, tested for all themes). Back titles: every root route declares its title in AppStack, so no route name is shown. NOT verified on device (no native run by agents).
- brand copy: met. Converter replaces the whole word `Agentico` with `OpenAgentsPocket` in values only (keys stay Swift's); sync test applies the same `brand` to the Swift side.
- relay field padding, Changes kind badge width and delta column, gallery copy row slot: met in code; not looked at on device.
left:
- Integrator: re-shoot ios-changes, ios-notifications, ios-settings, ios-gallery3 to confirm. If the renamed-row subtitle still wraps ("From sum.ts · src/ cart"), shorten the delta text or let the subtitle take the full row width.
- Native header title lives in AppStack; new routes must be added there (else the back title falls back to the route name).
