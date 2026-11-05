import { t } from '@openagentspocket/i18n';
import { TerminalThemePicker, TerminalThemePreview, themes } from '@openagentspocket/ui';
import { useSettingsStore } from './SettingsProvider';
import type { SettingsContext } from './schema';
import { terminalPalette, terminalThemeOptions } from './terminalPalettes';

/** Settings > Theme > Terminal Palette: a live preview, then one swatch row per curated palette. */
export function TerminalPaletteScreen({ ctx }: { ctx: SettingsContext }) {
  const store = useSettingsStore();
  const appearance = themes[ctx.themeId].appearance;
  const selected = ctx.values.terminalTheme;
  return (
    <TerminalThemePicker
      themes={terminalThemeOptions(appearance)}
      selectedId={selected}
      onSelect={(id) => store.set('terminalTheme', id as typeof selected)}
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
