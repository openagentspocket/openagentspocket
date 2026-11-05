import type { UsageProvider } from './provider';

/** OpenCode Go: 5-hour, weekly and monthly allowances. See ADR 0025 for the collector. */
export const opencodeGoProvider: UsageProvider = {
  id: 'opencode-go',
  displayName: 'OpenCode Go',
  brand: 'opencode',
};
