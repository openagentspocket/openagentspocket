# UX3-composer-extras: Clone SkillsKeyboardPane, SkillContentSheet, ComposerStagingStatusBar, ClaudeSubagentTranscript
status: done
branch: worktree-wf_ec0a968a-c0f-17
changed: packages/ui/src/components/{SkillsKeyboardPane,SkillContentSheet,ComposerStagingStatusBar,ClaudeSubagentTranscript}.tsx, composerExtras.ts, composerExtras.test.tsx, packages/ui/src/gallery/components/composerExtras.tsx, packages/ui/src/primitives/Icon.tsx (new icons: eye, grid, quote, palette, document)
tests: pnpm verify-fast → green (packages/ui related suites 14/14)
acceptance:
- components implemented with catalog variants (default plus list/loading/failed/empty/done): met
- gallery entries Indigo and Papel: met (registered in composerExtras.tsx)
- compare sheets for the two crops (SkillsKeyboardPane, ClaudeSubagentTranscript): structure matches (list/empty text, Refresh row with hairline above switcher, back capsule, read-only hint, bubble, assistant text, tool row). Sheets in scratchpad rn/evidence/UX3-composer-extras/. Light (--theme light) sheet not captured.
- SkillContentSheet and ComposerStagingStatusBar have no crop: judged against their Swift files (Done trailing, mono footnote body, Retry; label row with icon plus right-aligned small bordered commands, top hairline)
- tests pin interactions: met; no screen files touched
left: Papel compare sheet pass; real Chat* rows (ChatUserBubble, ChatToolRow) to replace the local SubagentRow rendering once UX3-chat-rows merges; i18n of the default English labels is done by callers via the labels props
notes: ui does not import i18n, so every component takes label props with English defaults. SkillsKeyboardPane height defaults to 234 (crop) and should be the keyboard height in the app.
