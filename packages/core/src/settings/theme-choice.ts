import {
  type Appearance,
  type SettingsThemeId,
  type SettingsValues,
  THEME_APPEARANCE,
} from './preferences';

/** The theme in force: the chosen one, or with Follow System the pair slot of the system scheme. */
export function resolveThemeId(
  prefs: Pick<SettingsValues, 'followSystem' | 'theme' | 'darkTheme' | 'lightTheme'>,
  systemScheme: Appearance,
): SettingsThemeId {
  if (!prefs.followSystem) return prefs.theme;
  return systemScheme === 'dark' ? prefs.darkTheme : prefs.lightTheme;
}

/**
 * What choosing `id` changes: the app theme, or with Follow System the Dark or Light slot its
 * appearance fills (a theme can only fill the slot of its own appearance).
 */
export function themeSelectionPatch(
  prefs: Pick<SettingsValues, 'followSystem'>,
  id: SettingsThemeId,
): Partial<SettingsValues> {
  if (!prefs.followSystem) return { theme: id };
  return THEME_APPEARANCE[id] === 'dark' ? { darkTheme: id } : { lightTheme: id };
}

/** The slot `id` fills with Follow System on, or null. */
export function themeSlot(
  prefs: Pick<SettingsValues, 'followSystem' | 'darkTheme' | 'lightTheme'>,
  id: SettingsThemeId,
): Appearance | null {
  if (!prefs.followSystem) return null;
  const appearance = THEME_APPEARANCE[id];
  return (appearance === 'dark' ? prefs.darkTheme : prefs.lightTheme) === id ? appearance : null;
}
