import { getLocale, getLocaleTag, t, translate } from '@openagentspocket/i18n';
import {
  TerminalThemePicker,
  TerminalThemePreview,
  terminalPalette,
  terminalThemeOptions,
  useTheme,
} from '@openagentspocket/ui';
import { useSettingsStore } from './SettingsProvider';
import type { SettingsContext } from './schema';

/** The registry's English titles and descriptions are the catalog keys (a missing key renders as itself). */
export const translateThemeText = (text: string) =>
  translate(getLocale(), 'app', text, [], getLocaleTag());

/** Settings > Theme > Terminal Palette: a live preview, then one swatch row per registered palette. */
export function TerminalPaletteScreen({ ctx }: { ctx: SettingsContext }) {
  const store = useSettingsStore();
  // The appearance on screen (the app theme in force), which picks the slot being edited.
  const appearance = useTheme().appearance;
  const slot = appearance === 'dark' ? 'terminalThemeDark' : 'terminalThemeLight';
  const selected = ctx.values[slot];
  return (
    <TerminalThemePicker
      themes={terminalThemeOptions(appearance, translateThemeText)}
      selectedId={selected}
      onSelect={(id) => store.set(slot, id)}
      preview={
        <TerminalThemePreview
          palette={terminalPalette(selected, appearance)}
          fontSize={ctx.values.terminalFontSize + 3}
        />
      }
      footnote={t(
        'Changes apply instantly to current and future Attach terminals without reconnecting.',
      )}
      selectedLabel={t('Selected')}
    />
  );
}
