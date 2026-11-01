# P0-ui-primitives: The shared component set (§3, ~24) + a component gallery route
status: partial
branch: worktree-wf_720cceaa-aa8-6
changed: packages/ui/src/** (theme helpers, 30 primitives in primitives/, form/, overlay/, markdown/, diff/, terminal/, keys/, composer/, gallery/), packages/ui/README.md, packages/ui/package.json, packages/ui/jest.config.js, apps/mobile/src/app/__gallery.tsx; outside the file set (small): apps/mobile/src/app/_layout.tsx (mounts OverlayHost), apps/mobile/jest.config.js (ESM transform for FlashList and marked), apps/mobile/package.json (expo-clipboard for autolinking), pnpm-lock.yaml
tests: `cd packages/ui && pnpm exec jest` → 85/85 (8 suites); `cd apps/mobile && pnpm exec jest` → 1/1; `pnpm verify-fast` green
acceptance:
- §3 primitives with themes Índigo/Papel/Noche: met for 1-21, 23, 24 (list below). The gallery test renders every specimen in all three themes and checks the canvas color per theme; per-primitive tests pin token colors in more than one theme (StatusPill, Card, Banner, ProgramMark).
- accessibility labels: met. Buttons have names (icon-only buttons require `accessibilityLabel` by type), icons are hidden unless labeled, ListRow swipe and menu actions are also accessibility actions, Meter is a progressbar with a value, StepperRow is adjustable, SkeletonRows is one busy progressbar, alerts and sheets mark `accessibilityViewIsModal`, toasts announce.
- component tests: met, jest-expo + RNTL, 85 tests in primitives.test, rows.test, feedback.test, form.test, overlay.test, content.test, theme.test, Gallery.test.
- one confirm() for alerts: met. `confirm({ title, confirmLabel, destructive })` resolves a boolean, `confirm({ title, actions })` a key or null; alert (centered) and dialog (action sheet) presentations; a queue shows one at a time; no host mounted answers cancel with a warning.
- one Sheet: met (medium/large/fit detents, grabber, title, close, backdrop, Android back, keyboard avoiding, footer).
- one ActionMenu: met (anchored popover from `ActionMenuButton`, centered otherwise; checked/disabled/destructive items; the item runs after the menu closes so an alert can follow on iOS). ListRow long-press and PickerRow and Composer's add menu all use it.
- gallery route renders all of them: met. `apps/mobile/src/app/__gallery.tsx` → `<Gallery>` from packages/ui (9 sections, 31 specimens, theme chips, section filter, `?theme=` and `?section=` params, its own OverlayHost).
- not met: §3.22 TerminalView renderer (only the contract and a plain-text fallback, see left), §3 "plus QRScanner".

Primitive map (§3 number → export):
1 ThemeProvider/useTheme (+ `theme.status()`, `tone()`, `wash()`, `backdrop`; metrics chipRadius, sheetRadius, washOpacity, readableWidth) · 2 Screen (safe area, readable column, scroll, pull to refresh) · 3 Card (surface/overlay, accent outline, long press) · 4 ListRow (+ SwipeRow) · 5 Section (+ SectionHeader with action, DisclosureChevron, collapsible) · 6 StatusDot · 7 Badge (accent/control/outline), StatusPill · 8 Chip, ChipRow · 9 ProgramMark · 10 EmptyState, SkeletonRows/Skeleton, ErrorState · 11 Sheet · 12 confirm() + AlertHost (in OverlayHost) · 13 ActionMenu, ActionMenuButton · 14 Button (primary, secondary, destructive, text, capsule, icon-only, small, loading), CopyButton, CopyableValueRow · 15 TextField, ToggleRow, PickerRow, StepperRow, NavRow · 16 Banner · 17 toast() + ToastHost (InAppBanner via `leading`) · 18 Meter (80/95 thresholds, pace tick), BarChart · 19 VirtualList, VirtualSectionList (FlashList v2) · 20 Markdown (marked lexer → themed RN), CodeBlock · 21 DiffView (unified/split) + parseUnifiedDiff/toSideBySide · 22 TerminalView contract + text fallback · 23 KeyRow, KeyboardDock (sticky Ctrl/Alt) · 24 Composer (+ composerAction). Extra: Icon (semantic names → SF Symbols / Material Symbols via expo-symbols).
left:
- P3.0 follow-up: TerminalView's real renderer (libghostty or xterm.js WebView) behind the same props and `TerminalHandle` (write/clear/focus, onInput/onResize). The fallback strips escapes and has no cursor addressing.
- QRScanner (§3 "plus", used once by pairing): needs expo-camera and the camera permission in app.json, which is integrator-only; proposed as its own small native task feeding the hosts/pairing UI.
- None of the missing pieces is needed by the tasks that wait on this one (hosts UI needs only QRScanner for the scan path; agents list, inbox, chat UI, usage and settings need none), so the lead can treat the shipped subset as done for scheduling.
- New task (small): ProgramMark brand logos (Lobe icons, MIT) and brand colors; needs react-native-svg (native) and a brands token file, since the theme-literal rule bans hex in source. Today it draws a neutral monogram and takes a `logo` slot.
- New task (small): native menus (`@expo/ui` ContextMenu) inside ActionMenu, keeping its props; and drag-to-resize detents for Sheet.
- P4.1 may swap BarChart to gifted-charts (ADR 0013) if it needs axes or tooltips; today it is plain Views, no native dep.
- Integrator: one native rebuild (expo-clipboard was added); until then copy buttons fail quietly (lazy require) instead of crashing. Then a Maestro screenshot pass over `/__gallery?theme=<id>&section=<id>`.
notes:
- Dependencies added: packages/ui: `expo-symbols ~58.0.4` (already native in the app), `expo-clipboard ~58.0.4` (native, new), `@shopify/flash-list 2.3.2` (JS only), `marked ^18.1.2` (JS only, MIT). apps/mobile: `expo-clipboard` via `npx expo install` (autolinking).
- FlashList and marked ship ESM: both jest configs extend jest-expo's transformIgnorePatterns; any new package with jest tests that imports `@agentico/ui` needs the same.
- Overlay hosts form a stack: the most recently mounted OverlayHost presents. Sheet mounts its own while open (iOS cannot present a root-level modal over another modal); the gallery mounts its own to draw in its theme.
- Button drops a promise returned by `onPress`, so `onPress={() => confirm(...)}` does not deadlock RNTL's awaited `fireEvent.press` (it awaits the handler's result).
- RNTL 14: `toBeChecked` only accepts checkbox/radio/switch; menu items and modifier keys also set `selected`, which tests query.
- `Markdown` takes `text`, not children (biome's noReactNativeRawText flags string children).
- SectionHeader's count badge now uses the control style (Swift's CapsuleBadge .control); Home shows it that way.
- Strings a primitive owns are props with English defaults (Cancel, OK, Close, Copied, Send, Stop, Loading), ready for the i18n task to pass translations.
