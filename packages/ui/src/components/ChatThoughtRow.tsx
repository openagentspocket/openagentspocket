import { View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const GLYPH = 16;

const useStyles = makeStyles((t) => ({
  root: { paddingHorizontal: t.spacing.md },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    minHeight: t.metrics.minTapSize,
  },
  body: { paddingLeft: GLYPH + t.spacing.xs, paddingBottom: t.spacing.xs },
}));

interface ChatThoughtRowProps {
  /** The words: 'Thought for 4s'. Translated by the caller. */
  label: string;
  /** The reasoning, shown when expanded. */
  text?: string;
  expanded: boolean;
  onToggle: () => void;
  testID?: string;
}

/** Swift's Thought row: brain glyph, label and chevron; expands to the reasoning in secondary ink. */
export function ChatThoughtRow({
  label,
  text,
  expanded,
  onToggle,
  testID = 'chat-thought-row',
}: ChatThoughtRowProps) {
  const styles = useStyles();
  return (
    <View style={styles.root} testID={testID}>
      <Tappable
        style={styles.head}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
      >
        <Icon name="brain" size={GLYPH} />
        <Text variant="subheadline" tone="secondary">
          {label}
        </Text>
        <Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={11} />
      </Tappable>
      {expanded && text ? (
        <View style={styles.body}>
          <Text variant="subheadline" tone="secondary">
            {text}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
