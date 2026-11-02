# UX1-agent-detail: assemble Agent detail from the cloned components
status: partial
branch: worktree-wf_7d8339f1-ab3-3
changed: apps/mobile/src/agent-detail (AgentDetailScreen, AgentHeader, AgentSwitcher, AgentSessionDrawer, agentBarLabels, chat/{ChatTimeline,ChatRowView,ChatBanners,useChatRows,chatRowModel}, composer/AgentComposer), apps/mobile/src/blocked (BlockedCard header/options, BlockedCardSlot override, dialogModel), apps/mobile/src/app/agent/[hostId]/[paneId].tsx (no stack header), apps/mobile/src/dev/atlas (agentDetailEntries, atlasChat, atlasBlocked, 43 agent-detail ids), packages/ui (EdgeFade primitive, ChatUserBubble control fill), packages/i18n extras (6 keys), e2e/live.yaml (agent-header-more)
tests: pnpm verify-fast green; apps/mobile jest src/agent-detail src/blocked src/dev all passing (chat timeline fold test added)
acceptance:
- No stack header; floating [Sessions] circle and "..." circle, title block on the terminal surface: met (Swift chat shows circles only; folded variant not built)
- Bottom stack status line, composer card, switcher capsule: met; trailing controls are only the Chat/Terminal switch (hide composer and keyboard toggles not built)
- Switcher chip logo + status dot, tap switches in place: met; long-press pin not built
- Program-logo toggle in the composer row flips Chat/Terminal; header menu also offers Show Chat / Show Terminal; old Chat/Terminal chips removed: met (testID surface-toggle)
- Blocked card replaces nothing but sits in the dock above the status line: partly met. Hand glyph header with chevron, question + mono block, lead option solid accent, "Saves a rule" warning, No as danger wash, outline in the blocked color. Add a Note and the "1 running" background strip are not built (no engine for them in RN yet)
- Chat: user bubble right on control fill, flat markdown answers, compact tool rows with Waiting/Exit state, Worked for / Thought for disclosure rows, compaction divider, Working for ticker, reading column 720: met via core projectTimeline folds
- Status line: status + latency only; branch, counts and diff totals need Host git data the Console row does not carry: not met (left)
- Terminal toolbar capsule above the keyboard: kept the engine-wired toolbar, skinned with surfaceOverlay + hairline; KeyPad dock unchanged: partly met
- Session drawer from the Sessions circle: met (this Host's Workspaces with their Agents, search); Tree/Agents toggle is the UI component's, Agents view not wired
- Banners connecting / not connected / couldn't read with Retry or Show Agent Terminal: met (ChatBanners from core bannerLines)
- Timings (composer fold 200 ms, overlay 280 ms): not built
evidence: scratchpad rn/evidence/UX1-agent-detail (Swift | RN sheets, dark and Papel, captured after the last code commit on a cleared Metro cache, port 8721)
left:
- Status line branch/counts/diff and context-left need Console row git facts (new task: surface checkout branch and diff totals on ConsoleRow).
- Chat composer fold, hide/show composer, keyboard-type switch, long-press pin, Add a Note, Background Work strip, subagent transcript sheet, select-text sheet.
- Atlas ids with no RN state yet render the nearest screen and are marked KNOWN GAP in atlasMap.json (chat-banners, chat-background-*, chat-tools-keyboard, subagent-transcript, select-text-sheet, composer-more-menu, skills/snippets panes, terminal-appearance-pane, terminal-status-overlay, attach-links, close-confirm, open-terminal-chooser, skills-picker, snippets-manager, snippet-editor, shell-close-confirm, shell-keys-dock).
- iOS pass (glass, keyboard avoidance, header safe area) not done: integrator only.
notes:
- Demo conversation for the atlas and the Blocked card come from dev/atlas/atlasChat.tsx and atlasBlocked.tsx (a scripted ConversationStore and a BlockedCardOverride context); the live path is unchanged.
- The route owns the header menu items (Changes, Ports, New Agent) and passes them in as `menu`; the screen adds Show Chat / Show Terminal. Maestro: live.yaml now taps agent-header-more.
- testIDs changed: surface-chat/surface-terminal removed (use surface-toggle or the menu), switch-<pane> kept (container agent-switcher), composer-input/send/stop kept, agent-more-menu -> agent-header-more.
- Chat follows new rows only while the reader is at the end (touch drag leaves, drag end returns).
