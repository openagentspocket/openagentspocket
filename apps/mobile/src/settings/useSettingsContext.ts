import { resolveThemeId, summarizeRunningUpdate } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { themes } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { appBuild } from '@/diagnostics/appBuild';
import type { AppUpdates } from '@/updates/appUpdates';
import { useAppUpdates, useAuthenticator, useSettings } from './SettingsProvider';
import type { SettingsContext } from './schema';
import { useSettingsSummary } from './useSettingsSummary';

/** The theme in force: the chosen one, or the Dark/Light pair slot of the system scheme. */
export function useResolvedThemeId() {
  const values = useSettings();
  const scheme = useColorScheme();
  return resolveThemeId(values, scheme === 'light' ? 'light' : 'dark');
}

/**
 * The running update as Settings shows it: the binary's own JS, or an update's short id as the
 * value with its date as the row's secondary line (both on one line do not fit a phone row).
 */
export function runningUpdateRow(updates: AppUpdates): { running: string; runningDate?: string } {
  const summary = summarizeRunningUpdate(updates.running());
  if (summary.kind === 'embedded') return { running: t('Built In') };
  return { running: summary.shortId, runningDate: summary.date ?? undefined };
}

/** What schema rows read: the values, the device's authentication kind, version, theme name. */
export function useSettingsContext(): SettingsContext {
  const values = useSettings();
  const authenticator = useAuthenticator();
  const [authKind, setAuthKind] = useState<string | null>(null);
  const themeId = useResolvedThemeId();
  const summary = useSettingsSummary();
  const updates = useAppUpdates();

  useEffect(() => {
    let alive = true;
    authenticator.kind().then((kind) => {
      if (alive) setAuthKind(kind);
    });
    return () => {
      alive = false;
    };
  }, [authenticator]);

  return {
    values,
    authKind,
    version: appBuild().version,
    updates: { enabled: updates.enabled, ...runningUpdateRow(updates) },
    themeName: themes[themeId].name,
    themeId,
    summary,
  };
}
