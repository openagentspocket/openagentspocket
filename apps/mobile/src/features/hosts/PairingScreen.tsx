import { needsConfirmation } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Banner, QRScanner } from '@openagentspocket/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { EasyPairPanel } from './EasyPairPanel';
import { hostsRuntime } from './hostsRuntime';
import { PairingCeremony } from './PairingCeremony';
import { pairingMessageText, scannerLabels } from './pairingText';

interface PairingScreenProps {
  onCancel: () => void;
  /** Opens the Setup Guide (installing herdr and the plugin on a new machine). */
  onOpenGuide: () => void;
  /** Called once with the saved Host's id, after the verified reconnect. */
  onPaired: (hostId: string) => void;
  onAddManually: () => void;
}

/** hosts.pairing-scanner: scan or paste a HERDR-PAIR code, then run the ceremony. */
export function PairingScreen({
  onCancel,
  onPaired,
  onAddManually,
  onOpenGuide,
}: PairingScreenProps) {
  const [store] = useState(() => hostsRuntime().createScanStore());
  const state = useSyncExternalStore(store.subscribe, store.getState);
  const code = state.pairingCode;

  // A code that needs no confirmation starts pairing as soon as it parses.
  useEffect(() => {
    if (code && !needsConfirmation(code)) void store.pair();
  }, [code, store]);
  useEffect(() => {
    if (state.pairedHostId) onPaired(state.pairedHostId);
  }, [state.pairedHostId, onPaired]);
  useEffect(() => () => store.cancel(), [store]);

  return (
    <AppScreen
      header={{
        variant: 'sheet',
        title: t('Easy Pair'),
        leading: { label: t('Cancel'), onPress: onCancel, testID: 'pairing-cancel' },
      }}
      testID="pairing-screen"
    >
      {code ? (
        <PairingCeremony
          state={state}
          onPair={() => void store.pair()}
          onRetry={() => void store.pair()}
          onRescan={() => store.rescan()}
        />
      ) : (
        <>
          <QRScanner onCode={(text) => store.submit(text)} labels={scannerLabels()} />
          {state.scanFailure ? (
            <Banner
              tone="danger"
              title={pairingMessageText(state.scanFailure)}
              testID="pairing-scan-failure"
            />
          ) : null}
          <EasyPairPanel onOpenGuide={onOpenGuide} onAddManually={onAddManually} />
        </>
      )}
    </AppScreen>
  );
}
