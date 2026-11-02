# UX2-component-catalog: component-first plan for the UX program
status: done
branch: worktree-wf_057d2888-9cf-1
changed: docs/ux/components/** (README generated, catalog.json, crops.json, ref/*.png 74 dark + 70 light crops), scripts/{ux-crop.py,ux-catalog.mjs,ux-components.mjs}, scripts/atlas-compare.py (--components), scripts/verify-fast.mjs (+ux catalog check), packages/ui/src/gallery/{ComponentsSection.tsx,ComponentsSection.test.tsx,Gallery.tsx}, packages/ui/src/gallery/components/** (types, registry, 8 empty group files), packages/ui/src/components/*.ts (8 empty barrels), packages/ui/src/index.ts, apps/mobile/src/app/__gallery/** (route moved to a directory, + components/[name].tsx), docs/tasks.yml, docs/ux/README.md, docs/agents/swarm.md
tests: pnpm verify-fast green (ui gallery suite incl. the new harness test)
acceptance:
- README lists every component with Swift sources and line ranges, atlas screens, variants, RN today, RN target, props, interactions and a checklist: met (47 components, 8 groups).
- crops regenerate with scripts/ux-crop.py from crops.json: met (74 boxes, checked on a contact sheet; Ports, JumpControl, collapsed Blocked card, in-app banner and the live scanner frame have no atlas image and say so in the catalog).
- /__gallery?section=components and /__gallery/components/<name> render entries in Indigo and Papel; capture script and compare mode exist: met for the scaffold (registry is empty; the capture and compare scripts could only be exercised against empty output, so the first UX3 worker validates the capture rect path).
- 8 UX3 tasks with disjoint files, UX1 family retitled as assembly tasks with deps on their UX3 groups: met; pnpm progress run.
left:
- UX3-* (8 tasks) and then the UX1-* assembly tasks.
- Light crops of Home host cards and iPad-only components are missing (no Swift light atlas image); judge dark only for those.
notes:
- Files owned per UX3 task: its components, its barrel packages/ui/src/components/<group>.ts, its gallery/components/<group>.tsx and its test. index.ts and the registry already list every group, so no task edits shared files.
- ux-catalog.mjs --check (in verify-fast) fails when README is stale, a crop key is not a catalog variant, a ref image is missing or a group's task is not in tasks.yml. Edit catalog.json, then run node scripts/ux-catalog.mjs.
- Swift atlas images are 402x874 at 1x, so crops are small; RN captures are 3x and the compare sheet scales the crop up.
