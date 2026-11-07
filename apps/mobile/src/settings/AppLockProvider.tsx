import { createContext, type ReactNode, useContext } from 'react';
import { type AppLockView, useAppLock } from './useAppLock';

const AppLockContext = createContext<AppLockView | null>(null);

/** Holds the one app lock: the cover draws it, and what must wait for the owner reads it. */
export function AppLockProvider({ children }: { children: ReactNode }) {
  return <AppLockContext.Provider value={useAppLock()}>{children}</AppLockContext.Provider>;
}

export function useAppLockState(): AppLockView {
  const lock = useContext(AppLockContext);
  if (!lock) throw new Error('useAppLockState must be used inside <AppLockProvider>');
  return lock;
}
