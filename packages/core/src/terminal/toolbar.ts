import { type QuickKey, sameKey } from './quick-keys';

/** The keys of the floating terminal toolbar capsule (Swift `TerminalToolbarKey`). */
export type ToolbarKey = 'control' | 'escape' | 'tab' | 'dPad' | 'keyboard' | 'more';

/** Settings > Toolbar choices; Ctrl, Keyboard and More always show. */
export interface ToolbarConfiguration {
  readonly showsEscape: boolean;
  readonly showsTab: boolean;
  readonly showsDPad: boolean;
}

export const STANDARD_TOOLBAR: ToolbarConfiguration = {
  showsEscape: true,
  showsTab: true,
  showsDPad: true,
};

export function toolbarShows(configuration: ToolbarConfiguration, key: ToolbarKey): boolean {
  switch (key) {
    case 'escape':
      return configuration.showsEscape;
    case 'tab':
      return configuration.showsTab;
    case 'dPad':
      return configuration.showsDPad;
    default:
      return true;
  }
}

/** Before the divider: Ctrl, then the text keys left on. */
export const leadingKeys = (c: ToolbarConfiguration): ToolbarKey[] =>
  (['control', 'escape', 'tab'] as const).filter((key) => toolbarShows(c, key));

/** After the divider: the D-pad when on, the keyboard, More. */
export const trailingKeys = (c: ToolbarConfiguration): ToolbarKey[] =>
  (['dPad', 'keyboard', 'more'] as const).filter((key) => toolbarShows(c, key));

/** The key a text cap sends; Ctrl and the glyph keys send nothing themselves. */
export function toolbarQuickKey(key: ToolbarKey): QuickKey | null {
  if (key === 'escape') return 'escape';
  if (key === 'tab') return 'tab';
  return null;
}

/** The D-pad popover's keys: four arrows in a cross around Enter. */
export const DPAD_KEYS: readonly QuickKey[] = ['up', 'left', 'enter', 'right', 'down'];

/** The keys the old fixed shortcut strip carried, in strip order. */
export const SHORTCUT_STRIP_KEYS: readonly QuickKey[] = [
  'escape',
  'tab',
  'shiftTab',
  'up',
  'down',
  'left',
  'right',
  'backspace',
  'shiftEnter',
  'enter',
];

/** Commands > Keys: strip keys the capsule and its D-pad leave off, so hiding never strands a key. */
export function commandKeys(configuration: ToolbarConfiguration): QuickKey[] {
  const direct: QuickKey[] = [
    ...(['escape', 'tab'] as const).filter((key) => toolbarShows(configuration, key)),
    ...(configuration.showsDPad ? DPAD_KEYS : []),
  ];
  return SHORTCUT_STRIP_KEYS.filter((key) => !direct.some((other) => sameKey(other, key)));
}

export const SENT_HISTORY_LIMIT = 10;
export const SENT_HISTORY_TITLE_LENGTH = 48;

/** Newest first, each text once, blank ones dropped. */
export function sentHistoryEntries(
  oldestFirst: readonly string[],
  limit = SENT_HISTORY_LIMIT,
): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];
  for (const text of [...oldestFirst].reverse()) {
    if (text.trim() === '' || seen.has(text)) continue;
    seen.add(text);
    entries.push(text);
    if (entries.length === limit) break;
  }
  return entries;
}

/** The first non-blank line cut to the title length, with an ellipsis when there is more. */
export function sentHistoryTitle(text: string): string {
  const lines = text.split(/\r\n|[\n\r\u2028\u2029]/);
  const line = (lines.find((candidate) => candidate.trim() !== '') ?? '').trim();
  const chars = [...line];
  const hasMore = chars.length > SENT_HISTORY_TITLE_LENGTH || lines.filter(Boolean).length > 1;
  const cut = chars.slice(0, SENT_HISTORY_TITLE_LENGTH).join('');
  return hasMore ? `${cut}…` : cut;
}
