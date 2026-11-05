import { BUILTIN_PROVIDERS } from './builtin';
import type { UsageProvider } from './provider';

const providers: UsageProvider[] = [...BUILTIN_PROVIDERS];

export const usageProviders = (): readonly UsageProvider[] => providers;

export const usageProvider = (id: string): UsageProvider | undefined =>
  providers.find((provider) => provider.id === id);

/** Adds (or replaces) a provider at runtime; tests and future plugins' extensions use it. */
export function registerUsageProvider(provider: UsageProvider): void {
  const index = providers.findIndex((p) => p.id === provider.id);
  if (index >= 0) providers[index] = provider;
  else providers.push(provider);
}
