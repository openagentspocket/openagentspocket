import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';
import { Icon } from '../primitives/Icon';
import { Tappable } from '../primitives/Tappable';
import { makeStyles } from '../theme/theme';

const useStyles = makeStyles((t) => ({
  button: {
    width: t.metrics.minTapSize,
    height: t.metrics.minTapSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/** Whether the on-screen keyboard is up. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const hidden = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);
  return visible;
}

interface KeyboardDismissButtonProps {
  label?: string;
  /** Draws even while no keyboard is up (previews, tests). */
  alwaysVisible?: boolean;
  testID?: string;
}

/**
 * The one "hide the keyboard" control (Swift's keyboard-down glyph): the terminal toolbar and the
 * composer both draw it, and it draws nothing while no keyboard is up.
 */
export function KeyboardDismissButton({
  label = 'Dismiss keyboard',
  alwaysVisible = false,
  testID = 'keyboard-dismiss',
}: KeyboardDismissButtonProps) {
  const styles = useStyles();
  const visible = useKeyboardVisible();
  if (!visible && !alwaysVisible) return null;
  return (
    <Tappable
      style={styles.button}
      onPress={() => Keyboard.dismiss()}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
    >
      <Icon name="keyboardDown" size={22} color="textPrimary" />
    </Tappable>
  );
}
