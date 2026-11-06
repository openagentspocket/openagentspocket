import { useState } from 'react';
import { View } from 'react-native';
import { Sheet } from '../overlay/Sheet';
import { Button } from '../primitives/Button';
import { Card } from '../primitives/Card';
import { EmptyState } from '../primitives/EmptyState';
import { Icon } from '../primitives/Icon';
import { Segmented } from '../primitives/Segmented';
import { Tappable } from '../primitives/Tappable';
import { Text } from '../primitives/Text';
import { ThemedTextInput } from '../primitives/ThemedTextInput';
import { makeStyles, useTheme } from '../theme/theme';
import { OverlayPeerViews } from './OverlayPeerViews';

export type OverlayPeerMode = 'ip' | 'name';

export interface OverlayPeer {
  id: string;
  name: string;
  /** The address for each mode; a peer without the chosen one shows no address. */
  ip?: string;
  machineName?: string;
  offline?: boolean;
  /** "Relayed · 46 ms". */
  reachability?: string;
  /** A Host already uses this machine: tagged. */
  isHost?: boolean;
  /** The peer the form already holds: checked. */
  chosen?: boolean;
}

export interface OverlayPeerPickerLabels {
  cancel: string;
  ipAddress: string;
  machineName: string;
  ipFootnote: string;
  nameFootnote: string;
  header: string;
  hostTag: string;
  searchPlaceholder: string;
  noPeers: string;
  noMatches: string;
  failureTitle: string;
  retry: string;
}

export const defaultOverlayPeerPickerLabels: OverlayPeerPickerLabels = {
  cancel: 'Cancel',
  ipAddress: 'IP Address',
  machineName: 'Machine Name',
  ipFootnote: 'The IP address stays the same while the machine is in the tailnet.',
  nameFootnote:
    'The machine name is resolved through MagicDNS and follows the machine if its address changes.',
  header: 'Choose the Host',
  hostTag: 'Host',
  searchPlaceholder: 'Name or address',
  noPeers: 'No peers with an address',
  noMatches: 'No matching peers',
  failureTitle: 'Could not load the network',
  retry: 'Try Again',
};

const useStyles = makeStyles((t) => ({
  root: { gap: t.spacing.sm, paddingBottom: t.spacing.md },
  footnote: { paddingHorizontal: t.spacing.xs },
  header: { paddingHorizontal: t.spacing.xs, paddingTop: t.spacing.xs },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.sm,
    paddingVertical: t.spacing.sm,
    paddingHorizontal: t.spacing.md,
    minHeight: t.metrics.rowMinHeight,
  },
  separator: {
    height: t.metrics.hairlineWidth,
    backgroundColor: t.hairline,
    marginLeft: t.spacing.md,
  },
  tag: {
    backgroundColor: t.colors.control,
    borderRadius: 999,
    paddingHorizontal: t.spacing.xs,
    paddingVertical: 3,
  },
  empty: { padding: t.spacing.md },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.spacing.xs,
    backgroundColor: t.colors.control,
    borderRadius: 999,
    paddingHorizontal: t.spacing.md,
    minHeight: t.metrics.minTapSize,
  },
  input: { flex: 1, color: t.colors.textPrimary, fontSize: 17, paddingVertical: t.spacing.xs },
}));

interface OverlayPeerPickerBodyProps {
  peers: readonly OverlayPeer[];
  mode: OverlayPeerMode;
  onModeChange: (mode: OverlayPeerMode) => void;
  /** Offered only on networks whose machines have names (a tailnet). Default true. */
  offersMachineNames?: boolean;
  onPick: (peer: OverlayPeer, mode: OverlayPeerMode) => void;
  failure?: { message: string };
  onRetry?: () => void;
  labels?: Partial<OverlayPeerPickerLabels>;
}

