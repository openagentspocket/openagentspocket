import { agentBarEntries } from './agentBar';
import { agentRowsEntries } from './agentRows';
import { blockedTerminalEntries } from './blockedTerminal';
import { chatRowsEntries } from './chatRows';
import { choiceCommandEntries } from './choiceCommand';
import { composerExtrasEntries } from './composerExtras';
import { homeShellEntries } from './homeShell';
import { hostsSettingsFilesEntries } from './hostsSettingsFiles';
import { navSheetsEntries } from './navSheets';
import { settingsPickersEntries } from './settingsPickers';
import type { CatalogEntry } from './types';
import { usageEntries } from './usage';

/**
 * Every implemented catalog component, in catalog order. Each UX3 task fills its own group file;
 * this registry is the only place that lists the groups.
 */
export const componentCatalog: readonly CatalogEntry[] = [
  ...agentRowsEntries,
  ...homeShellEntries,
  ...navSheetsEntries,
  ...agentBarEntries,
  ...chatRowsEntries,
  ...blockedTerminalEntries,
  ...usageEntries,
  ...hostsSettingsFilesEntries,
  ...settingsPickersEntries,
  ...composerExtrasEntries,
  ...choiceCommandEntries,
];

export function findCatalogEntry(name: string | undefined): CatalogEntry | undefined {
  return componentCatalog.find((entry) => entry.name === name);
}

/** `Name` or `Name.variant`; the variant defaults to `default`. */
export function parseCatalogKey(key: string): { name: string; variantId: string } {
  const [name = '', variantId = 'default'] = key.split('.');
  return { name, variantId };
}
