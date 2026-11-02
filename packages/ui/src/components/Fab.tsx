import { useState } from 'react';
import { Pressable } from 'react-native';
import { impact } from '../haptics';
import { ActionMenu, type ActionMenuItem } from '../overlay/ActionMenu';
import { Icon } from '../primitives/Icon';
import { withAlpha } from '../theme/color';
import { makeStyles, useTheme } from '../theme/theme';

export const FAB_SIZE = 56;
const GLOW_OPACITY = 0.35;

const useStyles = makeStyles((t) => ({
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 8,
  },
  pressed: { opacity: 0.85 },
}));

interface FabProps {
  /** The New menu (New Agent, New Terminal, Add Host). */
  items: readonly ActionMenuItem[];
  accessibilityLabel: string;
  menuTitle?: string;
  /** Hidden while a sheet is up. */
  hidden?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** Swift's Home FAB: 56 pt accent circle with a plus and a soft accent glow; opens the New menu. */
export function Fab({
  items,
  accessibilityLabel,
  menuTitle,
  hidden = false,
  onPress,
  testID = 'fab',
}: FabProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  if (hidden) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          impact('light');
          onPress?.();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.fab,
          { shadowColor: withAlpha(theme.colors.accent, GLOW_OPACITY) },
          pressed && styles.pressed,
        ]}
        testID={testID}
      >
        <Icon name="add" size={24} tint={theme.colors.onAccent} />
      </Pressable>
      <ActionMenu items={items} title={menuTitle} visible={open} onClose={() => setOpen(false)} />
    </>
  );
}
