import { type HostReading, type UsageSource, withClaudeLimits } from '@openagentspocket/core';
import { useState } from 'react';

/** The reading with Claude Code's windows hidden, while the device's switch is off. */
function withoutClaude(reading: HostReading): HostReading {
  if (reading.state.kind !== 'available') return reading;
  const report = withClaudeLimits(reading.state.report, 'disabled', null);
  return { ...reading, state: { ...reading.state, report } };
}

export interface ClaudeLimits {
  enabled: boolean;
  set: (enabled: boolean) => void;
  /** The readings as the switch leaves them: no Claude Code windows while it is off. */
  apply: (readings: readonly HostReading[]) => HostReading[];
}

/**
 * The device's Claude Code limits consent. A live source keeps it; the demo one only remembers it
 * here, per screen.
 */
export function useClaudeLimits(source: UsageSource, initial = true): ClaudeLimits {
  const [local, setLocal] = useState(initial);
  const [, rerender] = useState(0);
  const live = source.claudeLimits;
  const enabled = live ? live.enabled() : local;
  const set = (next: boolean) => {
    if (live) {
      live.set(next);
      rerender((n) => n + 1);
    } else {
      setLocal(next);
    }
  };
  return {
    enabled,
    set,
    apply: (readings) => (enabled ? [...readings] : readings.map(withoutClaude)),
  };
}
