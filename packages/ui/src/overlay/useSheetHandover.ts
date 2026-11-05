import { useCallback, useRef, useState } from 'react';

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

/**
 * The state of a sheet that may hand over. `value` is what it shows (a row, an id) and outlives
 * `visible` until the sheet has left, so the content stays while it slides away; `closeThen(run)`
 * closes and runs `run` once it has left. Spread nothing: give `visible` and `onDismissed` to the sheet.
 */
export function useHandoverSheet<T = true>(initial?: T) {
  const [value, setValue] = useState(initial);
  const [visible, setVisible] = useState(initial !== undefined);
  const handover = useSheetHandover();
  const close = useCallback(() => setVisible(false), []);
  return {
    value,
    visible,
    open: (next: T) => {
      setValue(next);
      setVisible(true);
    },
    close,
    closeThen: (run: () => void) => {
      // A closed sheet never reports a dismissal: nothing to wait for.
      if (!visible) return run();
      handover.after(run);
      close();
    },
    onDismissed: () => {
      setValue(undefined);
      handover.onDismissed();
    },
  };
}
