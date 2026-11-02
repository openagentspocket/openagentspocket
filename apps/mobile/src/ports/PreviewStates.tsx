import type { PreviewPhase } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, EmptyState, ErrorState, SkeletonRows } from '@openagentspocket/ui';
import { portsMessage, portsText } from './text';

/** What the Preview screen shows instead of a page: opening, paused, or a failure with Try Again. */
export function PreviewStates({
  phase,
  port,
  onRetry,
}: {
  phase: PreviewPhase | undefined;
  port: number;
  onRetry: () => void;
}) {
  switch (phase?.kind) {
    case 'paused':
      return (
        <EmptyState
          icon="paused"
          title={t('Preview Paused')}
          message={t(
            'The tunnel closed while Agentico was in the background. It opens again when you come back.',
          )}
          actions={<Button title={t('Resume')} onPress={onRetry} testID="preview-resume" />}
          testID="preview-paused"
        />
      );
    case 'failed':
      return (
        <ErrorState
          summary={portsText(phase.failure.title)}
          recovery={portsMessage(phase.failure.message)}
          onRetry={onRetry}
          retryLabel={t('Try Again')}
          testID="preview-failure"
        />
      );
    default:
      return <SkeletonRows accessibilityLabel={t('Opening port %@…', String(port))} />;
  }
}
