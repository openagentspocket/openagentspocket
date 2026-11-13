import { claudeProvider } from './claude';
import { codexProvider } from './codex';
import { hermesProvider } from './hermes';
import type { UsageProvider } from './provider';

/** Card order. A provider shows only on Hosts whose plugin reports a program with its id. */
export const BUILTIN_PROVIDERS: readonly UsageProvider[] = [
  claudeProvider,
  codexProvider,
  hermesProvider,
];
