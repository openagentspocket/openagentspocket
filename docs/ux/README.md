# UX parity docs

The Swift app's structure and interactions in the Índigo skin. Start with [design-system.md](design-system.md), then your
family brief. Each brief ends with an acceptance checklist a judge verifies on a side-by-side image.

**Component first (UX2)**: the Swift app's molecules are cloned once each into `packages/ui/src/components` and judged against crops of the atlas: see [components/README.md](components/README.md) (catalog, acceptance checklists, crops in `components/ref`, regenerate with `scripts/ux-crop.py`, review in `/__gallery?section=components`). Eight `UX3-*` tasks build them; the `UX1-*` family tasks below then ASSEMBLE whole screens from them and compare screens.

Order of work (phase 9 in `docs/tasks.yml`): `UX1-design-system` first (primitives), `UX2-component-catalog`, the eight `UX3-*` groups in parallel, then the screen assembly tasks in parallel `UX1-home`,
`UX1-agents-list`, `UX1-hosts`, `UX1-usage`, `UX1-settings`, `UX1-files-changes-ports`, `UX1-notifications`; then
`UX1-agent-detail` (after agents-list), `UX1-new-agent` (after home), and last `UX1-wide`.

Briefs: [home-inbox](briefs/home-inbox.md), [agents-board](briefs/agents-board.md), [agent-detail](briefs/agent-detail.md),
[hosts-pairing](briefs/hosts-pairing.md), [usage](briefs/usage.md), [settings](briefs/settings.md),
[files-changes-ports](briefs/files-changes-ports.md), [new-agent](briefs/new-agent.md),
[notifications-banners](briefs/notifications-banners.md), [wide-layouts](briefs/wide-layouts.md).

Atlas caveat: the iPad atlas is complete; the iPhone atlas has three images and there is no Home image. The atlas colors and
radii are the old skin: copy structure, never color.
