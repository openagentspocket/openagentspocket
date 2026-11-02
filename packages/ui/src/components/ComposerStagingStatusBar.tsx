import { View } from 'react-native';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

export type StagingState = 'staging' | 'failed' | 'done';
export type StagingCommand = 'cancel' | 'retry' | 'copyPath' | 'dismiss';

const COMMAND_LABEL: Record<StagingCommand, string> = {
  cancel: 'Cancel',
  retry: 'Retry',
  copyPath: 'Copy Path',
  dismiss: 'Dismiss',
};

const STATE_ICON: Record<StagingState, IconName> = {
  staging: 'attach',
  failed: 'warning',
  done: 'success',
};

const useStyles = makeStyles((t) => ({
  bar: {
    gap: t.spacing.xs,
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.sm,
    backgroundColor: t.colors.surface,
    borderTopWidth: t.metrics.hairlineWidth,
    borderTopColor: t.hairline,
  },
  title: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  label: { flex: 1 },
  commands: { flexDirection: 'row', justifyContent: 'flex-end', gap: t.spacing.sm },
}));

interface ComposerStagingStatusBarProps {
  state: StagingState;
  /** The progress or result line ("Uploading photo.png"). Empty hides the bar. */
  label: string;
  commands?: readonly StagingCommand[];
  onCommand?: (command: StagingCommand) => void;
  /** Localized command titles; missing ones use English. */
  commandLabels?: Partial<Record<StagingCommand, string>>;
  accessibilityLabel?: string;
  testID?: string;
}

/** The attachment staging's progress or result with its commands (Cancel, Retry, Copy Path, Dismiss), above the composer. */
export function ComposerStagingStatusBar({
  state,
  label,
  commands = [],
  onCommand,
  commandLabels,
  accessibilityLabel,
  testID = 'staging-bar',
}: ComposerStagingStatusBarProps) {
  const styles = useStyles();
  if (!label) return null;
  return (
    <View
      style={styles.bar}
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityLiveRegion="polite"
      testID={testID}
    >
      <View style={styles.title}>
        <Icon
          name={STATE_ICON[state]}
          size={17}
          color={state === 'failed' ? 'warning' : 'textSecondary'}
        />
        <Text variant="subheadline" numberOfLines={3} style={styles.label}>
          {label}
        </Text>
      </View>
      {commands.length > 0 ? (
        <View style={styles.commands}>
          {commands.map((command) => (
            <Button
              key={command}
              kind="secondary"
              size="small"
              title={commandLabels?.[command] ?? COMMAND_LABEL[command]}
              onPress={() => onCommand?.(command)}
              testID={`staging-${command}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
