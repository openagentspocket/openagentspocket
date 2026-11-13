import { View } from 'react-native';
import { BoundedScroll } from '../primitives/BoundedScroll';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { airy } from '../theme/metrics';
import { makeStyles } from '../theme/theme';

/**
 * The suggestions panel takes at most this share of the window, so the input and the keyboard stay
 * usable over a list of dozens; its rows scroll inside it.
 */
const MAX_SHARE = 0.3;

const useStyles = makeStyles((t) => ({
  panel: { paddingHorizontal: t.spacing.sm, paddingTop: t.spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  section: { paddingTop: t.spacing.sm },
  row: {
    paddingVertical: airy.stack,
    borderBottomWidth: t.metrics.hairlineWidth,
    borderBottomColor: t.colors.separator,
    gap: airy.line,
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm },
  name: { flexShrink: 1 },
  close: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
}));

/** One row of the `/` panel: a command or a skill. */
export interface ComposerSkill {
  /** "/code-review". */
  name: string;
  description: string;
  /** Where picking it takes the user, when that is not where they are ("Terminal"). */
  hint?: string;
}

interface Section {
  key: 'command' | 'skill';
  title: string;
  rows: readonly ComposerSkill[];
  onPick?: (name: string) => void;
}

interface Props {
  sections: readonly Section[];
  /** The draft: the list starts at its top again on a new query. */
  query: string;
  closeLabel: string;
  onClose: () => void;
  testID: string;
}

function Heading({ title }: { title: string }) {
  return (
    <Text variant="caption" tone="secondary" semibold>
      {title.toUpperCase()}
    </Text>
  );
}

/**
 * The Composer's `/` panel: each non-empty section under its heading (commands, then skills), the
 * first heading pinned beside Close, the rows scrolling under it.
 */
export function ComposerSuggestions({ sections, query, closeLabel, onClose, testID }: Props) {
  const styles = useStyles();
  const shown = sections.filter((section) => section.rows.length > 0);
  const [first] = shown;
  if (!first) return null;
  return (
    <View style={styles.panel} testID={`${testID}-skills`}>
      <View style={styles.head}>
        <Heading title={first.title} />
        <Tappable
          style={styles.close}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          testID={`${testID}-skills-close`}
        >
          <Icon name="close" size={16} />
        </Tappable>
      </View>
      <BoundedScroll
        share={MAX_SHARE}
        resetKey={query}
        spaced={false}
        testID={`${testID}-skills-list`}
      >
        {shown.map((section, index) => (
          <View key={section.key} testID={`${testID}-${section.key}-section`}>
            {index > 0 ? (
              <View style={styles.section}>
                <Heading title={section.title} />
              </View>
            ) : null}
            {section.rows.map((row) => (
              <Tappable
                key={row.name}
                onPress={() => section.onPick?.(row.name)}
                accessibilityRole="button"
                accessibilityLabel={[row.name, row.description, row.hint]
                  .filter(Boolean)
                  .join('. ')}
                style={styles.row}
                testID={`${testID}-${section.key}-${row.name}`}
              >
                <View style={styles.nameLine}>
                  <Text variant="body" monospaced style={styles.name} numberOfLines={1}>
                    {row.name}
                  </Text>
                  {row.hint ? (
                    <Text variant="caption" tone="secondary">
                      {row.hint}
                    </Text>
                  ) : null}
                </View>
                <Text variant="caption" tone="secondary" numberOfLines={1}>
                  {row.description}
                </Text>
              </Tappable>
            ))}
          </View>
        ))}
      </BoundedScroll>
    </View>
  );
}
