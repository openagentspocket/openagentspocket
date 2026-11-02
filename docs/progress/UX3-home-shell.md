# UX3-home-shell: Clone InboxCard, SessionsStrip, HomeHostCard, UsageRing, Fab, LargeTitleBar
status: done
branch: worktree-wf_ec0a968a-c0f-3
changed: packages/ui/src/components/{InboxCard,SessionsStrip,HomeHostCard,UsageRing,Fab,LargeTitleBar}.tsx, homeShell.ts, homeShell.test.tsx, packages/ui/src/gallery/components/homeShell.tsx
tests: pnpm --filter ui jest src/components/homeShell.test.tsx → 10/10
acceptance:
- components per catalog, gallery variants (InboxCard default/working, others default), Indigo and Papel: met (compare sheets reviewed)
- tests pin interactions (tap, long press, selection, menu, hidden, a11y labels): met; no screen files touched
left: UX1 assembly adopts the components; HomeHostCard glyph is the server icon (Swift uses a key glyph; no key icon in Icon set); middle ellipsis does not render on web (works natively); UsageRing glass capsule tint is the fallback on web
notes: strings arrive as props (ui does not import i18n); callers localize. overlay.test ActionMenuButton was flaky once under load, passes alone.
