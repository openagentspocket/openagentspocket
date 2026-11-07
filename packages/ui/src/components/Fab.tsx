import { useState } from 'react';
import { impact } from '../haptics';
import { type ActionMenuItem, isDeadMenuTrigger } from '../overlay/ActionMenu';
import { useSheetHandover } from '../overlay/useSheetHandover';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { withAlpha } from '../theme/color';
import { makeStyles, useTheme } from '../theme/theme';
import { ChoiceSheet } from './ChoiceSheet';

export const FAB_SIZE = 58;
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
  /** The New choices (New Agent, New Terminal, Add Host): `subtitle` is the sentence under each title. */
  items: readonly ActionMenuItem[];
  accessibilityLabel: string;
  menuTitle?: string;
  /** Hidden while a sheet is up. */
  hidden?: boolean;
  onPress?: () => void;
  testID?: string;
}

/** Swift's Home FAB: 58 pt accent circle with a plus and a soft accent glow; opens the New menu. */
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
  const handover = useSheetHandover();
  if (hidden || isDeadMenuTrigger(items, onPress)) return null;
  return (
    <>
      <Tappable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={() => {
          impact('light');
          onPress?.();
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.fab,
          // A theme with no glow (its token is the canvas) gets no halo either.
          {
            shadowColor: withAlpha(
              theme.colors.accent,
              theme.colors.glow === theme.colors.canvas ? 0 : GLOW_OPACITY,
            ),
          },
          pressed && styles.pressed,
        ]}
        testID={testID}
      >
        <Icon name="add" size={24} tint={theme.colors.onAccent} />
      </Tappable>
      <ChoiceSheet
        visible={open}
        title={menuTitle ?? accessibilityLabel}
        onClose={() => setOpen(false)}
        onDismissed={handover.onDismissed}
        testID={`${testID}-sheet`}
        options={items.map((item) => ({
          id: item.key,
          icon: item.icon ?? 'add',
          title: item.title,
          description: item.subtitle,
          onPress: () => {
            handover.after(item.onPress);
            setOpen(false);
          },
        }))}
      />
    </>
  );
}
