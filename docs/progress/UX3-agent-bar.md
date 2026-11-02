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
notes: strings come in through an `AgentBarLabels` prop with English defaults (same pattern as the QR scanner labels; packages/ui does not import i18n). AgentHeader/AgentSwitcher glass is GlassCapsule (liquid glass on iOS 26, tokens fallback elsewhere). Review fixes: ComposerCard re-captured (Indigo, Papel, expanded, skills all render; input text now vertically centered with 22pt line height and 40pt min height). Papel sheets compared against ref/*.light.png for all six components (evidence in scratchpad rn/evidence/UX3-agent-bar/light). Truncation tuned for the 402 stage: ChangeRow file name never shrinks (the dir gives way first) with tighter gaps and padding; StatusLine uses caption2 for the mono parts, tighter gaps, and drops the latency under 340 pt so the branch shows in full; SessionDrawer host row and search field fit ('2 shells', full placeholder), the branch line sits tight under the workspace title. Note: Metro on web does not see edits inside .claude/worktrees; restart the dev server (or let ux-components.mjs start its own) before capturing.
