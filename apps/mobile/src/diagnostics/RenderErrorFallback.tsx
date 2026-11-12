import { t } from '@openagentspocket/i18n';
import { ErrorState, ThemeProvider } from '@openagentspocket/ui';
import type { ErrorBoundaryProps } from 'expo-router';
import { useState } from 'react';
import { RootCanvas } from '@/navigation/RootCanvas';
import { type CrashStorage, recordError } from './crashRecorder';
import { crashStorage } from './crashStorage';
import { useGoHomeAndRetry } from './useGoHomeAndRetry';

/**
 * What a render error leaves on screen instead of closing the app: plain words, Try Again, which
 * renders the routes again, and Go to Home, for an error that Try Again would only meet again
 * (a screen the app opened into from a link or a notification). It replaces the root layout, so
 * it depends on none of its providers: the theme follows the system appearance, not Settings. The
 * error goes to the crash record (shown on Home) before anything here renders, so a fallback that
 * fails still keeps it.
 */
export function RenderErrorFallback({
  error,
  retry,
  storage = crashStorage,
}: ErrorBoundaryProps & { storage?: CrashStorage }) {
  useState(() => recordError(storage, error, false));
  const goHome = useGoHomeAndRetry(retry);
  return (
    <ThemeProvider>
      <RootCanvas>
        <ErrorState
          summary={t('Something went wrong')}
          recovery={t('This screen hit an error. Try again, or close and reopen the app.')}
          detail={error?.message}
          onRetry={() => void retry()}
          retryLabel={t('Try Again')}
          exitAction={
            goHome ? { title: t('Go to Home'), icon: 'home', onPress: goHome } : undefined
          }
          testID="render-error"
        />
      </RootCanvas>
    </ThemeProvider>
  );
}
