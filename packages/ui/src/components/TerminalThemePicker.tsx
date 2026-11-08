import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';

/** The thumbnail of a palette: its background and three bars (title, text, dim). */
export interface TerminalSwatch {
  background: string;
  bars: readonly [string, string, string];
}

export interface TerminalThemeOption {
  id: string;
  name: string;
  subtitle: string;
  swatch: TerminalSwatch;
}

const SWATCH_WIDTH = 54;
const SWATCH_HEIGHT = 38;

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.sm },
  footnote: { paddingHorizontal: t.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    minHeight: t.metrics.rowMinHeight,
  },
  pressed: { backgroundColor: t.colors.surfaceRaised },
  separator: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
    marginLeft: t.spacing.md + SWATCH_WIDTH + t.spacing.sm,
  },
  swatch: {
    width: SWATCH_WIDTH,
    height: SWATCH_HEIGHT,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    paddingHorizontal: t.spacing.xs,
    justifyContent: 'center',
    gap: airy.chipV,
  },
  bar: { height: 4, borderRadius: 2 },
  text: { flex: 1, gap: airy.badgeV },
}));

/** A palette thumbnail; decorative, the row's text names the palette. */
export function TerminalThemeSwatch({ swatch }: { swatch: TerminalSwatch }) {
  const styles = useStyles();
  const [title, body, dim] = swatch.bars;
  return (
    <View
      style={[styles.swatch, { backgroundColor: swatch.background }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="terminal-swatch"
    >
      <View style={[styles.bar, { width: '70%', backgroundColor: title }]} />
      <View style={[styles.bar, { width: '45%', backgroundColor: body }]} />
      <View style={[styles.bar, { width: '25%', backgroundColor: dim }]} />
    </View>
  );
}

interface TerminalThemePickerProps {
  themes: readonly TerminalThemeOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  /** The live `TerminalThemePreview` shown above the list. */
  preview: ReactNode;
  /** "Changes apply instantly ..." under the preview. */
  footnote: string;
  /** Screen-reader value of the selected row. Default "Selected". */
  selectedLabel?: string;
}

/** Settings > Theme > Terminal Palette: preview, footnote, then one swatch row per palette. */
export function TerminalThemePicker({
  themes,
  selectedId,
  onSelect,
  preview,
  footnote,
  selectedLabel = 'Selected',
}: TerminalThemePickerProps) {
  const styles = useStyles();
  return (
    <View style={styles.root} testID="terminal-theme-picker">
      {preview}
      <Text variant="footnote" tone="secondary" style={styles.footnote}>
        {footnote}
      </Text>
      <Card padded={false}>
        {themes.map((option, index) => {
          const selected = option.id === selectedId;
          return (
            <View key={option.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Tappable
                onPress={() => onSelect(option.id)}
                accessibilityRole="button"
                accessibilityLabel={`${option.name}, ${option.subtitle}`}
                accessibilityValue={selected ? { text: selectedLabel } : undefined}
                accessibilityState={{ selected }}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                testID={`terminal-theme-${option.id}`}
              >
                <TerminalThemeSwatch swatch={option.swatch} />
                <View style={styles.text}>
                  <Text variant="headline">{option.name}</Text>
                  <Text variant="caption" tone="secondary">
                    {option.subtitle}
                  </Text>
                </View>
                {selected ? (
                  <Icon name="check" size={17} color="accent" testID="theme-check" />
                ) : null}
              </Tappable>
            </View>
          );
        })}
      </Card>
    </View>
  );
}
