import type { ListeningPort, PortsStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  AsyncContent,
  Banner,
  Button,
  EmptyState,
  MetaChip,
  type ScreenHeader,
  Section,
  useHandoverSheet,
  useStoreState,
} from '@openagentspocket/ui';
import { useEffect } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { OpenPortSheet } from './OpenPortSheet';
import { PortRow } from './PortRow';
import { portsMessage } from './text';
import { useAppActivity } from './useAppActivity';

interface PortsScreenProps {
  store: PortsStore;
  /** The Preview screen is pushed over the list once a preview is opening. */
  onOpenPreview: () => void;
  /** Dismisses the sheet (Done). */
  onDone?: () => void;
}

/** browser.ports: the TCP servers listening on one Host, one row per port; a row opens its preview. */
export function PortsScreen({ store, onOpenPreview, onDone }: PortsScreenProps) {
  const state = useStoreState(store);
  const entering = useHandoverSheet();
  useAppActivity(store);
  useEffect(() => {
    store.start();
  }, [store]);

  const open = (port: ListeningPort) => {
    store.open(port);
    if (store.getState().preview) onOpenPreview();
  };
  const openTyped = (port: number) =>
    entering.closeThen(() => {
      store.openPort(port);
      onOpenPreview();
    });
  const { listing } = state;
  const refresh = () => store.refresh();

  const rows = store.visiblePorts;
  const hidden = store.hiddenCount;
  const body = (
    <AsyncContent
      loading={listing === null || listing.kind === 'loading'}
      loadingLabel={t('Looking for servers on %@…', store.hostName)}
      failure={
        listing?.kind === 'failed'
          ? {
              summary: t("Couldn't List Ports"),
              recovery: portsMessage(listing.message),
              onRetry: refresh,
              retryLabel: t('Try Again'),
              testID: 'ports-failure',
            }
          : null
      }
    >
      <>
        {store.isTruncated ? (
          <Banner tone="warning" title={t('The Host has more servers than this list shows.')} />
        ) : null}
        {state.refreshFailure ? (
          <Banner
            tone="danger"
            title={portsMessage(state.refreshFailure)}
            testID="ports-refresh-failure"
          />
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            icon="globe"
            title={t('No Servers')}
            message={
              hidden > 0
                ? t('Only system ports are listening on %@.', store.hostName)
                : t('Nothing on %@ is listening for connections.', store.hostName)
            }
            layout="compact"
            testID="ports-empty"
          />
        ) : (
          <Section>
            {rows.map((port) => (
              <PortRow key={port.port} port={port} onOpen={open} />
            ))}
          </Section>
        )}
        {hidden > 0 ? (
          <Button
            kind="text"
            title={state.showsAll ? t('Hide System Ports') : t('Show All (%lld more)', hidden)}
            onPress={() => store.setShowsAll(!state.showsAll)}
            testID="ports-show-all"
          />
        ) : null}
      </>
    </AsyncContent>
  );
  const bar: ScreenHeader = {
    variant: 'sheet',
    title: t('Ports'),
    leading: { label: t('Done'), onPress: onDone ?? (() => {}), testID: 'ports-done' },
    trailing: [
      {
        label: t('Open Port…'),
        icon: 'hash',
        onPress: () => entering.open(true),
        testID: 'ports-open-port',
      },
    ],
  };
  return (
    <AppScreen
      header={bar}
      refreshing={state.isRefreshing}
      onRefresh={refresh}
      testID="ports-screen"
    >
      <MetaChip label={t('Host %@', store.hostName)} icon="server" testID="ports-host" />
      {body}
      <OpenPortSheet
        visible={entering.visible}
        hostName={store.hostName}
        onClose={entering.close}
        onDismissed={entering.onDismissed}
        onOpen={openTyped}
      />
    </AppScreen>
  );
}
