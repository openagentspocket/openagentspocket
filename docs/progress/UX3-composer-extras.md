# UX3-composer-extras: Clone SkillsKeyboardPane, SkillContentSheet, ComposerStagingStatusBar, ClaudeSubagentTranscript
status: done
branch: worktree-wf_ec0a968a-c0f-17
changed: packages/ui/src/components/{SkillsKeyboardPane,SkillContentSheet,ComposerStagingStatusBar,ClaudeSubagentTranscript}.tsx, composerExtras.ts, composerExtras.test.tsx, packages/ui/src/gallery/components/composerExtras.tsx, packages/ui/src/primitives/Icon.tsx (new icons: eye, grid, quote, palette, document)
tests: pnpm verify-fast → green (packages/ui related suites 14/14)
acceptance:
- components implemented with catalog variants (default plus list/loading/failed/empty/done): met
- gallery entries Indigo and Papel: met (registered in composerExtras.tsx)
- compare sheets for the two crops (SkillsKeyboardPane, ClaudeSubagentTranscript): structure matches (list/empty text, Refresh row with hairline above switcher, back capsule, read-only hint, bubble, assistant text, tool row). Sheets in scratchpad rn/evidence/UX3-composer-extras/. Papel captured (RN Papel column of the sheets plus *.gallery.papel.png); evidence in docs/progress/evidence/UX3-composer-extras/.
- SkillContentSheet and ComposerStagingStatusBar have no crop: judged against their Swift files (Done trailing, mono footnote body, Retry; label row with icon plus right-aligned small bordered commands, top hairline)
- tests pin interactions: met; no screen files touched
left: nothing visual. Known: ChatUserBubble Papel bubble is whiter and larger than Swift's (owned by UX3-chat-rows); Skills tab quote icon is a plain bubble on web (iOS uses quote.bubble); i18n of the default English labels is done by callers via the labels props
notes: ui does not import i18n, so every component takes label props with English defaults. SkillsKeyboardPane height defaults to 234 (crop) and should be the keyboard height in the app.
review fixes:
- back button: new Icon chevronLeft (chevron.left), used by ClaudeSubagentTranscript; bar vertical padding reduced (spacing.xxs) so the header is not taller than the crop
- Papel: captured with ux-components.mjs --theme both; light variants checked (indigo accent, surfaces, hairlines read right)
- SkillContentSheet / ComposerStagingStatusBar: gallery screenshots (Indigo and Papel) in docs/progress/evidence/UX3-composer-extras/ (no Swift crop exists)
- SkillsKeyboardPane: the rounded border is the gallery Stage frame (ComponentsSection), not the component (root has no border). Switcher tightened: horizontal padding xxs, tab min height 40, radius cardRadius*1.5
- ClaudeSubagentTranscript rows: still the local SubagentRow model; blocked on UX3-chat-rows, tracked in docs/roadmap.md (Now) and left above

round 2 fixes:
- ClaudeSubagentTranscript now composes ChatUserBubble and ChatToolRow (merged main); SubagentRow stays as the input model. Tool row tests press the title text and read the output text
- back button: 36pt circle, chevronLeft 22pt bold in textPrimary (Icon gained a weight prop); header and read-only strip share one surface block with tight padding (about 130px vs 233px at sheet scale), timeline gap xs
- SkillsKeyboardPane: quote tab icon is a real bubble glyph (web fallback chat_bubble, iOS quote.bubble), Refresh row has hairlines above and below with a 22pt icon and body text, empty text pinned to the top
- compare sheets (dark and Papel against the *.light.png crops) for both cropped components, Indigo|Papel sheets for SkillContentSheet and ComposerStagingStatusBar (no Swift crop exists): scratchpad rn/evidence/UX3-composer-extras-r2/
