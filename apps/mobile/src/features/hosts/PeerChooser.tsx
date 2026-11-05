import { errorMessage } from '@openagentspocket/core';
import { type OverlayPeer, type OverlayPeerMode, OverlayPeerPicker } from '@openagentspocket/ui';
import { useEffect, useState } from 'react';
import { hostsRuntime } from './hostsRuntime';

/** hosts.peer-picker: the overlay network's machines; picking one fills the route address. */
export function PeerChooser({
  visible,
  onClose,
  currentAddress,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  currentAddress: string;
  onPick: (address: string, name: string) => void;
}) {
  const source = hostsRuntime().peers;
  const [peers, setPeers] = useState<readonly OverlayPeer[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [mode, setMode] = useState<OverlayPeerMode>('ip');
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reload on open and on Try Again
  useEffect(() => {
    if (!visible || !source) return;
    let live = true;
    setFailure(null);
    source.load().then(
      (loaded) => live && setPeers(loaded),
      (error: unknown) => live && setFailure(errorMessage(error)),
    );
    return () => {
      live = false;
    };
  }, [visible, attempt]);
  if (!source) return null;
  const shown = peers.map((peer) => ({
    ...peer,
    chosen: (mode === 'ip' ? peer.ip : peer.machineName) === currentAddress.trim(),
  }));
  return (
    <OverlayPeerPicker
      visible={visible}
      networkName={source.networkName}
      onCancel={onClose}
      peers={shown}
      mode={mode}
      onModeChange={setMode}
      offersMachineNames={source.offersMachineNames}
      failure={failure === null ? undefined : { message: failure }}
      onRetry={() => setAttempt((count) => count + 1)}
      onPick={(peer, picked) => {
        const address = picked === 'ip' ? peer.ip : peer.machineName;
        if (address) onPick(address, peer.name);
      }}
    />
  );
}
