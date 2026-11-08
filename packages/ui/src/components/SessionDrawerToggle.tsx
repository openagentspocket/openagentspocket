import { View } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { withAlpha } from '../theme/color';
import { airy } from '../theme/metrics';
import { makeStyles, useTheme } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  toggles: {
    flexDirection: 'row',
    borderRadius: 999,
    backgroundColor: t.colors.control,
    padding: airy.badgeV,
  },
  toggle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

export type DrawerView = 'tree' | 'agents';

/** The drawer's view switch: the Workspace tree, or the Agents grouped by status. */
export function ViewToggle({
  view,
  onChange,
  labels,
  testID,
}: {
  view: DrawerView;
  onChange: (view: DrawerView) => void;
  labels: Record<DrawerView, string>;
  testID: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.toggles}>
      {(['tree', 'agents'] as const).map((mode) => {
        const active = view === mode;
        return (
          <Tappable
            key={mode}
            style={[
              styles.toggle,
              active && { backgroundColor: withAlpha(theme.colors.accent, 0.25) },
            ]}
            onPress={() => onChange(mode)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={labels[mode]}
            testID={`${testID}-view-${mode}`}
          >
            <Icon
              name={mode === 'tree' ? 'list' : 'people'}
              size={18}
              tint={active ? theme.colors.accent : undefined}
            />
          </Tappable>
        );
      })}
    </View>
  );
}
