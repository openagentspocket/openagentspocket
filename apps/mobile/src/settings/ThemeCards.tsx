import { type SettingsThemeId, themeSelectionPatch, themeSlot } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Icon, ListRow, makeStyles, themeIds, themes } from '@openagentspocket/ui';
import { View } from 'react-native';
import { useSettingsStore } from './SettingsProvider';
import type { SettingsContext } from './schema';

const DEFAULT_THEME: SettingsThemeId = 'indigo';

const useStyles = makeStyles((th) => ({
  dots: { flexDirection: 'row', gap: th.spacing.xxs },
  dot: { width: 12, height: 12, borderRadius: 6 },
}));

function Dots({ id }: { id: SettingsThemeId }) {
  const styles = useStyles();
  const { colors } = themes[id];
  return (
    <View style={styles.dots}>
      {[
        colors.accent,
        colors.statusBlocked,
        colors.statusWorking,
        colors.statusDone,
        colors.info,
      ].map((color) => (
        <View key={color} style={[styles.dot, { backgroundColor: color }]} />
      ))}
    </View>
  );
}

/** One card per built-in theme: palette dots, Dark or Light, and which slot it fills. */
export function ThemeCards({ ctx }: { ctx: SettingsContext }) {
  const store = useSettingsStore();
  const { values } = ctx;
  return (
    <>
      {themeIds.map((id) => {
        const appearance = themes[id].appearance === 'dark' ? t('Dark') : t('Light');
        const subtitle = id === DEFAULT_THEME ? t('%@ · Default', appearance) : appearance;
        const slot = themeSlot(values, id);
        const selected = values.followSystem ? slot !== null : values.theme === id;
        return (
          <ListRow
            key={id}
            title={themes[id].name}
            subtitle={subtitle}
            value={slot ? (slot === 'dark' ? t('Dark Theme') : t('Light Theme')) : undefined}
            leading={<Dots id={id} />}
            trailing={selected ? <Icon name="check" color="accent" /> : undefined}
            onPress={() => store.update(themeSelectionPatch(values, id))}
            testID={`settings.theme.${id}`}
          />
        );
      })}
    </>
  );
}
