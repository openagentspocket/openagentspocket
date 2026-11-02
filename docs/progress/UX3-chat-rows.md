# UX3-chat-rows: Clone ChatUserBubble, ChatDivider, ChatThoughtRow, ChatToolRow, ChatNoticeRow, DiffRow
status: done
branch: worktree-wf_ec0a968a-c0f-5
changed: packages/ui/src/components/{ChatUserBubble,ChatDivider,ChatThoughtRow,ChatToolRow,ChatNoticeRow,DiffRow,diffRowParts}.tsx, chatRows.ts, chatRows.test.tsx, gallery/components/chatRows.tsx, primitives/Icon.tsx (+brain, hand, errorCircle, bot)
tests: pnpm verify-fast → green; jest chatRows.test.tsx → 14/14
acceptance: components in gallery with all catalog variants (met, Indigo + Papel captured); tests pin interactions (met: long press menu, timer tick, fold, expand, status marks, subagent links, gap expand, line reference, split pairing); no screen files touched (met). Side-by-side sheets reviewed for Indigo; Papel renders correctly in the raw capture.
left: atlas-compare Papel column crops wrongly for Papel captures (ux-components --theme papel records x=301, not 21; tooling, not components). DiffRow has extra top padding above the file bar. Word-level diff segments must be computed by the caller (UX1-agent-detail / UX1-files-changes-ports).
notes: strings are props (callers translate via t()). ChatToolRow covers a command card and a subagent group (one card per row, link only when finished). Icon table gained four glyphs.
