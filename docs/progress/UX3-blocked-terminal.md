# UX3-blocked-terminal: Clone BlockedCard, BackgroundWorkStrip, NoticeBanner, JumpControl, TerminalToolbar, KeyPad
status: done
branch: worktree-wf_ec0a968a-c0f-6
changed: packages/ui/src/components/{BlockedCard,BackgroundWorkStrip,NoticeBanner,JumpControl,TerminalToolbar,KeyPad}.tsx, keyRepeat.ts, blockedTerminal.ts, blockedTerminal.test.tsx; packages/ui/src/gallery/components/blockedTerminal.tsx; packages/ui/src/primitives/Icon.tsx (added glyphs: hand, chevronUp, chevronLeft, note, dpad, enter, shift, skills, snippets, appearance)
tests: pnpm verify-fast -> green (packages/ui related suites, 142 tests)
acceptance:
- each component per catalog, props covering variants: met (BlockedCard default/collapsed/question, strip pill/expanded, NoticeBanner inline/locating/inapp, JumpControl, toolbar default/dock/dpad, KeyPad)
- gallery in Indigo and Papel with compare sheets: met (sheets in scratchpad rn/evidence/UX3-blocked-terminal/)
- component tests pin interactions (option tap, note, collapse, strip open and +N more, Retry, jump long press, sticky modifier cycle, d-pad direction, key repeat, pager swipe and tabs): met
- no screen files touched: met
left: UX1 assembly tasks adopt the components (apps/mobile/src/blocked/BlockedCard.tsx still local). Deviations: BlockedCard uses the Card primitive (radius 8, owner's skin) instead of the Swift radius 20. Components are i18n-free: strings come in through `labels` props with English defaults (as the scanner does); assembly passes t(). Toolbar d-pad drag uses PanResponder and is unverified on device; glass is the hairline fallback on web.
notes: the Swift green accent maps to the theme accent; the success tone is not used.
