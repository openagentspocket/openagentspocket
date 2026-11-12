import { t } from '@openagentspocket/i18n';
import { Button, Card, Section, Text, ToggleRow } from '@openagentspocket/ui';
import { useState } from 'react';
import { Linking } from 'react-native';
import { AppScreen } from '@/navigation/AppScreen';
import { appBuild } from './appBuild';
import { type CrashStorage, readLastCrash } from './crashRecorder';
import { type AppBuild, problemReportBody, problemReportUrl } from './problemReport';

interface ReportProblemScreenProps {
  storage: CrashStorage;
  build?: AppBuild;
  /** Opens the new-issue link; Safari by default, where the person is signed in to GitHub. */
  open?: (url: string) => void;
}

/**
 * settings.report-problem: shows exactly what a new GitHub issue will carry (version, build,
 * system and, when one is recorded, the last crash) and lets the person leave the crash out.
 */
export function ReportProblemScreen({
  storage,
  build = appBuild(),
  open = (url) => void Linking.openURL(url),
}: ReportProblemScreenProps) {
  const [crash] = useState(() => readLastCrash(storage));
  const [includeCrash, setIncludeCrash] = useState(true);
  const body = problemReportBody(build, includeCrash ? crash : undefined);
  return (
    <AppScreen
      header={{ variant: 'native', title: t('Report a Problem') }}
      testID="settings-report-problem"
    >
      <Text variant="subheadline" tone="secondary">
        {t(
          'This opens a new issue on GitHub with the text below. Add what happened and send it from there; you need a GitHub account.',
        )}
      </Text>
      {crash ? (
        <Section
          footer={t(
            'The crash text can name files or Hosts on your computer. Turn it off to send the report without it.',
          )}
        >
          <ToggleRow
            title={t('Include the Last Crash')}
            value={includeCrash}
            onValueChange={setIncludeCrash}
            testID="report-include-crash"
          />
        </Section>
      ) : null}
      <Section title={t('What Will Be Sent')} grouped={false}>
        <Card>
          <Text variant="footnote" monospaced selectable testID="report-preview">
            {body}
          </Text>
        </Card>
      </Section>
      <Button
        icon="share"
        title={t('Open GitHub')}
        onPress={() => open(problemReportUrl(body))}
        testID="report-open"
      />
    </AppScreen>
  );
}
