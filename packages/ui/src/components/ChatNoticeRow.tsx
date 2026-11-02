import { View } from 'react-native';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const GLYPH = 16;

const useStyles = makeStyles((t) => ({
  root: { paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.xxs, gap: t.spacing.xxs },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
}));

interface ChatNoticeRowProps {
  icon?: IconName;
  title: string;
  detail?: string;
  testID?: string;
}

/** Swift's informational notice: glyph and secondary title, caption2 detail below. No background. */
export function ChatNoticeRow({
  icon = 'bell',
  title,
  detail,
  testID = 'chat-notice-row',
}: ChatNoticeRowProps) {
  const styles = useStyles();
  return (
    <View
      style={styles.root}
      testID={testID}
      accessible
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
    >
      <View style={styles.head}>
        <Icon name={icon} size={GLYPH} />
        <Text variant="subheadline" tone="secondary" style={{ flexShrink: 1 }}>
          {title}
        </Text>
      </View>
      {detail ? (
        <Text variant="caption2" tone="secondary">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
