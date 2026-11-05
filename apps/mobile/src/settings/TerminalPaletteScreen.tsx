import { getLocale, getLocaleTag, t, translate } from '@openagentspocket/i18n';
import {
  TerminalThemePicker,
  TerminalThemePreview,
  terminalPalette,
  terminalThemeOptions,
  themes,
} from '@openagentspocket/ui';
import { useSettingsStore } from './SettingsProvider';
import type { SettingsContext } from './schema';

/** The registry's English titles and descriptions are the catalog keys (a missing key renders as itself). */
export const translateThemeText = (text: string) =>
  translate(getLocale(), 'app', text, [], getLocaleTag());

/** Settings > Theme > Terminal Palette: a live preview, then one swatch row per registered palette. */
export function TerminalPaletteScreen({ ctx }: { ctx: SettingsContext }) {
  const store = useSettingsStore();
  const appearance = themes[ctx.themeId].appearance;
  const selected = ctx.values.terminalTheme;
  return (
    <TerminalThemePicker
      themes={terminalThemeOptions(appearance, translateThemeText)}
      selectedId={selected}
      onSelect={(id) => store.set('terminalTheme', id)}
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
