import type { ProgramBrand } from '@openagentspocket/core';
import { View } from 'react-native';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { ProgramMark } from '../primitives/ProgramMark';
import { type Status, StatusDot } from '../primitives/StatusDot';
import { Text } from '../primitives/Text';
import { programTint } from '../theme/programTint';
import { makeStyles, useTheme } from '../theme/theme';
import { LimitWindowRow, type SegmentedLimitWindow } from './LimitWindowRow';

const useStyles = makeStyles((t) => ({
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  name: { flexShrink: 1 },
  spacer: { flex: 1 },
  body: { gap: t.spacing.sm, marginTop: t.spacing.xs },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingHorizontal: t.spacing.xs,
  },
}));

export interface ProviderUsageCardProps {
  /** The program id the mark draws ("claude", "codex"). */
  program: string;
  /** The brand whose color the bars take; undefined: the neutral tint. */
  brand?: ProgramBrand | null;
  name: string;
  /** The Host the figures come from. */
  hostName: string;
  windows: readonly Omit<SegmentedLimitWindow, 'color' | 'testID' | 'variant'>[];
  /** Shown instead of the windows ("Usage Limits are off."). */
  note?: string;
  /** Opens the provider's detail; the chevron shows only with it. */
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

/** One provider's Usage Limits on one Host: its mark, name, Host and a row per limit window. */
export function ProviderUsageCard({
  program,
  brand,
  name,
  hostName,
  windows,
  note,
  onPress,
  accessibilityLabel,
  testID = 'provider-usage-card',
}: ProviderUsageCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const color = programTint(brand ?? undefined, theme);
  return (
    <Card
      level="overlay"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel ?? `${name}, ${hostName}`}
      testID={testID}
    >
      <View style={styles.head}>
        <ProgramMark program={program} size={24} />
        <Text variant="headline" style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Icon name="server" size={14} color="textSecondary" />
        <Text variant="footnote" tone="secondary" numberOfLines={1} style={styles.name}>
          {hostName}
        </Text>
        <View style={styles.spacer} />
        {onPress ? <Icon name="chevronRight" size={14} color="textSecondary" /> : null}
      </View>
      <View style={styles.body}>
        {windows.map((window) => (
          <LimitWindowRow
            key={window.label}
            {...window}
            variant="segmented"
            color={color}
            testID={`${testID}-${window.label}`}
          />
        ))}
        {note ? (
          <Text variant="callout" tone="secondary">
            {note}
          </Text>
        ) : null}
      </View>
    </Card>
  );
}

/** "Updated this minute" under the cards, with a status dot. */
export function ProviderUsageFooter({
  text,
  status = 'done',
  testID = 'provider-usage-footer',
}: {
  text: string;
  status?: Status;
  testID?: string;
}) {
  const styles = useStyles();
  return (
    <View style={styles.footer} testID={testID}>
      <StatusDot status={status} size={8} />
      <Text variant="footnote" tone="secondary">
        {text}
      </Text>
    </View>
  );
}
