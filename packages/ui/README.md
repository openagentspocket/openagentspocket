# @agentico/ui

Tokens, theme and the shared component set (docs/spec/parity.md section 3). Screens compose these; search
`src/index.ts` before writing UI, and add a primitive here when a second screen needs it.

## See them

The gallery route renders every primitive in every state: open `/__gallery` in the dev client
(`/__gallery?theme=papel&section=overlays` for one theme and one section). Section ids: `type`, `buttons`,
`badges`, `rows`, `forms`, `feedback`, `overlays`, `content`, `lists`. A Metro reload is enough; no native rebuild.

## One way to do each thing

| Need | Use |
|---|---|
| Any alert, confirmation, destructive check, choice | `await confirm({ title, confirmLabel, destructive })` (boolean) or `await confirm({ title, actions })` (key or null) |
| Any sheet | `<Sheet visible onClose title detent="medium" \| "large" \| "fit">` |
| Any menu (context, long press, header "more") | `<ActionMenu items visible onClose>`, `<ActionMenuButton items>`, or `ListRow menu={...}` |
| Transient notice, in-app notification banner | `toast({ title, message, tone, leading, onPress })` |
| Inline notice with an action | `<Banner tone title message actionLabel onAction>` |
| A row in a list or settings | `ListRow` (leading, value, trailing, chevron, swipeActions, menu); `ToggleRow`, `PickerRow`, `StepperRow`, `NavRow`, `TextField` |
| A group of rows | `<Section title footer>` (one card, hairlines between rows) |
| A long list | `VirtualList` / `VirtualSectionList` (FlashList v2; `startAtBottom` for chat) |
| Nothing to show, a failure, loading | `EmptyState`, `ErrorState`, `SkeletonRows` |
| An icon | `<Icon name="copy">`: semantic names mapped to SF Symbols and Material Symbols in `Icon.tsx` |

`confirm()` and `toast()` draw in the mounted `<OverlayHost />` (the root layout mounts one; a Sheet mounts its
own while open, so alerts from a sheet appear over it). The most recently mounted host presents.

## Rules

- Colors only from `useTheme()` (`theme.colors.*`, `theme.status(s)`, `theme.tone(t)`, `theme.wash(c)`), never
  literals. Styles through `makeStyles`.
- Every user-visible string a primitive owns is a prop with an English default (`cancelLabel`, `copiedTitle`,
  `closeLabel`), so screens pass translated copy.
- Accessibility: buttons have names, icons are hidden unless labeled, swipe and menu actions are also screen-reader
  actions, meters and steppers expose values.
- Tests: `renderThemed()` from `src/test-utils.tsx`; mock `expo-clipboard` when pressing copy buttons.
