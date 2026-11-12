import { router, usePathname } from 'expo-router';
import { useEffect, useState } from 'react';

const HOME = '/';

/**
 * For the root error boundary: moves the router to Home, then renders the routes again. The root
 * boundary sits inside the router's container, so the router and the route info still work while
 * the layout is replaced. Retrying before the move lands would render the failing route again, so
 * the retry waits until the pathname reads Home. Undefined while the error is already on Home
 * (Try Again does the same there).
 */
export function useGoHomeAndRetry(retry: () => Promise<void>): (() => void) | undefined {
  const pathname = usePathname();
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving && pathname === HOME) void retry();
  }, [leaving, pathname, retry]);
  if (pathname === HOME) return undefined;
  return () => {
    try {
      router.replace(HOME);
      setLeaving(true);
    } catch {
      // The router is not bound (no first render yet): rendering again is all that is left.
      void retry();
    }
  };
}
