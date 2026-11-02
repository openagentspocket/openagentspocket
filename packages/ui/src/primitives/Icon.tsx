import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTheme } from '../theme/theme';
import type { ColorKey } from '../theme/tokens.generated';

type SymbolName = Exclude<SymbolViewProps['name'], string>;

/**
 * Semantic icon names mapped to SF Symbols (iOS) and Material Symbols (Android, web).
 * Screens name what an icon means; this table is the one place that picks the glyph.
 */
const ICONS = {
  add: { ios: 'plus', android: 'add' },
  remove: { ios: 'minus', android: 'remove' },
  close: { ios: 'xmark', android: 'close' },
  check: { ios: 'checkmark', android: 'check' },
  copy: { ios: 'doc.on.doc', android: 'content_copy' },
  more: { ios: 'ellipsis', android: 'more_horiz' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more' },
  chevronUpDown: { ios: 'chevron.up.chevron.down', android: 'unfold_more' },
  send: { ios: 'arrow.up', android: 'arrow_upward' },
  stop: { ios: 'stop.fill', android: 'stop' },
  search: { ios: 'magnifyingglass', android: 'search' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  info: { ios: 'info.circle', android: 'info' },
  success: { ios: 'checkmark.circle', android: 'check_circle' },
  warning: { ios: 'exclamationmark.triangle', android: 'warning' },
  error: { ios: 'exclamationmark.octagon', android: 'error' },
  trash: { ios: 'trash', android: 'delete' },
  edit: { ios: 'pencil', android: 'edit' },
  pin: { ios: 'pin', android: 'keep' },
  bell: { ios: 'bell', android: 'notifications' },
  settings: { ios: 'gearshape', android: 'settings' },
  terminal: { ios: 'terminal', android: 'terminal' },
  folder: { ios: 'folder', android: 'folder' },
  file: { ios: 'doc', android: 'description' },
  camera: { ios: 'camera', android: 'photo_camera' },
  torch: { ios: 'flashlight.on.fill', android: 'flashlight_on' },
  server: { ios: 'server.rack', android: 'dns' },
  model: { ios: 'cpu', android: 'memory' },
  clock: { ios: 'clock', android: 'schedule' },
  attach: { ios: 'paperclip', android: 'attach_file' },
  keyboard: { ios: 'keyboard', android: 'keyboard' },
  arrowUp: { ios: 'arrow.up', android: 'arrow_upward' },
  grip: { ios: 'line.3.horizontal', android: 'drag_handle' },
  arrowDown: { ios: 'arrow.down', android: 'arrow_downward' },
  arrowLeft: { ios: 'arrow.left', android: 'arrow_back' },
  arrowRight: { ios: 'arrow.right', android: 'arrow_forward' },
  sparkles: { ios: 'sparkles', android: 'auto_awesome' },
  qr: { ios: 'qrcode.viewfinder', android: 'qr_code_scanner' },
  emptyTray: { ios: 'tray', android: 'inbox' },
  // Agent status at accessibility text sizes: one shape per status (StatusDot). Material's
  // static font is outlined, so working and idle differ by shape, not by fill.
  statusBlocked: { ios: 'exclamationmark.circle.fill', android: 'error' },
  statusDone: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  statusWorking: { ios: 'circle.fill', android: 'radio_button_checked' },
  statusIdle: { ios: 'circle', android: 'radio_button_unchecked' },
  // Ports and the browser preview.
  globe: { ios: 'globe', android: 'language' },
  container: { ios: 'shippingbox', android: 'inventory_2' },
  paused: { ios: 'pause.circle', android: 'pause_circle' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  usage: { ios: 'chart.bar.xaxis', android: 'bar_chart' },
  // Composer extras: read-only hint, keyboard pane switcher, skill document.
  eye: { ios: 'eye', android: 'visibility' },
  grid: { ios: 'square.grid.3x3', android: 'apps' },
  quote: { ios: 'quote.bubble', android: 'format_quote' },
  palette: { ios: 'paintpalette', android: 'palette' },
  document: { ios: 'doc.text', android: 'article' },
} as const satisfies Record<string, SymbolName>;

export type IconName = keyof typeof ICONS;
/** The SF Symbol behind an icon, for native iOS surfaces (menus) that take a symbol name. */
export const iconSymbol = (name: IconName): string => ICONS[name].ios;
export const iconNames = Object.keys(ICONS) as IconName[];

interface IconProps {
  name: IconName;
  size?: number;
  /** A theme color key; defaults to the secondary text color. */
  color?: ColorKey;
  /** A resolved color, for ink computed from a status or tone. Wins over `color`. */
  tint?: string;
  /** Set only for an icon that carries meaning alone; otherwise it is hidden from screen readers. */
  accessibilityLabel?: string;
  testID?: string;
}

export function Icon({
  name,
  size = 17,
  color = 'textSecondary',
  tint,
  accessibilityLabel,
  testID,
}: IconProps) {
  const theme = useTheme();
  const glyph = ICONS[name];
  const decorative = !accessibilityLabel;
  return (
    <SymbolView
      name={{ ios: glyph.ios, android: glyph.android, web: glyph.android }}
      size={size}
      tintColor={tint ?? theme.colors[color]}
      testID={testID ?? `icon-${name}`}
      accessible={!decorative}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
    />
  );
}
