import type { ComponentType } from 'react';
import { PlainTerminal } from './PlainTerminal';
import type { TerminalViewProps } from './terminalTypes';

export type { TerminalHandle, TerminalViewProps } from './terminalTypes';

let native: ComponentType<TerminalViewProps> | null | undefined;

/**
 * The libghostty renderer when the app binary includes it (ADR 0023), else null. Loaded on
 * first use because `expo-libghostty` throws at import when its native view is missing
 * (unit tests, Expo Go, web).
 */
function nativeTerminal(required: boolean): ComponentType<TerminalViewProps> | null {
  if (native === undefined || (required && native === null)) {
    try {
      const { requireOptionalNativeModule } = require('expo');
      if (!requireOptionalNativeModule('ExpoLibghostty')) throw new Error('ExpoLibghostty missing');
      native = require('./GhosttyTerminal').GhosttyTerminal;
    } catch (error) {
      native = null;
      if (required) throw error;
    }
  }
  return native ?? null;
}

/**
 * The one terminal surface for Agent attach and shells. Renders with libghostty when available;
 * otherwise (or with `renderer="plain"`: demo mode, tests, gallery) the plain-text fallback.
 */
export function TerminalView({
  renderer = 'auto',
  ...props
}: TerminalViewProps & { renderer?: 'auto' | 'plain' | 'native' }) {
  const Native = renderer === 'plain' ? null : nativeTerminal(renderer === 'native');
  return Native ? <Native {...props} /> : <PlainTerminal {...props} />;
}
