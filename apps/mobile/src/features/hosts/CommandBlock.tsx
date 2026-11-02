import { CopyButton, Text, useTheme } from '@openagentspocket/ui';
import { View } from 'react-native';

/** A shell command on a control-filled capsule with a copy button (Swift `CommandBlock`). */
export function CommandBlock({ command }: { command: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.xs,
        padding: theme.spacing.xs,
        paddingLeft: theme.spacing.sm,
        borderRadius: 8,
        backgroundColor: theme.colors.control,
      }}
    >
      <Text variant="mono" numberOfLines={1} style={{ flex: 1 }}>
        {command}
      </Text>
      <CopyButton value={command} accessibilityLabel={command} />
    </View>
  );
}
