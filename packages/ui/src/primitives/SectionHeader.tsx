import { Pressable, View } from 'react-native';
import type { Status } from '../theme/status';
import { makeStyles } from '../theme/theme';
import { Badge } from './Badge';
import { Icon } from './Icon';
import { StatusDot } from './StatusDot';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  title: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs, flexShrink: 1 },
  spacer: { flex: 1 },
}));

export interface SectionHeaderAction {
  title: string;
  onPress: () => void;
  /** What screen readers hear, as one whole sentence ("See all Sessions"). */
  accessibilityLabel?: string;
}

interface SectionHeaderProps {
  title: string;
  status?: Status;
  count?: number;
  /** A button at the trailing edge, such as "See all". */
  action?: SectionHeaderAction;
  /** A collapsible header: shows a disclosure chevron and toggles on press. */
  expanded?: boolean;
  onToggle?: () => void;
  testID?: string;
}

/** The fold chevron of a collapsible header: points right, turns down when open. */
export function DisclosureChevron({ expanded }: { expanded: boolean }) {
  return (
    <View style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }} testID="disclosure">
      <Icon name="chevronRight" size={12} />
    </View>
  );
}

/** "NEEDS YOU  3": a section title with an optional status dot and count, read as one heading. */
export function SectionHeader({
  title,
  status,
  count,
  action,
  expanded,
  onToggle,
  testID,
}: SectionHeaderProps) {
  const styles = useStyles();
  const heading = (
    <>
      {onToggle ? <DisclosureChevron expanded={expanded ?? false} /> : null}
      {status ? <StatusDot status={status} /> : null}
      <Text variant="label" tone="secondary" numberOfLines={1}>
        {title.toUpperCase()}
      </Text>
      {count !== undefined ? <Badge label={String(count)} kind="control" /> : null}
    </>
  );
  return (
    <View style={styles.row} testID={testID}>
      {onToggle ? (
        <Pressable
          style={styles.title}
          onPress={onToggle}
          accessibilityRole="header"
          accessibilityState={{ expanded: expanded ?? false }}
        >
          {heading}
        </Pressable>
      ) : (
        <View style={styles.title} accessible accessibilityRole="header">
          {heading}
        </View>
      )}
      <View style={styles.spacer} />
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.accessibilityLabel ?? action.title}
          hitSlop={10}
        >
          <Text variant="caption" tone="accent">
            {action.title}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
