import { t } from '@openagentspocket/i18n';
import { ErrorState, ThemeProvider } from '@openagentspocket/ui';
import type { ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { RootCanvas } from '@/navigation/RootCanvas';
import { type CrashStorage, recordError } from './crashRecorder';
import { crashStorage } from './crashStorage';

/**
 * What a render error leaves on screen instead of closing the app: plain words and Try Again,
 * which renders the routes again. It replaces the root layout, so it depends on none of its
 * providers: the theme follows the system appearance, not Settings. The error goes to the crash
 * record (shown on Home) before anything here renders, so a fallback that fails still keeps it.
 */
export function RenderErrorFallback({
  error,
  retry,
  storage = crashStorage,
}: ErrorBoundaryProps & { storage?: CrashStorage }) {
  useState(() => recordError(storage, error, false));
  return (
    <ThemeProvider>
      <RootCanvas>
        <ErrorState
          summary={t('Something went wrong')}
          recovery={t('This screen hit an error. Try again, or close and reopen the app.')}
          detail={error?.message}
          onRetry={() => void retry()}
          retryLabel={t('Try Again')}
          testID="render-error"
        />
      </RootCanvas>
    </ThemeProvider>
  );
}
