import { t } from '@openagentspocket/i18n';
import { Banner, copyToClipboard } from '@openagentspocket/ui';
import { useState } from 'react';
import { type CrashStorage, clearLastCrash, crashReportText, readLastCrash } from './crashRecorder';

/** Under the Hosts' issues on Home: the error the app closed on last time, to copy or dismiss. */
export function LastCrashBanner({ storage }: { storage: CrashStorage }) {
  const [record, setRecord] = useState(() => readLastCrash(storage));
  if (!record) return null;
  return (
    <Banner
      tone="danger"
      title={t('The app closed unexpectedly')}
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
