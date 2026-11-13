import {
  type ChatHostFiles,
  type ChatHostScriptRunner,
  type ChatStore,
  decodeUtf8,
  encodeUtf8,
  type HostFileListing,
  type HostFileListingRequest,
  type HostFileRange,
  type HostFileSlice,
  type HostFileStatus,
  type StoreQuery,
  type StoreQueryResponse,
  storeQueryRunner,
} from '@openagentspocket/core';
import {
  ExecLane,
  runBoundedScript,
  SessionHostFiles,
  type SshTransport,
} from '@openagentspocket/transport';

/** Runs an operation on the Host's current transport (the connection manager's `withTransport`). */
export type RunOnTransport = <V>(operation: (transport: SshTransport) => Promise<V>) => Promise<V>;

/** Chat's store queries run one at a time per Host, each within this budget. */
const CHAT_QUERY_TIMEOUT_MS = 10_000;

/**
 * Chat's file port for one Host over the SSH transport. Each call runs on whatever transport the
 * Host's session holds now; a `SessionHostFiles` (one SFTP channel kept for Chat) lives as long
 * as its transport, and is closed when a reconnect replaces it.
 */
export class TransportChatFiles implements ChatHostFiles {
  private current: { transport: SshTransport; files: SessionHostFiles } | undefined;
  private readonly lane = new ExecLane();

  constructor(
    private readonly run: RunOnTransport,
    /** Secure random bytes for each store query's nonce (the device's `RandomBytes`). */
    private readonly random: (length: number) => Uint8Array,
  ) {}

  status(path: string): Promise<HostFileStatus | null> {
    return this.run((transport) => this.filesOf(transport).status(path));
  }

  list(request: HostFileListingRequest): Promise<HostFileListing | null> {
    return this.run((transport) => this.filesOf(transport).list(request));
  }

  read(range: HostFileRange): Promise<HostFileSlice> {
    return this.run((transport) => this.filesOf(transport).read(range));
  }

  /** One read-only query of a program's session store: one bounded script over one exec. */
  runScript: ChatHostScriptRunner = (script) =>
    this.run(async (transport) => {
      const result = await runBoundedScript(transport, decodeUtf8(script), {
        feature: 'Chat',
        deadlineMs: CHAT_QUERY_TIMEOUT_MS,
        remoteSeconds: Math.max(1, CHAT_QUERY_TIMEOUT_MS / 1000 - 2),
        timeoutMarkerPrefix: '__AGENTICO_OC_TIMEOUT_',
        timedOut: { kind: 'hostFileTimedOut' },
        lane: this.lane,
      });
      return {
        stdout: encodeUtf8(result.stdout),
        stderr: encodeUtf8(result.stderr),
        exitStatus: result.exitCode,
      };
    });

  queryStore(store: ChatStore, query: StoreQuery): Promise<StoreQueryResponse> {
    return storeQueryRunner(this.runScript, { random: this.random })(store, query);
  }

  home(): Promise<string> {
    return this.run((transport) => this.filesOf(transport).home());
  }

  /** Releases the held channel (the Host was removed). */
  async close(): Promise<void> {
    const current = this.current;
    this.current = undefined;
    await current?.files.close();
  }

  private filesOf(transport: SshTransport): SessionHostFiles {
    if (this.current?.transport !== transport) {
      void this.current?.files.close();
      this.current = { transport, files: new SessionHostFiles(transport) };
    }
    return this.current.files;
  }
}
