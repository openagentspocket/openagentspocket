# UX0-briefs: UX parity briefs
status: done
branch: worktree-wf_b9cc74f4-d7b-2
changed: docs/ux/design-system.md, docs/ux/README.md, docs/ux/briefs/*.md (10), docs/tasks.yml (phase 9, 11 tasks), docs/progress/UX0-briefs.md, docs/PROGRESS.md
tests: `pnpm verify-fast` green (docs only)
acceptance:
- design-system.md covers type scale, spacing and x1.3 map, radii, hairlines, elevation, rows, headers, cards, badges, dots, bars, sheets, menus, swipes, empty states, haptics, animations, with the RN primitive and its gap: met
- one brief per family with screen ids, atlas folders, layout notes, Índigo adaptation and a checklist: met (home+inbox, agents+board, agent detail, hosts+pairing, usage, settings, files+changes+ports, new agent, notifications, wide)
- phase 9 tasks UX1-* with deps in docs/tasks.yml: met
left:
- The iPhone atlas is almost empty (3 PNGs) and has no Home image: UX workers need a refreshed iPhone atlas capture from the Swift repo (task swift: rerun ScreenAtlasTests on an iPhone), or judge Home from the sources and numbers in the brief.
- Atlas PNGs are the old skin (Noche, green accent); a judge should compare structure only.
- Values marked "proposal" in design-system.md (composer radius 16, GlassCapsule fallback, Reanimated spring constants) need an owner glance in the first UX1 PR.
notes:
- Swift SwiftUI text styles at default size were used for the type scale (not read from a source table); confirm against the iPad atlas when building the Text variants.
- Briefs reference RN files as read on the base commit; wide-sidebar/wide-qa/home-builder agents were active in parallel and may have changed some.
