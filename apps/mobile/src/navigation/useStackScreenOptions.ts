import { useTheme } from '@openagentspocket/ui';
import type { NativeStackNavigationOptions } from 'expo-router';
import { useMemo } from 'react';
import { stackScreenOptions } from './screenOptions';

/** The themed header options; pass them as `screenOptions` of every Stack layout. */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const theme = useTheme();
  return useMemo(() => stackScreenOptions(theme), [theme]);
}
