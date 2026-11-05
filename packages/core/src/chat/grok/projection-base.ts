// The state every part of the Grok Build projection shares (Swift GrokTranscriptReducer.Projection):
// the transcript being built, the open turn, how each turn ended, and entry placing.

import type {
  ChatAgentActivity,
  ChatEntryContent,
  ChatNotice,
  ChatTranscript,
} from '../model/types';
import { emptyTranscript } from '../model/types';
import { date, type OpenTurn, startMs } from './projection-support';
import type { TurnEnd } from './tool-call';
import type { GrokUpdateRecord } from './update-record';

export abstract class ProjectionBase {
  readonly transcript: ChatTranscript = emptyTranscript();
  protected open: OpenTurn | null = null;
  /** How each turn ended, in the order counted prompts opened them; the first is the turn above the loaded lines. */
  protected readonly turnEnds: (TurnEnd | null)[] = [null];
  protected readonly unknownTypes = new Set<string>();

  constructor(
    protected readonly activity: ChatAgentActivity,
    protected readonly directory: string | null,
  ) {}

  /** Records how the latest turn ended, unless it already had. */
  protected endTurn(end: TurnEnd): void {
    const last = this.turnEnds.length - 1;
    if (last >= 0 && this.turnEnds[last] === null) this.turnEnds[last] = end;
  }

  /** Appends an entry; the open turn's first entry starts it. */
  protected place(content: ChatEntryContent, id: string, offset: number): number {
    this.transcript.entries.push({ id, sourceOffset: offset, content });
    const open = this.open;
    if (open && open.turn === null) {
      open.turn = this.transcript.turns.length;
      const start = startMs(open);
      this.transcript.turns.push({
        firstEntryID: id,
        startedAt: start === null ? null : date(start),
        endedAt: null,
        ending: null,
      });
    }
    return this.transcript.entries.length - 1;
  }

  protected addNotice(notice: ChatNotice, record: GrokUpdateRecord): void {
    this.place({ type: 'notice', value: notice }, `grok:${record.offset}:notice`, record.offset);
  }
}
