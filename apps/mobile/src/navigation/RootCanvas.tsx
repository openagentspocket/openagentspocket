import { useTheme } from '@openagentspocket/ui';
import * as SystemUI from 'expo-system-ui';
import { type ReactNode, useEffect } from 'react';
import { View } from 'react-native';

/**
 * The root canvas: the window and the view under every stack are the theme's canvas, so a push or
 * a sheet transition never shows the system's white behind the moving screens.
 */
export function RootCanvas({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.canvas);
  }, [colors.canvas]);
  return <View style={{ flex: 1, backgroundColor: colors.canvas }}>{children}</View>;
}
