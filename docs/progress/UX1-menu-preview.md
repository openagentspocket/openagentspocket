# UX1-menu-preview: ActionMenu lifted card preview
status: partial
branch: worktree branch
changed: packages/ui/src/overlay/{ActionMenu,LiftedMenu,NativeActionMenu,dismiss}, overlay.test.tsx, components/{AgentCard,AgentRowMenu}.tsx, gallery/components/agentRows.tsx
tests: pnpm verify-fast -> ui related tests 19/19 suites pass; biome fails only on pre-existing BlockedCard.tsx:213 (noUselessFragments, not touched here)
acceptance:
- ActionMenu `preview` prop (+ `inline`): lifted card at card width above the menu, popover fallback: met (LiftedMenu, shared with AgentRowMenu)
- Native NativePreviewMenu (@expo/ui ContextMenu Trigger/Preview/Items) when the module exposes ContextMenu: met in JS, unit-tested with fakes; NOT verified on device
- AgentCard `menuPresentation: 'lifted' | 'native'` prop (default lifted): met
- Gallery AgentRowMenu variant `action-menu-preview`: added; visual compare vs ref crops not run
left: device check of native ContextMenu (a SwiftUI Host around the swipeable row may swallow RN tap/swipe, hence default lifted); run ux-components compare; fix BlockedCard biome error
notes: AgentRowMenu is now a thin haptic wrapper over overlay/LiftedMenu.
