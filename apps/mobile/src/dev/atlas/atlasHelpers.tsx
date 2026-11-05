import { Stack } from 'expo-router';
import type { ReactNode } from 'react';

/** A screen pushed under a native header with the given title (empty: no title). */
export const titled = (title: string, body: ReactNode): ReactNode => (
  <>
    <Stack.Screen options={{ headerShown: true, title }} />
    {body}
  </>
);

export const noop = () => {};