/** The sheet's content: mode switch, footnote, peer rows on a card and the search pill. */
export function OverlayPeerPickerBody({
  peers,
  mode,
  onModeChange,
  offersMachineNames = true,
  onPick,
  failure,
  onRetry,
  labels,
}: OverlayPeerPickerBodyProps) {
  const styles = useStyles();
  const theme = useTheme();
  const text = { ...defaultOverlayPeerPickerLabels, ...labels };
  const [query, setQuery] = useState('');
  if (failure)
    return (
      <EmptyState
        layout="compact"
        icon="warning"
        title={text.failureTitle}
        message={failure.message}
        actions={
          onRetry ? <Button kind="secondary" title={text.retry} onPress={onRetry} /> : undefined
        }
        testID="peer-failure"
      />
    );
  const address = (peer: OverlayPeer) => (mode === 'ip' ? peer.ip : peer.machineName);
  const needle = query.trim().toLowerCase();
  const shown = peers.filter(
    (peer) =>
      !needle ||
      peer.name.toLowerCase().includes(needle) ||
      address(peer)?.toLowerCase().includes(needle),
  );
  return (
    <View style={styles.root} testID="overlay-peer-picker">
      {offersMachineNames ? (
        <>
          <Segmented
            options={[
              { value: 'ip', label: text.ipAddress },
              { value: 'name', label: text.machineName },
            ]}
            value={mode}
            onChange={onModeChange}
            accessibilityLabel={`${text.ipAddress} / ${text.machineName}`}
          />
          <Text variant="footnote" tone="secondary" style={styles.footnote}>
            {mode === 'ip' ? text.ipFootnote : text.nameFootnote}
          </Text>
        </>
      ) : null}
      <Text
        variant="footnote"
        tone="secondary"
        semibold
        style={styles.header}
        accessibilityRole="header"
      >
        {text.header}
      </Text>
      <Card padded={false}>
        {shown.length === 0 ? (
          <Text tone="secondary" style={styles.empty}>
            {query ? text.noMatches : text.noPeers}
          </Text>
        ) : (
          shown.map((peer, index) => (
            <View key={peer.id}>
              {index > 0 ? <View style={styles.separator} /> : null}
              <Tappable
                disabled={peer.offline}
                onPress={() => onPick(peer, mode)}
                accessibilityRole="button"
                accessibilityLabel={peer.name}
                accessibilityState={{
                  disabled: peer.offline === true,
                  selected: peer.chosen === true,
                }}
                style={styles.row}
                testID={`peer-${peer.id}`}
              >
                <View style={{ flex: 1 }}>
                  <OverlayPeerViews
                    name={peer.name}
                    online={peer.offline ? false : true}
                    offline={peer.offline}
                    address={address(peer)}
                    reachability={peer.reachability}
                  />
                </View>
                {peer.isHost ? (
                  <View style={styles.tag}>
                    <Text variant="caption" tone="secondary" semibold>
                      {text.hostTag}
                    </Text>
                  </View>
                ) : null}
                {peer.chosen ? <Icon name="check" size={17} color="accent" /> : null}
              </Tappable>
            </View>
          ))
        )}
      </Card>
      <View style={styles.search}>
        <Icon name="search" size={15} />
        <ThemedTextInput
          value={query}
          onChangeText={setQuery}
          placeholder={text.searchPlaceholder}
          accessibilityLabel={text.searchPlaceholder}
          style={styles.input}
          testID="peer-search"
        />
      </View>
    </View>
  );
}

interface OverlayPeerPickerProps extends OverlayPeerPickerBodyProps {
  visible: boolean;
  /** The network's name, as the sheet title. */
  networkName: string;
  onCancel: () => void;
}

/** "Choose from Tailnet": the Host's overlay network peers in a sheet with a Cancel action. */
export function OverlayPeerPicker({
  visible,
  networkName,
  onCancel,
  labels,
  ...body
}: OverlayPeerPickerProps) {
  const cancel = labels?.cancel ?? defaultOverlayPeerPickerLabels.cancel;
  return (
    <Sheet
      visible={visible}
      onClose={onCancel}
      title={networkName}
      detent="large"
      leading={{ label: cancel, onPress: onCancel }}
    >
      <OverlayPeerPickerBody labels={labels} {...body} />
    </Sheet>
  );
}
