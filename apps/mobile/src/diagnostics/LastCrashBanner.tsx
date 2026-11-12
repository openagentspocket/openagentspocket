import { t } from '@openagentspocket/i18n';
import { Banner, copyToClipboard } from '@openagentspocket/ui';
import { useState } from 'react';
import { type CrashStorage, clearLastCrash, crashReportText, readLastCrash } from './crashRecorder';

/**
 * Under the Hosts' issues on Home: the last error recorded, to copy or dismiss. The one the app
 * closed on, or one a screen hit and recovered from (the render error fallback).
 */
export function LastCrashBanner({ storage }: { storage: CrashStorage }) {
  const [record, setRecord] = useState(() => readLastCrash(storage));
  if (!record) return null;
  return (
    <Banner
      tone="danger"
      title={record.fatal ? t('The app closed unexpectedly') : t('Something went wrong')}
      message={record.message}
      actionLabel={t('Copy')}
      onAction={() => void copyToClipboard(crashReportText(record), t('Copied'))}
      onDismiss={() => {
        clearLastCrash(storage);
        setRecord(undefined);
      }}
      dismissLabel={t('Dismiss')}
      testID="last-crash-banner"
    />
  );
}
