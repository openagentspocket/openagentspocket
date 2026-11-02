# UX1-menu-preview: ActionMenu lifted card preview
status: done
branch: worktree branch
changed: packages/ui/src/overlay/{ActionMenu,LiftedMenu,NativeActionMenu,dismiss}, overlay.test.tsx, components/{AgentCard,AgentRowMenu}.tsx, gallery/components/agentRows.tsx
tests: pnpm verify-fast green (biome clean: Slot components hoisted in overlay.test.tsx, LiftedMenu onOpen read through a ref)
acceptance:
- ActionMenu `preview` prop (+ `inline`): lifted card at card width above the menu, popover fallback: met (LiftedMenu, shared with AgentRowMenu)
- Native NativePreviewMenu (@expo/ui ContextMenu Trigger/Preview/Items) when the module exposes ContextMenu: met in JS, unit-tested with fakes; NOT verified on device
- AgentCard `menuPresentation: 'lifted' | 'native'` prop (default lifted): met
- Gallery AgentRowMenu variant `action-menu-preview`: added; visual compare run (ux-components.mjs AgentRowMenu, atlas-compare.py --components): lifted card above a raised menu, accent icons, red destructive under a divider match the Swift structure; Swift's blur/glass material and wider menu are not reproduced (skin differs by design). Sheet: design/atlas/components/compare/AgentRowMenu.png (gitignored)
left: device check of native ContextMenu (not run, no native build in this task)
risk: the native path (menuPresentation='native') wraps the swipeable row in a SwiftUI Host ContextMenu, which may swallow RN tap/swipe. Lifted stays the default; do not flip the default until a device/Maestro check on the swipeable row passes.
notes: AgentRowMenu is a thin haptic wrapper over overlay/LiftedMenu.
