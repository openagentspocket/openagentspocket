import { View } from 'react-native';
import { Markdown } from '../markdown/Markdown';
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
  /** How `detail` reads: plain secondary text, or markdown (a command's output a program records so). */
  detailFormat?: 'plain' | 'markdown';
  testID?: string;
}

/** Swift's informational notice: glyph and secondary title, caption2 detail below. No background. */
export function ChatNoticeRow({
  icon = 'bell',
  title,
  detail,
  detailFormat = 'plain',
  testID = 'chat-notice-row',
}: ChatNoticeRowProps) {
  const styles = useStyles();
  const markdown = detail && detailFormat === 'markdown';
  return (
    <View
      style={styles.root}
      testID={testID}
      // Markdown keeps its tables' own scroll views reachable.
      accessible={!markdown}
      accessibilityLabel={markdown ? undefined : detail ? `${title}. ${detail}` : title}
    >
      <View style={styles.head}>
        <Icon name={icon} size={GLYPH} />
        <Text variant="subheadline" tone="secondary" style={{ flexShrink: 1 }}>
          {title}
        </Text>
      </View>
      {markdown ? (
        <Markdown text={detail} testID={`${testID}-markdown`} />
      ) : detail ? (
        <Text variant="caption2" tone="secondary">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}
