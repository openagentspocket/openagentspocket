import { t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  Button,
  EmptyState,
  FAB_SIZE,
  Fab,
  LargeTitleBar,
  makeStyles,
  useTheme,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import type { useUsageRing } from './UsageRingSlot';

const useStyles = makeStyles((th) => ({
  strip: {
    height: FAB_SIZE + 2 * th.spacing.xs,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: th.metrics.screenInset,
  },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  empty: { flex: 1 },
}));

/** The Home header: All Agents and Sessions in a capsule at the leading edge, the Usage ring and the Settings gear in one at the trailing edge. */
export function HomeTitle({
  usage,
  onOpenSettings,
  onOpenAgents,
  onOpenSessions,
}: {
  usage: ReturnType<typeof useUsageRing>;
  onOpenSettings?: () => void;
  onOpenAgents?: () => void;
  onOpenSessions?: () => void;
}) {
  return (
    <LargeTitleBar
      leadingActions={[
        { label: t('All Agents'), icon: 'list', onPress: () => onOpenAgents?.() },
        { label: t('Sessions'), icon: 'terminal', onPress: () => onOpenSessions?.() },
      ]}
      actions={[
        { label: t('Usage'), node: usage.ring, onPress: usage.open },
        { label: t('Settings'), icon: 'settings', onPress: () => onOpenSettings?.() },
      ]}
    />
  );
}

/** Height the list reserves at its end so the last row never hides behind the + button. */
export function useNewStripHeight(): number {
  return FAB_SIZE + 2 * useTheme().spacing.xs;
}

/** The + button floats bottom trailing over the list (content peeks beneath, as in Swift). */
export function NewStrip({ items }: { items: readonly ActionMenuItem[] }) {
  const styles = useStyles();
  return (
    <View style={[styles.strip, styles.floating]} pointerEvents="box-none">
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
