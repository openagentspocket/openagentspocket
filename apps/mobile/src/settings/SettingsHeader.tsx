import { t } from '@openagentspocket/i18n';
import { GlassCapsule, impact, makeStyles, Text } from '@openagentspocket/ui';
import { Pressable, View } from 'react-native';

const useStyles = makeStyles((th) => ({
  header: { gap: th.spacing.sm },
  bar: { flexDirection: 'row', alignItems: 'center', minHeight: th.metrics.minTapSize },
  done: { paddingHorizontal: th.spacing.md, justifyContent: 'center', alignSelf: 'stretch' },
}));

/** The Settings sheet's top: a Done capsule at the leading edge, then the large title. */
export function SettingsHeader({ title, onDone }: { title: string; onDone: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.header} testID="settings-header">
      <View style={styles.bar}>
        <GlassCapsule>
          <Pressable
            style={styles.done}
            accessibilityRole="button"
            accessibilityLabel={t('Done')}
            onPress={() => {
              impact('light');
              onDone();
            }}
            testID="settings-done"
          >
            <Text semibold tone="accent">
              {t('Done')}
            </Text>
          </Pressable>
        </GlassCapsule>
      </View>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}
