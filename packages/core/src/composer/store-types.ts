import type { ComposerAttachment } from '../attachments/types';
import type { Clock } from '../hosts/cancellation';
import type { InputSessionGeneration } from '../terminal/input-port';
import type { DraftAttachmentsOptions } from './draft-attachments';
import type { ComposerNotice, ComposerRefusal } from './policy';
import type { ComposerMessage } from './progress';
import type { Selection } from './selection';

/** How Send finished. `deliveredViaAttach` is the view's cue to present the tools keyboard. */
export type ComposerSendResult =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'deliveredViaPrompt' }
  | { readonly kind: 'deliveredViaAttach' }
  | { readonly kind: 'failed' }
  /** The policy declined the draft, which is back in the Composer. */
  | { readonly kind: 'refused'; readonly refusal: ComposerRefusal };

/** The `agent.prompt` call, already bound to a Host. Resolves when herdr accepted the text. */
export type ComposerPrompt = (params: { target: string; text: string }) => Promise<void>;

/** The live Attach PTY writer; false when there is no live session to write to. */
export interface ComposerAttachInput {
  insertComposerDraft(text: string): boolean;
}

/** The live terminal's record of messages that went round the PTY, for Message Jump to find. */
export interface ComposerSubmitRecorder {
  readonly liveGeneration: InputSessionGeneration | null;
  recordSubmitted(text: string, generation: InputSessionGeneration): void;
}

export interface ComposerSnapshot {
  readonly draft: string;
  readonly selection: Selection;
  /** What stands for the next message; their paths are added when it goes. */
  readonly attachments: readonly ComposerAttachment[];
  readonly messages: readonly ComposerMessage[];
  readonly notice: ComposerNotice | undefined;
  readonly status: string;
}

export interface ComposerStoreOptions extends DraftAttachmentsOptions {
  readonly target: string;
  readonly prompt: ComposerPrompt;
  readonly clock: Clock;
  readonly initialStatus?: string;
  readonly initialDraft?: string;
  /** Called with the draft after every change, to persist it. */
  readonly onDraft?: (draft: string) => void;
  /** Pace and budget for waiting out a fresh Agent's launch on `agent_not_ready`. */
  readonly notReadyRetryMs?: number;
  readonly notReadyBudgetMs?: number;
}
