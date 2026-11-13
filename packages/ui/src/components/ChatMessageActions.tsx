import { View } from 'react-native';
import type { ActionMenuItem } from '../overlay/ActionMenu';
import { Button } from '../primitives/Button';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
}));

interface ChatMessageActionsProps {
  /** The same items the message's long press menu offers: each shows as a small glyph button. */
  items: readonly ActionMenuItem[];
  testID?: string;
}

/** The actions under the Agent's latest answer (Copy), in sight rather than only on long press. */
export function ChatMessageActions({
  items,
  testID = 'chat-message-actions',
}: ChatMessageActionsProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID}>
      {items.map((item) => (
        <Button
          key={item.key}
          kind="text"
          size="small"
          neutral
          icon={item.icon ?? 'more'}
          accessibilityLabel={item.accessibilityLabel ?? item.title}
          disabled={item.disabled}
          onPress={item.onPress}
          testID={`chat-message-action-${item.key}`}
        />
      ))}
    </View>
  );
}
