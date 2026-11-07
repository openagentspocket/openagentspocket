import {
  countdown,
  formatShare,
  paceTitle,
  type QuickWindow,
  resetText,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { LimitWindowRow as LimitWindowRowView } from '@openagentspocket/ui';
import { localeTag, renderMessage } from './usageText';

interface Props {
  window: QuickWindow;
  now: Date;
  /** Limits sheet: name, short bar, percent and reset clock on one line. */
  compact?: boolean;
}

/** One Usage Limits window: name, share used, bar with the pace tick, reset and pace line. */
export function LimitWindowRow({ window, now, compact }: Props) {
  const used = window.usedPercent;
  const reset = (date: Date) =>
    compact ? countdown(date, now, localeTag()) : renderMessage(resetText(date, now, localeTag()));
  return (
    <LimitWindowRowView
      variant={compact ? 'meterInline' : 'meter'}
      label={renderMessage(window.name)}
      usedShare={used === null ? null : used / 100}
      paceShare={window.elapsedPercent === null ? undefined : window.elapsedPercent / 100}
      percentText={used === null ? '' : formatShare(used, 100, localeTag())}
      resetText={window.resetsAt ? reset(window.resetsAt) : ''}
      level={window.level ?? undefined}
      unknownText={
        window.isExpired ? t('Expired · current usage unknown') : t('Current usage unknown')
      }
      paceText={window.pace ? renderMessage(paceTitle(window.pace)) : undefined}
      testID={`limit-${window.id}`}
      meterTestID={`meter-${window.id}`}
      paceTestID={`pace-${window.id}`}
    />
  );
}
