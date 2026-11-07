import {
  countdown,
  formatShare,
  paceTitle,
  type QuickWindow,
  resetText,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { LimitWindowRow as Row } from '@openagentspocket/ui';
import { localeTag, renderMessage } from './usageText';

const LEVEL_TONE = { normal: 'primary', warning: 'warning', danger: 'danger' } as const;

interface Props {
  window: QuickWindow;
  now: Date;
  /** Limits sheet: name, short bar, percent and reset clock on one line. */
  compact?: boolean;
}

/** One Usage Limits window on the shared row: the core window put in words. */
export function LimitWindowRow({ window, now, compact }: Props) {
  const used = window.usedPercent;
  const reset = window.resetsAt
    ? compact
      ? countdown(window.resetsAt, now, localeTag())
      : renderMessage(resetText(window.resetsAt, now, localeTag()))
    : '';
  return (
    <Row
      layout={compact ? 'inline' : 'stacked'}
      label={renderMessage(window.name)}
      usedShare={used === null ? null : used / 100}
      percentText={used === null ? '' : formatShare(used, 100, localeTag())}
      resetText={reset}
      pace={window.elapsedPercent === null ? undefined : window.elapsedPercent / 100}
      tone={LEVEL_TONE[window.level ?? 'normal']}
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
