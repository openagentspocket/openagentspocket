import { type ReactNode, useEffect } from 'react';

export interface AtlasScript {
  /** testIDs clicked in order after the screen settles (web DOM only). */
  press?: readonly string[];
  /** A testID held down long enough to count as a long press. */
  longPress?: string;
  /** testIDs clicked in order after the long press (its menu items). */
  thenPress?: readonly string[];
  /** Runs once after the screen settles (opens an alert, for example). */
  run?: () => void;
}

const SETTLE_MS = 400;
const HOLD_MS = 600;

/** The few DOM members the web atlas drives; the app has no DOM typings. */
interface DomElement {
  click(): void;
  dispatchEvent(event: unknown): void;
}
interface Dom {
  document?: { querySelector(selector: string): DomElement | null };
  MouseEvent?: new (type: string, init: object) => unknown;
}
const dom = globalThis as unknown as Dom;

function find(testID: string): DomElement | null {
  return dom.document?.querySelector(`[data-testid="${testID}"]`) ?? null;
}

/** Drives a screen into a transient state (open menu, sheet, alert) for the atlas capture. */
export function AtlasActions({ script, children }: { script: AtlasScript; children: ReactNode }) {
  useEffect(() => {
    if (!dom.document || !dom.MouseEvent) return;
    const Mouse = dom.MouseEvent;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let at = SETTLE_MS;
    for (const id of script.press ?? []) {
      timers.push(setTimeout(() => find(id)?.click(), at));
      at += 300;
    }
    if (script.longPress) {
      const id = script.longPress;
      timers.push(
        setTimeout(() => {
          const el = find(id);
          if (!el) return;
          const init = { bubbles: true, cancelable: true, button: 0 } as const;
          el.dispatchEvent(new Mouse('mousedown', init));
          timers.push(setTimeout(() => el.dispatchEvent(new Mouse('mouseup', init)), HOLD_MS));
        }, at),
      );
    }
    if (script.longPress) at += HOLD_MS + SETTLE_MS;
    for (const id of script.thenPress ?? []) {
      timers.push(setTimeout(() => find(id)?.click(), at));
      at += 300;
    }
    if (script.run) timers.push(setTimeout(script.run, at));
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [script]);
  return <>{children}</>;
}
