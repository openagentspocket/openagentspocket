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
- iOS pass (native): Segmented labels. Segments are `flexGrow 1, flexShrink 0, flexBasis auto` and the two UsageTotals groups grow 2:3 with basis auto, so each label gets at least its natural width. On Expo web it now fits at 402 px. On iOS, `adjustsFontSizeToFit` (min 0.8) is a second guard, but Yoga does not clamp: if a long translation exceeds the row the groups overflow, they do not truncate. Check Spanish ("Costo est.", "30 días") on device.
- Chart scrub (hold 250 ms, move) uses responder events; verify on device (conflicts with a parent ScrollView are not handled).
- UsageBreakdownRow host: wrap `grouped` rows in `UsageHostGroup` (one Card, hairline separators). UX1-usage assembly uses exactly that; the Swift Host glyph is a monitor, RN uses the `server` icon.
fixed in this pass (judge round):
- Totals: segments fit (see above); day subtitle wraps to 2 lines instead of truncating; round buttons 32 px.
- Heat map: card padding is small (`padded={false}` + sm body) so tiles span the card, gap 4, aspect 1.05; header title never wraps, caption on one line; labels with a month ("1 Oct", "3 Oct") render in footnote and clip, the gallery labels the first of month and first recorded day.
- Chart: legend and "Hold to read a day" on one row (caption2); Claude Code uses `programTint('claude')` (salmon) in chart and breakdown; gridlines stop at the plot so right-axis labels sit outside; four evenly spaced x labels.
- Breakdown host: `grouped` prop plus `UsageHostGroup`; host subtitle wraps to 2 lines.
- Papel checked: `scripts/atlas-compare.py --components --theme light UsageTotals UsageHeatMap UsageChart UsageBreakdownRow` (sheets in design/atlas/components/compare, copies in scratchpad/ev/light-*.png). Indigo copies in scratchpad/ev/*.png. Note: run the capture on a free port (another worktree can hold 8123 and the script then skips every key).
notes: series colors, dot colors and heat ink come from theme tokens; callers pass program tints (`programTint`). Heat steps are the ink color at 0/30/50/75/95% over the control track, so Papel inverts to dark ink.
