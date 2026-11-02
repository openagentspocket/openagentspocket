import { HerdrApiError } from '../errors/herdr-api-error';
import { message, type Text } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import type { ShellTerminalCreationRequest, ShellTerminalIdentity } from './shell-store';

/** A shell must open in a directory tied to the caller; a relative or blank one is refused. */
export function shellCreationRequest(
  workspaceId: string,
  cwd: string | undefined,
  label?: string,
): ShellTerminalCreationRequest | null {
  if (cwd === undefined || !cwd.startsWith('/') || cwd.trim() === '') return null;
  return { workspaceId, cwd, ...(label === undefined ? {} : { label }) };
}

export interface OpenTerminalFailure {
  /** rejected: herdr said no. ambiguous: the request may have created a tab anyway. */
  readonly kind: 'rejected' | 'ambiguous';
  readonly message: Text;
}

export function openTerminalFailure(error: unknown): OpenTerminalFailure {
  const rejection =
    error instanceof HerdrApiError
      ? error.message
      : error instanceof TransportFailure && error.error.kind === 'apiRejected'
        ? error.error.message
        : undefined;
  if (rejection !== undefined) {
    return {
      kind: 'rejected',
      message: message("herdr couldn't create the terminal: %@", rejection),
    };
  }
  return {
    kind: 'ambiguous',
    message: message(
      'The request did not finish clearly. A new tab may already exist on the Host. Check the Host before trying again.',
    ),
  };
}

/** The remote side of a shell, as the opener needs it. */
export interface ShellTerminalRemote {
  create(request: ShellTerminalCreationRequest): Promise<ShellTerminalIdentity>;
  /** True while the remembered tab still exists; a thrown error means unknown. */
  verify(identity: ShellTerminalIdentity): Promise<boolean>;
  close(identity: ShellTerminalIdentity): Promise<void>;
}

/** Remembers a Workspace's shell tab so Open Terminal reattaches instead of piling up tabs. */
export interface ShellTerminalMemory {
  recall(): ShellTerminalIdentity | undefined;
  remember(identity: ShellTerminalIdentity): void;
  forget(): void;
}

/**
 * The remembered tab when it is still alive, a fresh one otherwise. Recreation happens only
 * here, under an explicit open, never from a reconnect. Unverifiable (host unreachable) fails
 * the open rather than creating a second tab.
 */
export async function resolveShellTerminal(
  remote: ShellTerminalRemote,
  memory: ShellTerminalMemory,
  request: ShellTerminalCreationRequest,
): Promise<ShellTerminalIdentity> {
  const remembered = memory.recall();
  if (remembered) {
    if (await remote.verify(remembered)) return remembered;
    memory.forget();
  }
  const identity = await remote.create(request);
  memory.remember(identity);
  return identity;
}

/**
 * Closes the remote tab, then forgets it. A server that no longer knows the pane counts as
 * closed; an unreachable Host keeps the tab and reports why.
 */
export async function closeShellTerminal(
  remote: ShellTerminalRemote,
  memory: ShellTerminalMemory,
  identity: ShellTerminalIdentity,
): Promise<{ closed: true } | { closed: false; message: Text }> {
  try {
    await remote.close(identity);
  } catch (error) {
    const gone =
      error instanceof HerdrApiError ||
      (error instanceof TransportFailure && error.error.kind === 'apiRejected');
    if (!gone) {
      return {
        closed: false,
        message: message("The Host couldn't be reached. The tab is still open there."),
      };
    }
  }
  memory.forget();
  return { closed: true };
}
