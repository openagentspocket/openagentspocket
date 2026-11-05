import { Screen } from '@openagentspocket/ui';
import { HeaderHeightContext } from 'expo-router/build/react-navigation/elements/index';
import { type ComponentProps, useContext } from 'react';
import { NavigatorHeader } from './NavigatorHeader';

/**
 * The one screen scaffold of the app: the shared `Screen` (background, safe area, padding, scroll,
 * keyboard) plus the navigator's header, which follows the screen's header variant so the two can
 * never disagree. `native` shows the navigator's header (titled by `header.title`); `large`, `sheet`
 * and a full-bleed screen without a header hide it and draw their own.
 */
export function AppScreen({ header, ...props }: ComponentProps<typeof Screen>) {
  // The native header is transparent (the screen's own background shows through it), so the content
  // starts below it by the height the navigator measured.
  const headerHeight = useContext(HeaderHeightContext);
  return (
    <>
      <NavigatorHeader header={header} />
      <Screen
        header={header}
        headerInset={header?.variant === 'native' ? (headerHeight ?? 0) : 0}
        {...props}
      />
    </>
  );
}
