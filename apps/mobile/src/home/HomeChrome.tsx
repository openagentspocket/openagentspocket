import { t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  Button,
  EmptyState,
  FAB_SIZE,
  Fab,
  HostScopeMenu,
  LargeTitleBar,
  makeStyles,
  useChromeInsets,
  useTheme,
} from '@openagentspocket/ui';
import { View } from 'react-native';
import { isDemoModeForced, setDemoModeSetting } from '@/connections/mode';
import type { useHostScope } from '../console/useHostScope';
import type { useUsageRing } from './UsageRingSlot';

const useStyles = makeStyles((th) => ({
  strip: { alignItems: 'flex-end', paddingRight: th.metrics.screenInset },
  floating: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  empty: { flex: 1 },
}));

/**
 * The Home header: one pill at the leading edge (the Host scope menu: the Hosts, then All Agents and
 * Sessions under Browse), the Usage ring and the Settings gear in a capsule at the trailing edge.
 * Without a Host there is nothing to scope or browse, so no pill.
 */
export function HomeTitle({
  usage,
  scope,
  onOpenSettings,
  onOpenAgents,
  onOpenSessions,
}: {
  usage: ReturnType<typeof useUsageRing>;
  scope?: ReturnType<typeof useHostScope>;
  onOpenSettings?: () => void;
  onOpenAgents?: () => void;
  onOpenSessions?: () => void;
}) {
  return (
    <LargeTitleBar
      leading={
        scope ? (
          <HostScopeMenu
            items={[
              ...scope.items.map((item, i) => (i === 0 ? { ...item, section: t('Hosts') } : item)),
              {
                key: 'browse-agents',
                title: t('All Agents'),
                icon: 'list',
                section: t('Browse'),
                onPress: () => onOpenAgents?.(),
              },
              {
                key: 'browse-sessions',
                title: t('Sessions'),
                icon: 'terminal',
                onPress: () => onOpenSessions?.(),
              },
            ]}
            label={scope.label}
            accessibilityLabel={t('Hosts and Lists')}
            testID="home-host-scope"
          />
        ) : undefined
      }
      actions={[
        { label: t('Usage'), node: usage.ring, onPress: usage.open },
        { label: t('Settings'), icon: 'settings', onPress: () => onOpenSettings?.() },
      ]}
    />
  );
}

/** Height the list reserves at its end so the last row never hides behind the + button. */
export function useNewStripHeight(): number {
  return FAB_SIZE + useChromeInsets().bottom + useTheme().spacing.xs;
}

/** The + button floats bottom trailing over the list (content peeks beneath, as in Swift). */
export function NewStrip({ items }: { items: readonly ActionMenuItem[] }) {
  const styles = useStyles();
  const { bottom } = useChromeInsets();
  return (
    <View
      style={[styles.strip, styles.floating, { paddingBottom: bottom }]}
      pointerEvents="box-none"
    >
      <Fab items={items} accessibilityLabel={t('New')} menuTitle={t('New')} />
    </View>
  );
}

/**
 * First run: nothing to show until a Host exists. Try the Demo turns on the same remembered switch
 * as Settings › General › Demo Mode (where it is turned off), for anyone without a Host at hand.
 */
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
            {isDemoModeForced() ? null : (
              <Button
                kind="secondary"
                icon="sparkles"
                pill
                title={t('Try the Demo')}
                onPress={() => setDemoModeSetting(true)}
                testID="home-try-demo"
              />
            )}
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
