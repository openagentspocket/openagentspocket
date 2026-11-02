import type { AgentStatus } from '../agents';
import { TransportFailure } from '../errors/transport-error';
import { FakeClock } from '../hosts/cancellation';
import { type AgentStatusUpdate, REFRESH_DEBOUNCE_MS } from './auto-refresh';
import type { ExecGate } from './observable';
import { makeFile } from './status';
import { ChangesStore } from './store';
import { APPEARANCE_SETTLE_MS } from './store-types';
import {
  type ChangedFile,
  ChangesReadError,
  type CheckoutChanges,
  type CheckoutChangesRead,
  type FilePatch,
} from './types';

export function changesOf(files: ChangedFile[], topLevel = '/r'): CheckoutChanges {
  return {
    checkout: { topLevel, isLinkedWorktree: false, displayPath: '~/r' },
    head: {
      branch: { kind: 'named', name: 'main' },
      commit: 'abc',
      latestCommit: null,
      upstream: null,
      isUnborn: false,
    },
    files,
    totals: {
      trackedFiles: files.length,
      untrackedItems: 0,
      added: 0,
      removed: 0,
      linesAreComplete: true,
      linesAreAvailable: true,
    },
    isStatusTruncated: false,
    isMetadataTruncated: false,
  };
}

export const readOf = (files: ChangedFile[], topLevel?: string): CheckoutChangesRead => ({
  changes: changesOf(files, topLevel),
  directoryPrefix: '',
});

interface Pending {
  directory: string;
  resolve(read: CheckoutChangesRead): void;
  reject(error: unknown): void;
}

/** A store over a scripted read: every call waits for the test to settle it. */
export function harness(options: { gate?: ExecGate; directory?: string | null } = {}) {
  const clock = new FakeClock();
  const reads: Pending[] = [];
  const announced: string[] = [];
  let listener: ((update: AgentStatusUpdate) => void) | null = null;
  let generation = 1;
  const directory = { current: options.directory === undefined ? '/r/app' : options.directory };
  const store = new ChangesStore({
    directory: () => directory.current,
    read: (request) =>
      new Promise<CheckoutChangesRead>((resolve, reject) => {
        reads.push({ directory: request.directory, resolve, reject });
      }),
    readPatch: async (): Promise<FilePatch> => ({ files: [], isTruncated: false }),
    gate: options.gate,
    clock,
    now: () => clock.now,
    announce: (message) => announced.push(message),
    agentStatus: (next) => {
      listener = next;
      return () => {
        listener = null;
      };
    },
  });
  const status = (value: AgentStatus | null, live = true) =>
    listener?.({ status: value, liveUpdatesAvailable: live, connectionGeneration: generation });
  return {
    store,
    clock,
    reads,
    announced,
    directory,
    status,
    reconnect: () => {
      generation += 1;
    },
    phase: () => store.getState().phase.kind,
  };
}

export const file = (path: string) => makeFile(path, 'modified', { staging: 'unstaged' });
