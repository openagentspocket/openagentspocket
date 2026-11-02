import { resolveThemeId } from '@openagentspocket/core';
import { themes } from '@openagentspocket/ui';
import Constants from 'expo-constants';
import { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { useAuthenticator, useSettings } from './SettingsProvider';
import type { SettingsContext } from './schema';

/** The theme in force: the chosen one, or the Dark/Light pair slot of the system scheme. */
export function useResolvedThemeId() {
  const values = useSettings();
  const scheme = useColorScheme();
  return resolveThemeId(values, scheme === 'light' ? 'light' : 'dark');
}

/** What schema rows read: the values, the device's authentication kind, version, theme name. */
export function useSettingsContext(): SettingsContext {
  const values = useSettings();
  const authenticator = useAuthenticator();
  const [authKind, setAuthKind] = useState<string | null>(null);
  const themeId = useResolvedThemeId();

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
    version: Constants.expoConfig?.version ?? '',
    themeName: themes[themeId].name,
  };
}
