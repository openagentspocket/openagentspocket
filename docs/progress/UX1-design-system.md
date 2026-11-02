# UX1-design-system: UX primitives to the Swift design system
status: done
branch: worktree-wf_e63b24b1-5b3-1
changed: packages/ui/src (new: haptics.ts, motion.ts, primitives/{ScreenBackground,MetaChip,StatusOrb,Segmented,GlassCapsule,CardRow,swipeMath}, overlay/menuGroups.ts, gallery/galleryParity.tsx, primitives/ux1.test.tsx; edited: Text, Badge, Screen, SwipeRow, ListRow, Card, SectionHeader, StatusDot, Sheet, sheetDetents, ActionMenu, NativeActionMenu, theme/{metrics,accessibility}, Gallery, index), 37 call-site files (`variant="caption"` to `footnote`, same 13 pt), two tests (section headers no longer uppercase), apps/mobile + packages/ui package.json and lockfile (expo-haptics), docs/ux/design-system.md section 8, docs/tasks.yml (3 follow-ups)
tests: `pnpm verify-fast` green; `pnpm test` ui 158/158, mobile 271/272 on the first run (HomeScreen inbox test timed out under full load, passes alone 6/6)
acceptance:
- every section 8 gap closed or split: met. Closed 1-8 and 10; 9 and the pieces of 3, 5, 6 split into UX1-tint-audit, UX1-sheet-routes, UX1-menu-preview (docs/tasks.yml).
- each primitive in /__gallery in Indigo, Papel and an accessibility size: met. `/__gallery?section=parity`; evidence docs/progress/evidence/ux1-design-system/parity-all.png (Expo web, Swift shell.home structure compared: title + age, detail, chips, status wash pill with orb, blocked outline, selection ring, glass capsule, segmented, grouped rows).
- expo-haptics via `npx expo install`: met (apps/mobile ~58.0.7, also declared in packages/ui). The integrator rebuilds native once.
left:
- UX1-tint-audit, UX1-sheet-routes, UX1-menu-preview (filed).
- Family tasks adopt: CardRow, Sheet bar actions/largeTitle, Segmented, GlassCapsule, impact() on terminal toolbar/keys, `Text` variant migration of old `label`/`mono` callers.
- Gallery shows Sheet/ActionMenu only through buttons; sheet detents and the GlassCapsule native glass path need an iOS pass by the integrator.
notes:
- Text sizes: body 17, callout 16, title 34 bold (was 28); Markdown H1 uses title2. `mono` now SF Mono (`ui-monospace`) on iOS; the terminal keeps `monoFamily` (Menlo).
- `FontScaleOverride` (theme/accessibility) lets previews force a text scale; Text multiplies sizes and `useFontScale` reports it.
- Metro on Expo web served stale code after edits in this worktree; restarting with `--clear` fixed it.
- Evidence PNGs also in the scratchpad dir rn/evidence/ux1-design-system/.
