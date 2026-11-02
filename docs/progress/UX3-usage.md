# UX3-usage: Clone UsageLimitChip, UsageTotals, UsageChart, UsageHeatMap, UsageBreakdownRow
status: done
branch: worktree-wf_ec0a968a-c0f-9
changed: packages/ui/src/components/{UsageLimitChip,UsageTotals,UsageChart,UsageHeatMap,UsageBreakdownRow}.tsx, usage.ts, usageChartMath.ts, usageHeatMath.ts, usage.test.tsx; packages/ui/src/gallery/components/usage.tsx; packages/ui/src/primitives/Segmented.tsx (label shrinks to fit on native)
tests: pnpm --filter @openagentspocket/ui exec jest src/components → 9/9; verify-fast green
acceptance:
- each component per catalog (props, variants): met. UsageTotals has `summary` and `day` modes, UsageHeatMap `default` and `full` (legend), UsageBreakdownRow `program` and `host`. Strings are props (ui has no i18n dependency); the gallery passes English demo strings.
- gallery in Índigo and Papel, side-by-side sheets: met, 8 sheets in the evidence folder (scratchpad/rn/evidence/UX3-usage).
- component tests pin interactions: met (chip press, metric segments, day step/close and disabled next, heat map selects recorded days only, split segments, chart label and legend, math helpers). No screen files touched.
left:
- UsageTotals segment labels still truncate on Expo web ("Est. ..."); the selected semibold text measures wider there. Check on the iOS pass; `adjustsFontSizeToFit` was added to Segmented for native.
- Host variant of UsageBreakdownRow is one card per row; Swift groups the Hosts in one card with hairline separators. The UX1-usage assembly should wrap rows in a single Card (padded=false) or the row gains a `grouped` prop.
- Heat map cells are smaller than Swift's (Card padding); the assembly can render it edge to edge.
- Chart scrub (hold 250 ms, move) is implemented with responder events; verify on device (conflicts with a parent ScrollView are not handled).
notes: series colors, dot colors and heat ink come from theme tokens; callers pass program tints (`programTint`). Heat steps are the ink color at 0/30/50/75/95% over the control track, so Papel inverts to dark ink.
