import type { ConsoleSession, ConsoleTransport } from './projection-types';
import { SNIPPET_READ_LINES, snippetFromPaneText } from './snippet';

/** What the reader needs from the projection that owns the rows. */
export interface PromptReaderHost {
  isEnded(): boolean;
  /** Whether the pane's Agent is still listed and Blocked. */
  isBlocked(paneId: string): boolean;
  isListed(paneId: string): boolean;
  /** Stores what the Agent asks. */
  setPrompt(paneId: string, prompt: string | undefined): void;
}

/**
 * Reads what Blocked Agents are asking from their panes. One read per pane at a time: a prompt
 * arriving mid-read schedules exactly one more read, so a slow stale read never wins.
 */
export class BlockedPromptReader<T extends ConsoleTransport> {
  private inFlight = new Set<string>();
  private pending = new Set<string>();

  constructor(
    private readonly session: ConsoleSession<T>,
    private readonly host: PromptReaderHost,
  ) {}

  /** Forgets queued follow-ups (the rows they were for are gone). */
  clearPending(): void {
    this.pending.clear();
  }

  async refresh(paneId: string): Promise<void> {
    if (this.inFlight.has(paneId)) {
      this.pending.add(paneId);
      return;
    }
    this.inFlight.add(paneId);
    let text: string | undefined;
    try {
      const read = await this.session.withTransport((transport) =>
        transport.readPane({
          paneId,
          source: 'recent',
          lines: SNIPPET_READ_LINES,
          stripAnsi: true,
        }),
      );
      text = read.text;
    } catch {
      text = undefined;
    }
    this.inFlight.delete(paneId);
    if (this.host.isEnded()) return;
    if (text !== undefined && this.host.isBlocked(paneId)) {
      this.host.setPrompt(paneId, snippetFromPaneText(text));
    }
    if (this.pending.delete(paneId) && this.host.isListed(paneId)) await this.refresh(paneId);
  }
}
