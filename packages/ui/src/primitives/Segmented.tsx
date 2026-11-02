import { Pressable, View } from 'react-native';
import { makeStyles } from '../theme/theme';
import { Text } from './Text';

const useStyles = makeStyles((t) => ({
  track: {
    flexDirection: 'row',
    backgroundColor: t.colors.control,
    borderRadius: t.metrics.chipRadius + 2,
    padding: 2,
  },
  segment: {
    // Natural label width first, spare room shared equally: a label is never clipped.
    flexGrow: 1,
    flexShrink: 0,
    flexBasis: 'auto',
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: t.metrics.chipRadius,
    paddingHorizontal: 4,
    minWidth: 0,
  },
  selected: {
    backgroundColor: t.colors.surfaceRaised,
    borderWidth: t.metrics.hairlineWidth,
    borderColor: t.hairline,
  },
}));

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  accessibilityLabel?: string;
}

interface SegmentedProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accessibilityLabel?: string;
  testID?: string;
}

/**
 * The segmented picker (usage range, list presentation, theme): a control-filled track with
 * the selected segment raised on a hairlined fill. Reads as a radio group.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
  testID = 'segmented',
}: SegmentedProps<T>) {
  const styles = useStyles();
  return (
    <View
      style={styles.track}
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.segment, selected && styles.selected]}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityLabel={option.accessibilityLabel ?? option.label}
            accessibilityState={{ selected, checked: selected }}
            testID={`${testID}-${option.value}`}
          >
            <Text
              variant="footnote"
              semibold={selected}
              tone={selected ? 'primary' : 'secondary'}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
