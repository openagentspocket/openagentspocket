import { Pressable, View } from 'react-native';
import { impact } from '../haptics';
import { Icon } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { withAlpha } from '../theme/color';
import { makeStyles, useTheme } from '../theme/theme';
import { type ThemeId, themes } from '../theme/tokens.generated';

const DOT = 12;
const CHECK = 28;

const useStyles = makeStyles((t) => ({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    padding: t.spacing.md,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
    backgroundColor: t.colors.surface,
  },
  selected: {
    borderWidth: 1,
    borderColor: t.colors.accent,
    backgroundColor: t.wash(t.colors.accent),
  },
  pressed: { opacity: 0.8 },
  text: { flex: 1, gap: 2 },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xxs,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: t.spacing.xxs,
    borderRadius: 999,
    backgroundColor: t.colors.canvas,
  },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  check: {
    width: CHECK,
    height: CHECK,
    borderRadius: CHECK / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: { borderWidth: 2, borderColor: t.colors.textTertiary },
  filled: { backgroundColor: t.colors.accent },
}));

/** The five palette dots of a theme: accent, then the four status and info inks. */
export function paletteDots(themeId: ThemeId): readonly string[] {
  const { colors } = themes[themeId];
  return [
    colors.accent,
    colors.statusBlocked,
    colors.statusWorking,
    colors.statusDone,
    colors.info,
  ];
}

/** The five palette dots of a theme in a capsule. */
export function PaletteDots({ themeId }: { themeId: ThemeId }) {
  const styles = useStyles();
  return (
    <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no">
      {paletteDots(themeId).map((color) => (
        <View key={color} style={[styles.dot, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

interface ThemeChoiceCardProps {
  themeId: ThemeId;
  /** "Dark - Default", "Light". */
  subtitle: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}

/** A theme to pick: name, appearance, five overlapping palette dots and a check circle. Tap selects with a haptic. */
export function ThemeChoiceCard({
  themeId,
  subtitle,
  selected,
  onPress,
  testID,
}: ThemeChoiceCardProps) {
  const styles = useStyles();
  const name = themes[themeId].name;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${subtitle}`}
      accessibilityState={{ selected }}
      onPress={() => {
        impact('light');
        onPress();
      }}
      style={({ pressed }) => [styles.card, selected && styles.selected, pressed && styles.pressed]}
      testID={testID ?? `theme-choice-${themeId}`}
    >
      <View style={styles.text}>
        <Text variant="headline" numberOfLines={1}>
          {name}
        </Text>
        <Text variant="subheadline" tone="secondary" numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <PaletteDots themeId={themeId} />
      <View style={[styles.check, selected ? styles.filled : styles.empty]} testID="theme-check">
        {selected ? <Icon name="check" size={15} color="onAccent" /> : null}
      </View>
    </Pressable>
  );
}

const usePreviewStyles = makeStyles((t) => ({
  stage: {
    flexDirection: 'row',
    gap: t.spacing.sm,
    padding: t.spacing.md,
    borderRadius: t.metrics.cardRadius,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
  agent: { flex: 3, padding: t.spacing.sm, gap: t.spacing.xs, borderWidth: 1 },
  terminal: { flex: 2, padding: t.spacing.sm, gap: 2, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  dot: { width: 8, height: 8, borderRadius: 4 },
  grow: { flex: 1 },
  badge: { borderRadius: 999, paddingHorizontal: t.spacing.xs, paddingVertical: 2 },
  chips: { flexDirection: 'row', gap: t.spacing.xxs },
  chip: { borderRadius: 6, paddingHorizontal: t.spacing.xs, paddingVertical: 2 },
}));

interface ThemeChoicePreviewProps {
  themeId: ThemeId;
  /** Demo content, so the miniature stays free of copy: agent name, status label, prompt, chips, terminal lines. */
  agentName: string;
  statusLabel: string;
  prompt: string;
  chips: readonly string[];
  terminalPath: string;
  terminalCommand: string;
  testID?: string;
}

/** A miniature agent card and terminal drawn in a theme's own colors, whatever theme is active. */
export function ThemeChoicePreview({
  themeId,
  agentName,
  statusLabel,
  prompt,
  chips,
  terminalPath,
  terminalCommand,
  testID,
}: ThemeChoicePreviewProps) {
  const styles = usePreviewStyles();
  const theme = useTheme();
  const { colors } = themes[themeId];
  const radius = theme.metrics.cardRadius;
  return (
    <View
      style={[styles.stage, { backgroundColor: colors.canvas }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? `theme-preview-${themeId}`}
    >
      <View
        style={[
          styles.agent,
          {
            borderRadius: radius,
            backgroundColor: colors.surface,
            borderColor: withAlpha(colors.statusBlocked, theme.metrics.accentOutlineOpacity),
          },
        ]}
      >
        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: colors.statusBlocked }]} />
          <Text
            variant="headline"
            numberOfLines={1}
            style={[styles.grow, { color: colors.textPrimary }]}
          >
            {agentName}
          </Text>
          <View
            style={[
              styles.badge,
              { backgroundColor: withAlpha(colors.statusBlocked, theme.metrics.washOpacity) },
            ]}
          >
            <Text variant="caption2" semibold style={{ color: colors.statusBlocked }}>
              {statusLabel}
            </Text>
          </View>
        </View>
        <Text variant="subheadline" style={{ color: colors.textSecondary }}>
          {prompt}
        </Text>
        <View style={styles.chips}>
          {chips.map((chip) => (
            <View key={chip} style={[styles.chip, { backgroundColor: colors.control }]}>
              <Text variant="caption2" monospaced style={{ color: colors.textSecondary }}>
                {chip}
              </Text>
            </View>
          ))}
        </View>
      </View>
      <View
        style={[
          styles.terminal,
          {
            borderRadius: radius,
            backgroundColor: colors.terminalBackground,
            borderColor: colors.separator,
          },
        ]}
      >
        <Text variant="caption" monospaced style={{ color: colors.accent }}>
          {terminalPath}
        </Text>
        <Text variant="caption" monospaced style={{ color: colors.terminalForeground }}>
          {terminalCommand}
        </Text>
      </View>
    </View>
  );
}
