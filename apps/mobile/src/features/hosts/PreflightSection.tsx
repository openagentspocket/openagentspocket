import {
  PREFLIGHT_CHECKS,
  type PreflightCheckStatus,
  type PreflightReport,
  preflightStatus,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, type IconName, ListRow, Section } from '@openagentspocket/ui';
import { extra } from './extraText';
import { checkTitle, hintText } from './preflightText';

function icon(status: PreflightCheckStatus | null): IconName {
  if (!status) return 'statusIdle';
  switch (status.state) {
    case 'passed':
      return 'success';
    case 'failed':
      return 'error';
    case 'blocked':
      return 'statusIdle';
  }
}

interface PreflightSectionProps {
  report: PreflightReport | null;
  running: boolean;
  /** The header link: Run Checks Again, or Cancel Checks while they run. */
  onToggleRun: () => void;
}

/** The five checks in order: passed, the one that failed with its fix-it, and blocked ones. */
export function PreflightSection({ report, running, onToggleRun }: PreflightSectionProps) {
  const footer =
    !report && !running ? extra('Run the checks to see whether this Host is ready.') : undefined;
  return (
    <Section
      title={t('Preflight')}
      footer={footer}
      action={{
        title: running ? t('Cancel Checks') : t('Run Checks Again'),
        onPress: onToggleRun,
        testID: 'host-run-checks',
      }}
      testID="preflight-section"
    >
      {PREFLIGHT_CHECKS.map((check) => {
        const status = report ? preflightStatus(report, check) : null;
        const failed = status?.state === 'failed';
        return (
          <ListRow
            key={check}
            title={checkTitle(check)}
            subtitle={status?.state === 'failed' ? hintText(status.hint) : undefined}
            leading={
              <Icon
                name={icon(status)}
                color={failed ? 'danger' : status?.state === 'passed' ? 'success' : 'textTertiary'}
              />
            }
            testID={`preflight-${check}-${status?.state ?? 'pending'}`}
          />
        );
      })}
    </Section>
  );
}
