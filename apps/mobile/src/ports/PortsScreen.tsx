import type { ListeningPort, PortsStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Screen,
  Section,
  SkeletonRows,
  Text,
} from '@openagentspocket/ui';
import { type ReactNode, useEffect, useState } from 'react';
import { useStoreState } from '@/changes/useStoreState';
import { OpenPortSheet } from './OpenPortSheet';
import { PortRow } from './PortRow';
import { portsMessage } from './text';
import { useAppActivity } from './useAppActivity';

interface PortsScreenProps {
  store: PortsStore;
  /** The Preview screen is pushed over the list once a preview is opening. */
  onOpenPreview: () => void;
}

/** browser.ports: the TCP servers listening on one Host, one row per port; a row opens its preview. */
export function PortsScreen({ store, onOpenPreview }: PortsScreenProps) {
  const state = useStoreState(store);
  const [enteringPort, setEnteringPort] = useState(false);
  useAppActivity(store);
  useEffect(() => {
    store.start();
  }, [store]);

  const open = (port: ListeningPort) => {
    store.open(port);
    if (store.getState().preview) onOpenPreview();
  };
  const openTyped = (port: number) => {
    setEnteringPort(false);
    store.openPort(port);
    onOpenPreview();
  };
  const { listing } = state;
  const refresh = () => store.refresh();

  let body: ReactNode;
  if (listing === null || listing.kind === 'loading') {
    body = <SkeletonRows accessibilityLabel={t('Looking for servers on %@…', store.hostName)} />;
  } else if (listing.kind === 'failed') {
    body = (
      <ErrorState
        summary={t("Couldn't List Ports")}
        recovery={portsMessage(listing.message)}
        onRetry={refresh}
        retryLabel={t('Try Again')}
        testID="ports-failure"
      />
    );
  } else {
    const rows = store.visiblePorts;
    const hidden = store.hiddenCount;
    body = (
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
    );
  }
  return (
    <Screen
      edges={['left', 'right', 'bottom']}
      refreshing={state.isRefreshing}
      onRefresh={refresh}
      testID="ports-screen"
    >
      <Text variant="caption" tone="secondary" numberOfLines={1}>
        {t('Host %@', store.hostName)}
      </Text>
      {body}
      <Button
        kind="secondary"
        icon="globe"
        title={t('Open Port…')}
        onPress={() => setEnteringPort(true)}
        testID="ports-open-port"
      />
      <OpenPortSheet
        visible={enteringPort}
        hostName={store.hostName}
        onClose={() => setEnteringPort(false)}
        onOpen={openTyped}
      />
    </Screen>
  );
}
