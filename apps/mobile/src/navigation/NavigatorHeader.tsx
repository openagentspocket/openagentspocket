import type { ScreenHeader } from '@openagentspocket/ui';
import { Stack } from 'expo-router';

/**
 * Sets the navigator's header for the screen that renders it: shown (with the screen's title) for
 * the `native` variant, hidden for every screen that draws its own. Kept apart from `AppScreen`
 * because `Stack.Screen` needs a navigator, which component tests do not have (jest.setup.js stubs
 * this module).
 */
export function NavigatorHeader({ header }: { header: ScreenHeader | undefined }) {
  const options =
    header?.variant === 'native'
      ? { headerShown: true, ...(header.title ? { title: header.title } : {}) }
      : { headerShown: false };
  return <Stack.Screen options={options} />;
}
