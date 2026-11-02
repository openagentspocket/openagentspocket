# UX3-agent-bar: Clone AgentHeader, AgentSwitcher, SessionDrawer, ComposerCard, StatusLine, ChangeRow
status: done
branch: worktree-wf_ec0a968a-c0f-4
changed: packages/ui/src/components/{AgentHeader,AgentSwitcher,SessionDrawer,ComposerCard,StatusLine,ChangeRow}.tsx, agentBarLabels.ts, agentBar.ts, agentBar.test.tsx; packages/ui/src/gallery/components/agentBar.tsx; packages/ui/src/primitives/Icon.tsx (6 new icons: sidebar, branch, keysDock, tools, people, list)
tests: pnpm jest packages/ui/src/components/agentBar.test.tsx → 9/9
acceptance:
- each component per catalog, Indigo and Papel in the gallery, side-by-side sheets: met (sheets in the scratchpad evidence/UX3-agent-bar)
- component tests pin interactions (drawer open, switch + toggles, fold/search/select/close, send/stop/skills/more, status tap and context pill, file and summary press): met
- no apps/mobile files touched: met
- owns composer/**: ComposerCard reuses `composerAction` from composer/Composer.tsx; Composer.tsx left in place so the current agent-detail screen compiles
left: UX1-agent-detail swaps Composer for ComposerCard (pass `leading` ProgramMark, `addMenu`, `moreMenu`, `skills`) and wires labels from t(); SessionDrawer edge-swipe and swipe-left close are the screen's gesture layer (the modal closes from the scrim and onRequestClose)
notes: strings come in through an `AgentBarLabels` prop with English defaults (same pattern as the QR scanner labels; packages/ui does not import i18n). AgentHeader/AgentSwitcher glass is GlassCapsule (liquid glass on iOS 26, tokens fallback elsewhere). The Swift crops are wider than the 402 stage, so file names and the status line truncate sooner on web.
