import {
  createCancellation,
  type OpenTerminalFailure,
  openTerminalFailure,
  type PoolEntry,
  RetentionFailure,
  resolveShellTerminal,
  type ShellTerminalCreationRequest,
  type ShellTerminalIdentity,
  type ShellTerminalMemory,
  type Text,
} from '@openagentspocket/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { newUuid } from '@/connections/uuid';
import type { ShellTerminalServices } from './services';

export type ShellTerminalState =
  | { readonly phase: 'opening' }
  | { readonly phase: 'failed'; readonly message: Text; readonly ambiguous: boolean }
  | { readonly phase: 'ready'; readonly entry: PoolEntry };

export interface ShellTerminalTarget {
  readonly hostId: string;
  /** The shell's directory; also what the remembered tab is keyed by without a Workspace. */
  readonly request: ShellTerminalCreationRequest;
  /** A pane the Host already has; it is verified, and a new shell opens if it is gone. */
  readonly existing?: ShellTerminalIdentity;
}

/** Memory that recalls one pane and keeps nothing else: what the user tapped is not remembered. */
const rememberedOnly = (identity: ShellTerminalIdentity): ShellTerminalMemory => ({
  recall: () => identity,
  remember: () => {},
  forget: () => {},
});

const failureOf = (error: unknown): OpenTerminalFailure =>
  error instanceof RetentionFailure
    ? { kind: 'rejected', message: error.text }
    : openTerminalFailure(error);

/**
 * Opens the target's shell (the remembered tab when alive, a new one otherwise), takes it from
 * the retention pool and gives it back when the screen leaves. Creation happens once per
 * explicit open or retry, never from a reconnect.
 */
export function useShellTerminal(services: ShellTerminalServices, target: ShellTerminalTarget) {
  const { hostId, request, existing } = target;
  const [state, setState] = useState<ShellTerminalState>({ phase: 'opening' });
  const [attempt, setAttempt] = useState(0);
  const owner = useRef(newUuid());
  const key = request.workspaceId || request.cwd;

  useEffect(() => {
    void attempt;
    const cancellation = createCancellation();
    const ownerId = owner.current;
    const { pool } = services;
    let released: (() => void) | undefined;
    setState({ phase: 'opening' });
    (async () => {
      const identity = await resolveShellTerminal(
        services.remote(hostId),
        existing ? rememberedOnly(existing) : services.memory(hostId, key),
        request,
      );
      const entry = await pool.select({
        hostId,
        identity,
        ownerId,
        generation: services.generation(hostId),
        runTerminal: services.runner(hostId),
        signal: cancellation.signal,
      });
      released = () => pool.release(hostId, identity, ownerId);
      setState({ phase: 'ready', entry });
    })().catch((error: unknown) => {
      if (cancellation.signal.aborted) return;
      const failure = failureOf(error);
      setState({
        phase: 'failed',
        message: failure.message,
        ambiguous: failure.kind === 'ambiguous',
      });
    });
    return () => {
      cancellation.cancel();
      released?.();
    };
  }, [existing, services, hostId, key, request, attempt]);

  // A shell follows its Host back: a new connection replaces the attach that died with the old one.
  const entry = state.phase === 'ready' ? state.entry : null;
  useEffect(() => {
    if (!entry) return;
    const follow = () => entry.store.transportGenerationDidChange(services.generation(hostId));
    const unsubscribe = services.subscribe(follow);
    const foreground = AppState.addEventListener('change', (next) => {
      if (next === 'active') entry.store.didBecomeActive(true);
    });
    return () => {
      unsubscribe();
      foreground.remove();
    };
  }, [entry, services, hostId]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { state, retry };
}
