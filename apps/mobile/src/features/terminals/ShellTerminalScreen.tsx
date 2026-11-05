import {
  closeShellTerminal,
  type ShellTerminalCreationRequest,
  shellCreationRequest,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { Button, confirm, EmptyState, makeStyles, Screen, useAnchor } from '@openagentspocket/ui';
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { renderMessage } from '@/lib/renderText';
import { closeTerminalConfirmation } from './closeConfirmation';
import { ShellSurface } from './ShellSurface';
import { useShellTerminalServices } from './services';
import { useShellTerminal } from './useShellTerminal';

/** The key the Close Terminal popover points at. */
export const SHELL_CLOSE_ANCHOR = 'shell-close';

const useStyles = makeStyles((th) => ({
  fill: { flex: 1 },
  toolbar: { flexDirection: 'row', justifyContent: 'center', padding: th.spacing.xs },
}));

interface Props {
  hostId: string;
  /** The Workspace the shell belongs to, when the caller knows it. */
  workspaceId?: string;
  /** The shell's directory; it must be absolute. */
  cwd?: string;
  /** The tab's name; empty keeps herdr's numbered one. */
  label?: string;
  /** The shell was closed on the Host, or the user left it. */
  onClose: () => void;
}

/** A shell on a Host in a directory: opens or reattaches its tab, retained across navigation. */
export function ShellTerminalScreen({ hostId, workspaceId = '', cwd, label, onClose }: Props) {
  const services = useShellTerminalServices();
  const request = useMemo<ShellTerminalCreationRequest | null>(
    () => shellCreationRequest(workspaceId, cwd, label),
    [workspaceId, cwd, label],
  );
  if (!request) {
    return (
      <Screen scroll={false} edges={['bottom']} testID="shell-no-directory">
        <EmptyState icon="warning" title={t("Couldn't Open Terminal")} />
      </Screen>
    );
  }
  return <Opened services={services} hostId={hostId} request={request} onClose={onClose} />;
}

function Opened({
  services,
  hostId,
  request,
  onClose,
}: {
  services: ReturnType<typeof useShellTerminalServices>;
  hostId: string;
  request: ShellTerminalCreationRequest;
  onClose: () => void;
}) {
  const styles = useStyles();
  const { state, retry } = useShellTerminal(services, { hostId, request });
  const [closing, setClosing] = useState(false);
  const closeAnchor = useAnchor(SHELL_CLOSE_ANCHOR);

  const close = async () => {
    if (state.phase !== 'ready' || closing) return;
    const ok = await confirm({ ...closeTerminalConfirmation(), anchorKey: SHELL_CLOSE_ANCHOR });
    if (!ok) return;
    setClosing(true);
    const { identity } = state.entry.store;
    const key = request.workspaceId || request.cwd;
    const result = await closeShellTerminal(
      services.remote(hostId),
      services.memory(hostId, key),
      identity,
    );
    if (!result.closed) {
      setClosing(false);
      await confirm({
        title: t("Couldn't Close Terminal"),
        message: renderMessage(result.message),
        confirmLabel: t('OK'),
        cancelLabel: null,
      });
      return;
    }
    await services.pool.remove(hostId, identity);
    onClose();
  };

  return (
    <Screen scroll={false} edges={['bottom']} testID="shell-terminal-screen">
      {state.phase === 'failed' ? (
        <EmptyState
          icon="warning"
          title={t("Couldn't Open Terminal")}
          message={renderMessage(state.message)}
          testID="shell-failed"
          actions={<Button title={t('Try Again')} onPress={retry} testID="shell-retry" />}
        />
      ) : (
        <View style={styles.fill}>
          {state.phase === 'ready' ? (
            <ShellSurface entry={state.entry} />
          ) : (
            <EmptyState icon="terminal" title={t('Opening Terminal…')} testID="shell-opening" />
          )}
          <View style={styles.toolbar}>
            <View ref={closeAnchor} collapsable={false}>
              <Button
                kind="capsule"
                icon="more"
                accessibilityLabel={t('Close Terminal')}
                disabled={closing || state.phase !== 'ready'}
                onPress={() => void close()}
                testID="shell-close"
              />
            </View>
          </View>
        </View>
      )}
    </Screen>
  );
}
