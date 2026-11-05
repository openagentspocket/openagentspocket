import { View } from 'react-native';
import { Sheet } from '../overlay/Sheet';
import { Card } from '../primitives/Card';
import { Icon, type IconName } from '../primitives/Icon';
import { Text } from '../primitives/Text';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  body: { gap: t.spacing.sm, paddingBottom: t.spacing.md },
  row: { flexDirection: 'row', gap: t.spacing.sm, alignItems: 'flex-start' },
  text: { flex: 1, gap: t.spacing.xxs },
  meta: { paddingTop: t.spacing.xxs },
}));

export interface ChoiceOption {
  id: string;
  icon: IconName;
  /** A small caps line above the title ("Recommended"). */
  eyebrow?: string;
  title: string;
  /** One sentence under the title; a compact row without it. */
  description?: string;
  /** A trailing footnote ("~2 min"). */
  meta?: string;
  /** Outlines the card in the accent color: the choice we suggest. */
  highlighted?: boolean;
  onPress: () => void;
}

interface ChoiceSheetProps {
  visible: boolean;
  title: string;
  options: readonly ChoiceOption[];
  onClose: () => void;
  onDismissed?: () => void;
  testID?: string;
}

/** A bottom sheet of a few choices, each a card with an icon, title, optional sentence and meta; testIDs are `<testID>-<option id>`. */
export function ChoiceSheet({
  visible,
  title,
  options,
  onClose,
  onDismissed,
  testID = 'choice-sheet',
}: ChoiceSheetProps) {
  const styles = useStyles();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      title={title}
      detent="fit"
      testID={testID}
    >
      <View style={styles.body}>
        {options.map((option) => (
          <Card
            key={option.id}
            level="overlay"
            accent={option.highlighted ? 'accent' : undefined}
            onPress={option.onPress}
            accessibilityLabel={[option.eyebrow, option.title, option.description, option.meta]
              .filter(Boolean)
              .join('. ')}
            testID={`${testID}-${option.id}`}
          >
            <View style={styles.row}>
              <Icon
                name={option.icon}
                size={22}
                color={option.highlighted ? 'accent' : 'textSecondary'}
              />
              <View style={styles.text}>
                {option.eyebrow ? (
                  <Text
                    variant="caption2"
                    semibold
                    tone="accent"
                    style={{ textTransform: 'uppercase' }}
                  >
                    {option.eyebrow}
                  </Text>
                ) : null}
                <Text variant="headline">{option.title}</Text>
                {option.description ? (
                  <Text variant="subheadline" tone="secondary">
                    {option.description}
                  </Text>
                ) : null}
                {option.meta ? (
                  <Text variant="footnote" tone="tertiary" style={styles.meta}>
                    {option.meta}
                  </Text>
                ) : null}
              </View>
            </View>
          </Card>
        ))}
      </View>
    </Sheet>
  );
}
