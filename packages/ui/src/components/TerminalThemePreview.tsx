import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { rounded } from '../theme/corners';
import { makeStyles } from '../theme/theme';

/** The colors of one terminal palette half; they come from the palette, never from the app tokens. */
export interface TerminalPalette {
  background: string;
  foreground: string;
  /** The title line ("agentico"). */
  accent: string;
  /** The connected dot and word. */
  success: string;
  /** The working directory line. */
  directory: string;
  /** The prompt chevron. */
  prompt: string;
  /** The dim "Ready for input" line. */
  muted: string;
}

export interface TerminalPreviewLabels {
  title: string;
  connected: string;
  host: string;
  directory: string;
  command: string;
  ready: string;
  /** Screen-reader label of the whole preview. */
  accessibility: string;
}

export const defaultTerminalPreviewLabels: TerminalPreviewLabels = {
  title: 'agentico',
  connected: 'connected',
  host: 'mac-studio',
  directory: '~/Projects/herdr',
  command: 'codex --continue',
  ready: 'Ready for input',
  accessibility: 'Terminal theme preview',
};

const PREVIEW_HEIGHT = 180;

const useStyles = makeStyles((t) => ({
  card: {
    height: PREVIEW_HEIGHT,
    ...rounded(t.radius.card),
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    overflow: 'hidden',
  },
  line: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  blank: { height: 8 },
}));

interface TerminalThemePreviewProps {
  palette: TerminalPalette;
  /** The terminal font size in points; the sample scales with it (default 11). */
  fontSize?: number;
  labels?: Partial<TerminalPreviewLabels>;
  testID?: string;
}

/** Canned terminal output on a palette's own background, to preview a theme and font size. */
export function TerminalThemePreview({
  palette,
  fontSize = 11,
  labels,
  testID = 'terminal-theme-preview',
}: TerminalThemePreviewProps) {
  const styles = useStyles();
  const text = { ...defaultTerminalPreviewLabels, ...labels };
  const size = { fontSize, lineHeight: Math.round(fontSize * 1.45) };
  const ink = (color: string, bold = false) => [
    size,
    { color },
    bold ? { fontWeight: '700' as const } : null,
  ];
  return (
    <View
      style={[styles.card, { backgroundColor: palette.background }]}
      accessible
      accessibilityLabel={text.accessibility}
      testID={testID}
    >
      <Text monospaced style={ink(palette.accent, true)}>
        {text.title}
      </Text>
      <View style={styles.line}>
        <Text monospaced style={ink(palette.success)}>
          {`● ${text.connected}`}
        </Text>
        <Text monospaced style={ink(palette.foreground)}>
          {text.host}
        </Text>
      </View>
      <View style={styles.blank} />
      <Text monospaced style={ink(palette.directory)}>
        {text.directory}
      </Text>
      <View style={styles.line}>
        <Text monospaced style={ink(palette.prompt)}>
          ›
        </Text>
        <Text monospaced style={ink(palette.foreground)}>
          {text.command}
        </Text>
      </View>
      <Text monospaced style={ink(palette.muted)}>
        {text.ready}
      </Text>
    </View>
  );
}
