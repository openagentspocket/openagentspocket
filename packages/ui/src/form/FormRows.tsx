import { useState } from 'react';
import { type AccessibilityActionEvent, Switch, View } from 'react-native';
import { ActionMenu } from '../overlay/ActionMenu';
import { Button } from '../primitives/Button';
import { Icon, type IconName } from '../primitives/Icon';
import { ListRow, type ListRowProps } from '../primitives/ListRow';
import { Text } from '../primitives/Text';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    minHeight: t.metrics.minTapSize + 8,
    paddingHorizontal: t.spacing.md,
    paddingVertical: t.spacing.xs,
  },
  text: { flex: 1, gap: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xxs },
  value: { minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
}));

interface ToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
  testID?: string;
}

/** A setting that is on or off. */
export function ToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  disabled,
  testID,
}: ToggleRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={styles.text} importantForAccessibility="no-hide-descendants">
        <Text>{title}</Text>
        {subtitle ? (
          <Text variant="footnote" tone="secondary">
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        trackColor={{ false: theme.colors.control, true: theme.colors.accent }}
        ios_backgroundColor={theme.colors.control}
        testID={testID}
      />
    </View>
  );
}

export interface PickerOption<V extends string> {
  value: V;
  label: string;
  /** Starts a titled group in the menu ("Recent"). */
  section?: string;
  /** A second line under the label (a path). */
  subtitle?: string;
  icon?: IconName;
}

interface PickerRowProps<V extends string> {
  title: string;
  options: readonly PickerOption<V>[];
  value: V;
  onChange: (value: V) => void;
  disabled?: boolean;
  /** Ink of the shown value; accent by default, secondary for "None reported". */
  valueTone?: ListRowProps['valueTone'];
  testID?: string;
}

/** A setting with a few choices: shows the current one, opens a menu of all with a checkmark. */
export function PickerRow<V extends string>({
  title,
  options,
  value,
  onChange,
  disabled,
  valueTone = 'accent',
  testID,
}: PickerRowProps<V>) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <>
      <ListRow
        title={title}
        value={current?.label}
        valueTone={valueTone}
        trailing={
          <Icon
            name="chevronUpDown"
            size={13}
            color={valueTone === 'accent' ? 'accent' : 'textTertiary'}
          />
        }
        onPress={() => setOpen(true)}
        disabled={disabled}
        testID={testID}
      />
      <ActionMenu
        title={title}
        visible={open}
        onClose={() => setOpen(false)}
        items={options.map((option) => ({
          key: option.value,
          title: option.label,
          checked: option.value === value,
          section: option.section,
          subtitle: option.subtitle,
          icon: option.icon,
          onPress: () => onChange(option.value),
        }))}
        testID={testID ? `${testID}-menu` : undefined}
      />
    </>
  );
}

interface StepperRowProps {
  title: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  decrementLabel?: string;
  incrementLabel?: string;
  testID?: string;
}

/** A number setting with minus and plus; adjustable for screen readers (swipe up or down). */
export function StepperRow({
  title,
  value,
  onChange,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  step = 1,
  format = String,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  testID,
}: StepperRowProps) {
  const styles = useStyles();
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));
  const onAction = (event: AccessibilityActionEvent) => {
    if (event.nativeEvent.actionName === 'increment') set(value + step);
    if (event.nativeEvent.actionName === 'decrement') set(value - step);
  };
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={title}
      accessibilityValue={{ text: format(value) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={onAction}
      testID={testID}
    >
      <Text style={styles.text}>{title}</Text>
      <View style={styles.stepper}>
        <Button
          kind="secondary"
          size="small"
          icon="remove"
          accessibilityLabel={decrementLabel}
          disabled={value <= min}
          onPress={() => set(value - step)}
          testID={testID ? `${testID}-decrement` : undefined}
        />
        <Text style={styles.value}>{format(value)}</Text>
        <Button
          kind="secondary"
          size="small"
          icon="add"
          accessibilityLabel={incrementLabel}
          disabled={value >= max}
          onPress={() => set(value + step)}
          testID={testID ? `${testID}-increment` : undefined}
        />
      </View>
    </View>
  );
}

type NavRowProps = Omit<ListRowProps, 'chevron' | 'onPress' | 'swipeActions'> & {
  onPress: () => void;
};

/** A row that pushes a screen: title, current value, chevron. */
export function NavRow(props: NavRowProps) {
  return <ListRow {...props} chevron />;
}
