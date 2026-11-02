import { t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  Button,
  EmptyState,
  FAB_SIZE,
  Fab,
  LargeTitleBar,
  makeStyles,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import type { useUsageRing } from './UsageRingSlot';

const PRODUCT_NAME = 'OpenAgentsPocket';

const useStyles = makeStyles((th) => ({
  strip: {
    height: FAB_SIZE + 2 * th.spacing.xs,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: th.metrics.screenInset,
  },
  empty: { flex: 1 },
}));

/** The large title with the Usage ring and the Settings gear in one glass capsule. */
export function HomeTitle({
  usage,
  onOpenSettings,
}: {
  usage: ReturnType<typeof useUsageRing>;
  onOpenSettings?: () => void;
}) {
  return (
    <LargeTitleBar
      title={PRODUCT_NAME}
      actions={[
        { label: t('Usage'), node: usage.ring, onPress: usage.open },
        { label: t('Settings'), icon: 'settings', onPress: () => onOpenSettings?.() },
      ]}
    />
  );
}

/** The reserved strip under the list that holds the + button. */
export function NewStrip({ items }: { items: readonly ActionMenuItem[] }) {
  const styles = useStyles();
  return (
    <View style={styles.strip}>
      <Fab items={items} accessibilityLabel={t('New')} />
    </View>
  );
}

/** First run: nothing to show until a Host exists. */
export function NoHosts({
  onAddHost,
  onSetupGuide,
}: {
  onAddHost?: () => void;
  onSetupGuide?: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <EmptyState
        icon="server"
        title={t('No Hosts')}
        message={t('Add a machine that runs herdr to see its Agents and Terminals here.')}
        actions={
          <>
            <Button
              icon="add"
              pill
              title={t('Add Host')}
              onPress={() => onAddHost?.()}
              testID="home-add-host"
            />
            <Button
              kind="text"
              title={t('Setup Guide')}
              onPress={() => onSetupGuide?.()}
              testID="home-setup-guide"
            />
          </>
        }
      />
    </View>
  );
}
