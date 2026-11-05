import { View } from 'react-native';
import { SearchField, type SearchFieldProps } from '../form/SearchField';
import { Button } from '../primitives/Button';
import { GlassCapsule } from '../primitives/GlassCapsule';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    paddingBottom: t.spacing.xs,
  },
  field: { flex: 1 },
  close: { width: t.metrics.minTapSize, height: t.metrics.minTapSize, justifyContent: 'center' },
}));

interface SearchBarProps extends Omit<SearchFieldProps, 'label' | 'value' | 'onChangeText'> {
  /** The placeholder and accessibility label of the field ("Search Agents"). */
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  /** Leaves search mode (the owner clears the query). */
  onClose: () => void;
  closeLabel?: string;
}

/** A search field with a glass close circle: the bar that takes over the top of a list while searching. */
export function SearchBar({
  onClose,
  closeLabel = 'Cancel',
  testID = 'search-bar',
  ...field
}: SearchBarProps) {
  const styles = useStyles();
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.field}>
        <SearchField {...field} testID={`${testID}-field`} />
      </View>
      <GlassCapsule style={styles.close}>
        <Button
          kind="text"
          icon="close"
          accessibilityLabel={closeLabel}
          onPress={onClose}
          testID={`${testID}-close`}
        />
      </GlassCapsule>
    </View>
  );
}
