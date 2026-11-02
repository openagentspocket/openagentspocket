import { formatShare, paceTitle, type QuickWindow, resetText } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Meter, makeStyles, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { localeTag, renderMessage } from './usageText';

const useStyles = makeStyles((th) => ({
  row: { gap: th.spacing.xxs },
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
}

/** One Usage Limits window: name, share used, bar with the pace tick, reset and pace line. */
export function LimitWindowRow({ window, now }: Props) {
  const styles = useStyles();
  const name = renderMessage(window.name);
  const used = window.usedPercent;
  const percent = used === null ? null : formatShare(used, 100, localeTag());
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
