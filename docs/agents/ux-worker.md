# UX worker brief (one page)

Goal: a screen family reads like the Swift app (structure, hierarchy, spacing, what floats and what scrolls)
wearing the Índigo skin. Color comes from tokens, never from the Swift shots (they use the old Noche skin).

## Read only what you need

- Your brief: `docs/ux/briefs/<family>.md`. Components: `docs/ux/components/README.md` (reuse them; do not
  re-implement a cloned component inside a screen).
- Swift reference shots: `../Agentico/design/screens/current/<screen-id>.png` (dark) and `.../light/` (Papel).
  Open only the ids of your family.
- Swift source only when the brief does not answer a layout question.

## Files you own

- Your family's screens in `apps/mobile` and your family's atlas entries file
  (`apps/mobile/src/dev/atlas/family<Name>.tsx`). Add your ids to `atlasMap.json` too (append at the end).
- Do not edit `entries.tsx`, `_layout.tsx`, `Icon.tsx` or another family's files. If you need a shared change
  (a new icon, a root layout option), list it in your report; the lead lands it.

## Visual loop (fresh every time)

1. Clear the cache and start your own server once per iteration:
   `rm -rf apps/mobile/.expo/web-cache apps/mobile/node_modules/.cache`, then capture with your own port.
2. Capture after your last change, ids as separate arguments (never one quoted string):
   `node scripts/atlas-web.mjs --port <port> <id> <id>` and `--theme papel`.
3. Compare: `<scratchpad>/rn/venv-pil/bin/python3 scripts/atlas-compare.py <id> <id>` (Papel: `--theme light`,
   after capturing with `--theme papel`); open only the sheets of the
   ids you changed in this iteration.
4. Stop at "reads like Swift"; list remaining small differences instead of looping on them. At most two
   iterations per screen after the first build.

## Done

`pnpm verify-fast` green, screens <=150 lines, files <=400, behavior and testIDs kept (or e2e flows updated),
`docs/progress/<task>.md` honest (done/partial and what is left), `pnpm progress`, commit on your branch (no
attribution trailers, never touch main). Report: commits, the ids you captured with the sheet paths, what is
left. The owner reviews the sheets himself; keep the report short.
