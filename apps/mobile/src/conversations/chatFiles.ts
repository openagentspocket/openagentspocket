import type {
  ChatHostFiles,
  HostFileListing,
  HostFileListingRequest,
  HostFileRange,
  HostFileSlice,
  HostFileStatus,
} from '@openagentspocket/core';
import { SessionHostFiles, type SshTransport } from '@openagentspocket/transport';

/** Runs an operation on the Host's current transport (the connection manager's `withTransport`). */
export type RunOnTransport = <V>(operation: (transport: SshTransport) => Promise<V>) => Promise<V>;

/**
 * Chat's file port for one Host over the SSH transport. Each call runs on whatever transport the
 * Host's session holds now; a `SessionHostFiles` (one SFTP channel kept for Chat) lives as long
 * as its transport, and is closed when a reconnect replaces it.
 */
export class TransportChatFiles implements ChatHostFiles {
  private current: { transport: SshTransport; files: SessionHostFiles } | undefined;

  constructor(private readonly run: RunOnTransport) {}

  status(path: string): Promise<HostFileStatus | null> {
    return this.run((transport) => this.filesOf(transport).status(path));
  }

  list(request: HostFileListingRequest): Promise<HostFileListing | null> {
    return this.run((transport) => this.filesOf(transport).list(request));
  }

  read(range: HostFileRange): Promise<HostFileSlice> {
    return this.run((transport) => this.filesOf(transport).read(range));
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
