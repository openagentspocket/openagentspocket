import { needsConfirmation, type PairingScanState, type PairingStep } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { airy, Banner, Button, Card, Icon, Text } from '@openagentspocket/ui';
import { View } from 'react-native';
import { pairingMessageText, stepTitle } from './pairingText';

const WITH_BOOTSTRAP: readonly PairingStep[] = ['reach', 'authenticate', 'enroll', 'verify'];
const CONFIG_ONLY: readonly PairingStep[] = ['reach', 'verify'];

/** done / active / pending for one listed step given the step underway. */
function stateOf(
  step: PairingStep,
  current: PairingStep | null,
  paired: boolean,
): 'done' | 'active' | 'pending' {
  if (paired) return 'done';
  if (current === null) return 'pending';
  // Authentication happens inside the reach step and is never reported alone.
  const at = Math.max(WITH_BOOTSTRAP.indexOf(current), 0);
  const index = WITH_BOOTSTRAP.indexOf(step);
  if (index < at) return 'done';
  return index === at || (step === 'authenticate' && current === 'reach') ? 'active' : 'pending';
}

interface PairingCeremonyProps {
  state: PairingScanState;
  onPair: () => void;
  onRetry: () => void;
  onRescan: () => void;
}

/** hosts.pairing-ceremony: the steps, the footer, and the failure copy with its recovery. */
export function PairingCeremony({ state, onPair, onRetry, onRescan }: PairingCeremonyProps) {
  const code = state.pairingCode;
  if (!code) return null;
  const listed = code.bootstrap === null ? CONFIG_ONLY : WITH_BOOTSTRAP;
  const waiting =
    needsConfirmation(code) && !state.isPairing && !state.failure && !state.pairedHostId;
  return (
    <View style={{ gap: airy.tile }} testID="pairing-ceremony">
      <Card padded>
        {listed.map((step) => {
          const status = stateOf(step, state.step, state.pairedHostId !== null);
          return (
            <View
              key={step}
              style={{ flexDirection: 'row', gap: airy.stack }}
              testID={`pairing-step-${step}-${status}`}
            >
              <Icon
                name={
                  status === 'done' ? 'success' : status === 'active' ? 'refresh' : 'statusIdle'
                }
                color={status === 'done' ? 'success' : 'textTertiary'}
              />
              <Text tone={status === 'pending' ? 'secondary' : 'primary'}>{stepTitle(step)}</Text>
            </View>
          );
        })}
      </Card>
      <Text variant="footnote" tone="secondary">
        {t('Host key pinned from the Pairing Code — no fingerprint prompt.')}
      </Text>
      {waiting ? (
        <>
          <Text variant="callout">
            {t(
              'Pairing runs this launcher as %@ on the Host. Pair only with a code your own Host showed you.',
              code.username,
            )}
          </Text>
          <Button title={t('Pair')} onPress={onPair} testID="pairing-pair" />
        </>
      ) : null}
      {state.failure ? (
        <Banner
          tone="danger"
          title={pairingMessageText(state.failure.message)}
          testID="pairing-failure"
        />
      ) : null}
      {state.failure?.canRetry ? (
        <Button title={t('Try Again')} onPress={onRetry} testID="pairing-retry" />
      ) : null}
      {state.failure ? (
        <Button
          kind="secondary"
          title={t('Scan Again')}
          onPress={onRescan}
          testID="pairing-rescan"
        />
      ) : null}
    </View>
  );
}
