import {
  type ShellTerminalCreationRequest,
  type ShellTerminalIdentity,
  shellCreationRequest,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { EmptyState } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { AppScreen } from '@/navigation/AppScreen';
import { OpenedShell } from './OpenedShell';
import { useShellTerminalServices } from './services';

export { SHELL_CLOSE_ANCHOR } from './OpenedShell';

interface Props {
  hostId: string;
  /** The Workspace the shell belongs to, when the caller knows it. */
  workspaceId?: string;
  /** The shell's directory; it must be absolute. */
  cwd?: string;
  /** The tab's name; empty keeps herdr's numbered one. */
  label?: string;
  /** A pane that already exists: it is attached instead of opening a new tab. */
  existing?: ShellTerminalIdentity;
  /** The shell was closed on the Host, or the user left it. */
  onClose: () => void;
}

/** A shell on a Host in a directory: opens or reattaches its tab, retained across navigation. */
export function ShellTerminalScreen({
  hostId,
  workspaceId = '',
  cwd,
  label,
  existing,
  onClose,
}: Props) {
  const services = useShellTerminalServices();
  const request = useMemo<ShellTerminalCreationRequest | null>(
    () => shellCreationRequest(workspaceId, cwd, label),
    [workspaceId, cwd, label],
  );
  if (!request) {
    return (
      <AppScreen
        scroll={false}
        header={{ variant: 'native', title: t('Terminal') }}
        testID="shell-no-directory"
      >
        <EmptyState icon="warning" title={t("Couldn't Open Terminal")} />
      </AppScreen>
    );
  }
  return (
    <OpenedShell
      services={services}
      hostId={hostId}
      request={request}
      existing={existing}
      onClose={onClose}
    />
  );
}
