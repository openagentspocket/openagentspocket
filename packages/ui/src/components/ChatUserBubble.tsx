import { Pressable, View } from 'react-native';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { useContextMenu } from '../overlay/useContextMenu';
import { Icon, type IconName } from '../primitives/Icon';
import { MetaChip } from '../primitives/MetaChip';
import { Text, type TextTone } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const BUBBLE_RADIUS = 20;
const STATUS_INK = { secondary: 'textSecondary', warning: 'warning', danger: 'danger' } as const;

const useStyles = makeStyles((t) => ({
  row: { alignItems: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    backgroundColor: t.colors.control,
    borderRadius: BUBBLE_RADIUS,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.sm,
    gap: t.spacing.xs,
  },
  pending: { opacity: 0.55 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xxs },
  sending: { paddingTop: t.spacing.xxs },
  status: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: t.spacing.xxs,
    paddingTop: t.spacing.xxs,
    maxWidth: '80%',
  },
  statusText: { flexShrink: 1, textAlign: 'right' },
}));

/** What became of a message Chat sent, as a caption with a glyph under its bubble. */
export interface ChatUserBubbleStatus {
  text: string;
  icon: IconName;
  tone: Extract<TextTone, 'secondary' | 'warning' | 'danger'>;
}

interface ChatUserBubbleProps {
  text: string;
  /** File names shown as chips under the text. */
  attachments?: readonly string[];
  /** Dimmed, with a sending caption until the Host echoes the message. */
  pending?: boolean;
  pendingLabel?: string;
  /** The send's outcome when it is not the plain sending state (not delivered, refused, ...). */
  status?: ChatUserBubbleStatus;
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
  status,
  menu,
  testID = 'chat-user-bubble',
}: ChatUserBubbleProps) {
  const styles = useStyles();
  const context = useContextMenu();
  return (
    <View style={styles.row} testID={testID}>
      <Pressable
        accessibilityLabel={text}
        accessibilityActions={menu?.map((m) => ({ name: m.key, label: m.title }))}
        onAccessibilityAction={(e) =>
          menu?.find((m) => m.key === e.nativeEvent.actionName)?.onPress()
        }
        onLongPress={menu?.length ? context.open : undefined}
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
      {status ? (
        <View style={styles.status} testID={`${testID}-status`}>
          <Icon name={status.icon} size={13} color={STATUS_INK[status.tone]} />
          <Text variant="caption" tone={status.tone} style={styles.statusText}>
            {status.text}
          </Text>
        </View>
      ) : null}
      {menu?.length ? <ActionMenu items={menu} {...context.menuProps} /> : null}
    </View>
  );
}
