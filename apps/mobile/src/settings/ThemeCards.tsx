import { type SettingsThemeId, themeSelectionPatch, themeSlot } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  makeStyles,
  ThemeChoiceCard,
  ThemeChoicePreview,
  themeIds,
  themes,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import { useSettingsStore } from './SettingsProvider';
import type { SettingsContext } from './schema';

const DEFAULT_THEME: SettingsThemeId = 'indigo';

const useStyles = makeStyles((th) => ({ list: { gap: th.spacing.xs } }));

/** The active theme drawn as a miniature agent card and terminal (Swift: the Preview section). */
export function ThemePreview({ ctx }: { ctx: SettingsContext }) {
  return (
    <ThemeChoicePreview
      themeId={ctx.themeId}
      agentName="codex"
      statusLabel={t('Blocked')}
      prompt="Run make test?"
      chips={['devbox', 'agentico']}
      terminalPath="~/agentico $"
      terminalCommand="make test"
    />
  );
}

/** One card per built-in theme: name, Dark or Light, palette dots and a check circle. */
export function ThemeCards({ ctx }: { ctx: SettingsContext }) {
  const styles = useStyles();
  const store = useSettingsStore();
  const { values } = ctx;
  return (
    <View style={styles.list}>
      {themeIds.map((id) => {
        const appearance = themes[id].appearance === 'dark' ? t('Dark') : t('Light');
        const subtitle = id === DEFAULT_THEME ? t('%@ · Default', appearance) : appearance;
        const slot = themeSlot(values, id);
        const selected = values.followSystem ? slot !== null : values.theme === id;
        return (
          <ThemeChoiceCard
            key={id}
            themeId={id}
            subtitle={subtitle}
            selected={selected}
            onPress={() => store.update(themeSelectionPatch(values, id))}
            testID={`settings.theme.${id}`}
          />
        );
      })}
    </View>
  );
}
