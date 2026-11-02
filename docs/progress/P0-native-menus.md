# P0-native-menus: ActionMenuButton on native iOS menus; Sheet drag-to-resize detents
status: done
branch: worktree-wf_295a71f2-503-10
changed: packages/ui/src/overlay/{ActionMenu,Sheet}.tsx (edited), new NativeActionMenu.tsx, sheetDetents.ts + sheetDetents.test.ts, overlay.test.tsx, primitives/Icon.tsx (iconSymbol), packages/ui/package.json (@expo/ui ~58.0.26, same version as apps/mobile), pnpm-lock.yaml
tests: `pnpm verify-fast` green (ui related suites 111 tests).
acceptance:
- ActionMenuButton uses @expo/ui SwiftUI Host+Menu on iOS with the same props and a JS fallback (Android, web, tests, `native={false}`): met. Items map to Button (label, SF symbol, destructive role, checkmark for `checked`). Evidence: overlay.test.tsx (native path renders the system menu; JS path unchanged for existing callers).
- ActionMenu (controlled `visible` + `anchor`): kept as the JS menu. A SwiftUI Menu cannot be opened programmatically, so the controlled form cannot be native; callers using it stay JS.
- Sheet drag-to-resize detents: met. Dragging the grabber area up grows medium to large, down shrinks large to medium, down from medium or fit closes; short slow drags snap back, flicks count. Pure `settleDetent` pinned in sheetDetents.test.ts.
- Gallery: ActionMenu and Sheet specimens already exist and now show both behaviors.
left:
- Integrator: rebuild native (apps/mobile already had @expo/ui, so likely no prebuild change) and check the menu and sheet drag on the simulator.
- P-menu-android: Jetpack Compose menu via @expo/ui/jetpack-compose for Android.
- P-menu-controlled-native: move controlled ActionMenu callers (context menus with anchors) to trigger-wrapping native menus.
notes:
- Sheet height during drag is live via PanResponder state (no Reanimated); not visually verified on a device.
