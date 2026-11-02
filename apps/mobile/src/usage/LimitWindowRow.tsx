import {
  countdown,
  formatShare,
  paceTitle,
  type QuickWindow,
  resetText,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, Meter, makeStyles, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { localeTag, renderMessage } from './usageText';

const useStyles = makeStyles((th) => ({
  row: { gap: th.spacing.xxs },
  inline: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.sm },
  name: { width: 92 },
  bar: { flex: 1 },
  reset: { flexDirection: 'row', alignItems: 'center', gap: th.spacing.xxs, minWidth: 72 },
  line: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: th.spacing.xs,
  },
}));

const LEVEL_TONE = { normal: 'primary', warning: 'warning', danger: 'danger' } as const;

interface Props {
  window: QuickWindow;
  now: Date;
  /** Limits sheet: name, short bar, percent and reset clock on one line. */
  compact?: boolean;
}

/** One Usage Limits window: name, share used, bar with the pace tick, reset and pace line. */
export function LimitWindowRow({ window, now, compact }: Props) {
  const styles = useStyles();
  const name = renderMessage(window.name);
  const used = window.usedPercent;
  const percent = used === null ? null : formatShare(used, 100, localeTag());
  if (compact) {
    return (
      <View
        style={styles.inline}
        accessible
        accessibilityLabel={percent ? `${name}, ${percent}` : name}
        testID={`limit-${window.id}`}
      >
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.bar}>
          {used === null ? null : (
            <Meter
              value={used / 100}
              pace={window.elapsedPercent === null ? undefined : window.elapsedPercent / 100}
              accessibilityLabel={name}
              testID={`meter-${window.id}`}
            />
          )}
        </View>
        <Text variant="headline" tone={LEVEL_TONE[window.level ?? 'normal']} tabularNums>
          {percent ?? '–'}
        </Text>
        <View style={styles.reset}>
          <Icon name="clock" size={12} color="textSecondary" />
          <Text variant="footnote" tone="secondary" numberOfLines={1}>
            {window.resetsAt ? countdown(window.resetsAt, now, localeTag()) : ' '}
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={percent ? `${name}, ${percent}` : name}
      testID={`limit-${window.id}`}
    >
      <View style={styles.line}>
        <Text variant="body">{name}</Text>
        {percent === null ? null : (
          <Text variant="headline" tone={LEVEL_TONE[window.level ?? 'normal']}>
            {percent}
          </Text>
        )}
      </View>
      {used === null ? (
        <Text variant="callout" tone="secondary">
          {window.isExpired ? t('Expired · current usage unknown') : t('Current usage unknown')}
        </Text>
      ) : (
        <Meter
          value={used / 100}
          pace={window.elapsedPercent === null ? undefined : window.elapsedPercent / 100}
          accessibilityLabel={name}
          testID={`meter-${window.id}`}
        />
      )}
      <View style={styles.line}>
        <Text variant="footnote" tone="secondary">
          {window.resetsAt ? renderMessage(resetText(window.resetsAt, now, localeTag())) : ' '}
        </Text>
        {window.pace ? (
          <Text variant="footnote" tone="secondary" testID={`pace-${window.id}`}>
            {renderMessage(paceTitle(window.pace))}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
