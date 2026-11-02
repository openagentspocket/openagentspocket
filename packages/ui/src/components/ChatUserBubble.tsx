import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { MetaChip } from '../primitives/MetaChip';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const BUBBLE_RADIUS = 20;

const useStyles = makeStyles((t) => ({
  row: { alignItems: 'flex-end', paddingHorizontal: t.spacing.md },
  bubble: {
    maxWidth: '80%',
    backgroundColor: t.colors.surfaceRaised,
    borderRadius: BUBBLE_RADIUS,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.xs,
  },
  pending: { opacity: 0.55 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xxs },
  sending: { paddingTop: t.spacing.xxs },
}));

interface ChatUserBubbleProps {
  text: string;
  /** File names shown as chips under the text. */
  attachments?: readonly string[];
  /** Dimmed, with a sending caption until the Host echoes the message. */
  pending?: boolean;
  pendingLabel?: string;
  /** Long press menu (copy, select text); the caller owns the actions and strings. */
  menu?: readonly ActionMenuItem[];
  testID?: string;
}

/** Swift's user message bubble: right aligned, radius 20 on the raised surface, no border. */
export function ChatUserBubble({
  text,
  attachments,
  pending,
  pendingLabel,
  menu,
  testID = 'chat-user-bubble',
}: ChatUserBubbleProps) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.row} testID={testID}>
      <Pressable
        accessibilityLabel={text}
        accessibilityActions={menu?.map((m) => ({ name: m.key, label: m.title }))}
        onAccessibilityAction={(e) =>
          menu?.find((m) => m.key === e.nativeEvent.actionName)?.onPress()
        }
        onLongPress={menu?.length ? () => setOpen(true) : undefined}
        style={[styles.bubble, pending && styles.pending]}
      >
        <Text variant="body">{text}</Text>
        {attachments?.length ? (
          <View style={styles.chips}>
            {attachments.map((name) => (
              <MetaChip key={name} label={name} icon="attach" />
            ))}
          </View>
        ) : null}
      </Pressable>
      {pending && pendingLabel ? (
        <Text variant="caption2" tone="tertiary" style={styles.sending}>
          {pendingLabel}
        </Text>
      ) : null}
      {menu?.length ? (
        <ActionMenu items={menu} visible={open} onClose={() => setOpen(false)} />
      ) : null}
    </View>
  );
}
