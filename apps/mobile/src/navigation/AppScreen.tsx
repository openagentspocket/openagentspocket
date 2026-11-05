import { Screen } from '@openagentspocket/ui';
import type { ComponentProps } from 'react';
import { NavigatorHeader } from './NavigatorHeader';

/**
 * The one screen scaffold of the app: the shared `Screen` (background, safe area, padding, scroll,
 * keyboard) plus the navigator's header, which follows the screen's header variant so the two can
 * never disagree. `native` shows the navigator's header (titled by `header.title`); `large`, `sheet`
 * and a full-bleed screen without a header hide it and draw their own.
 */
export function AppScreen({ header, ...props }: ComponentProps<typeof Screen>) {
  return (
    <>
      <NavigatorHeader header={header} />
      <Screen header={header} {...props} />
    </>
  );
}
