import type { PluginNotice, PluginStep } from '@openagentspocket/core';
import { errorMessage } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  airy,
  Button,
  Card,
  CommandBlock,
  Icon,
  Sheet,
  Text,
  useTheme,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { View } from 'react-native';
import { pluginActionTitle, pluginMessageText, pluginNoteText } from './pluginText';

interface PluginNoticeSheetProps {
  notice: PluginNotice;
  visible: boolean;
  onClose: () => void;
  /** Re-runs the checks after the user ran the commands on the Host. */
  onRunChecks: () => void;
  /**
   * Runs the notice's steps on the Host; absent when the build cannot (the commands are then
   * the only way). Rejects with a message to show under the button.
   */
  onRunAction?: (steps: readonly PluginStep[]) => Promise<void>;
}

/** hosts.plugin-notice: what to run on the Host to install, update or enable the plugin. */
export function PluginNoticeSheet({
  notice,
  visible,
  onClose,
  onRunChecks,
  onRunAction,
}: PluginNoticeSheetProps) {
  const theme = useTheme();
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const { action } = notice;
  // Android push is not an iOS-copy concern: the Swift notice has no line for it.
  const notes = notice.notes.filter((note) => note.feature !== 'androidPush');
  const run = async () => {
    if (!action || !onRunAction || running) return;
    setRunning(true);
    setFailure(null);
    try {
      await onRunAction(action.steps);
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setRunning(false);
    }
  };
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('Agentico Plugin')}
      detent="large"
      trailing={{ label: t('Done'), onPress: onClose }}
      testID="plugin-notice"
    >
      <View style={{ gap: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
        <Card padded>
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm, alignItems: 'flex-start' }}>
            <Icon
              name={notice.tone === 'warning' ? 'warning' : 'info'}
              size={22}
              color={notice.tone === 'warning' ? 'warning' : 'accent'}
            />
            <Text style={{ flex: 1 }} testID="plugin-notice-message">
              {pluginMessageText(notice.message)}
            </Text>
          </View>
          {notice.commands.map((command) => (
            <CommandBlock
              key={command}
              lines={[command]}
              copyLabel={t('Copy')}
              copiedLabel={t('Copied')}
            />
          ))}
        </Card>
        {notes.length > 0 ? (
          <View style={{ gap: theme.spacing.xs, paddingHorizontal: theme.spacing.xs }}>
            {notes.map((note) => (
              <Text key={note.feature} variant="footnote" tone="secondary">
                {pluginNoteText(note)}
              </Text>
            ))}
          </View>
        ) : null}
        {action && onRunAction ? (
          <Card padded={false}>
            <Button
              kind="text"
              icon={action.steps.some((step) => step.kind === 'install') ? 'arrowDown' : 'refresh'}
              title={running ? t('Running on Host…') : pluginActionTitle(action.title)}
              loading={running}
              onPress={() => void run()}
              testID="plugin-notice-action"
            />
          </Card>
        ) : null}
        {failure ? (
          <Text variant="footnote" tone="danger" testID="plugin-notice-failure">
            {failure}
          </Text>
        ) : null}
        {notice.commands.length > 0 ? (
          <View style={{ gap: theme.spacing.xs }}>
            <Card padded={false}>
              <Button
                kind="text"
                icon="refresh"
                title={t('Run Checks Again')}
                disabled={running}
                onPress={() => {
                  onClose();
                  onRunChecks();
                }}
                testID="plugin-notice-run-checks"
              />
            </Card>
            <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: airy.chipV }}>
              {t('After running the commands on the Host.')}
            </Text>
          </View>
        ) : null}
      </View>
    </Sheet>
  );
}
