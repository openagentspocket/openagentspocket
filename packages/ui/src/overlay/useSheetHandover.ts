import { useRef } from 'react';

/**
 * A choice made in a sheet that leads to a route or to another sheet must wait until the sheet has
 * left: iOS cannot present anything while a presentation is still being dismissed (the app freezes).
 * `after(run)` before closing the sheet; give `onDismissed` to the sheet.
 */
export function useSheetHandover(): { after: (run: () => void) => void; onDismissed: () => void } {
  const pending = useRef<(() => void) | null>(null);
  return {
    after: (run) => {
      pending.current = run;
    },
    onDismissed: () => {
      const run = pending.current;
      pending.current = null;
      run?.();
    },
  };
}
