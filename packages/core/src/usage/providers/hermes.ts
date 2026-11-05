import type { UsageProvider } from './provider';

/** Hermes Agent on OpenRouter: the key's credit limit as windows. See ADR 0025 for the collector. */
export const hermesProvider: UsageProvider = {
  id: 'hermes',
  displayName: 'Hermes',
  brand: 'hermes',
};
