import { createContext, useContext } from 'react';
import { type EdgeInsets, SafeAreaInsetsContext } from 'react-native-safe-area-context';

const ZERO: EdgeInsets = { top: 0, right: 0, bottom: 0, left: 0 };
// Stands in when a test mocks the safe-area module without its context.
const Fallback = createContext<EdgeInsets | null>(null);

/** Safe-area insets, or zero outside a SafeAreaProvider (tests, previews) instead of throwing. */
export function useInsets(): EdgeInsets {
  return useContext(SafeAreaInsetsContext ?? Fallback) ?? ZERO;
}
