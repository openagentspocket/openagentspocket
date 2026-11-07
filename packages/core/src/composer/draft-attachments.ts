import type { ComposerAttachment, StagedAttachment } from '../attachments/types';

/** The text a message sends: each path after what was typed, as the Agent's program reads paths. */
export function withAttachmentPaths(
  typed: string,
  attachments: readonly StagedAttachment[],
): string {
  if (attachments.length === 0) return typed;
  const paths = attachments.map((attachment) => `${attachment.hostPath} `).join('');
  if (typed.trim() === '') return paths;
  return /\s$/u.test(typed) ? typed + paths : `${typed} ${paths}`;
}

const STAGED_PATH = /(?:^|(?<=\s))\/\S*\/agentico\.[^/\s]+\/stage-[^/\s]+\/([^/\s]+)(?=\s|$)/gu;

/** A sent message as a person reads it: the typed text, and the staged files by name. */
export function withoutAttachmentPaths(sent: string): { text: string; names: string[] } {
  const names: string[] = [];
  const text = sent.replace(STAGED_PATH, (_path, name: string) => {
    names.push(name);
    return '';
  });
  return names.length === 0 ? { text: sent, names } : { text: text.trim(), names };
}

export interface DraftAttachmentsOptions {
  readonly initialAttachments?: readonly StagedAttachment[];
  /** Called with the standing attachments after every change, to persist them. */
  readonly onAttachments?: (attachments: readonly StagedAttachment[]) => void;
  /** An attachment is done with: removed, delivered, or its Agent gone. Its preview can go. */
  readonly releaseAttachment?: (attachment: StagedAttachment) => void;
}

interface Withheld {
  readonly typed: string;
  readonly attachments: readonly ComposerAttachment[];
}

/**
 * The attachments of one Composer: those standing for the next message, and those of messages on
 * their way, kept with the typed text so a message that comes back returns as it was written.
 */
export class DraftAttachments {
  private nextId = 1;
  private items: readonly ComposerAttachment[];
  private readonly withheld = new Map<string, Withheld>();

  constructor(private readonly options: DraftAttachmentsOptions) {
    this.items = (options.initialAttachments ?? []).map((item) => this.identified(item));
  }

  get standing(): readonly ComposerAttachment[] {
    return this.items;
  }

  add(attachment: StagedAttachment): void {
    this.stand([...this.items, this.identified(attachment)]);
  }

  /** Whether it stood. The file staged on the Host stays there. */
  remove(id: string): boolean {
    const attachment = this.items.find((item) => item.id === id);
    if (!attachment) return false;
    this.stand(this.items.filter((item) => item !== attachment));
    this.options.releaseAttachment?.(attachment);
    return true;
  }

  /** The draft became message `messageId`: what stood goes with it. */
  withhold(messageId: string, typed: string): void {
    this.withheld.set(messageId, { typed, attachments: this.items });
    if (this.items.length > 0) this.stand([]);
  }

  /** The message reached the Agent. */
  delivered(messageId: string): void {
    const message = this.withheld.get(messageId);
    this.withheld.delete(messageId);
    for (const attachment of message?.attachments ?? []) {
      this.options.releaseAttachment?.(attachment);
    }
  }

  /** The message came back: its attachments stand first again, and this is the text it had. */
  restore(messageId: string): string | undefined {
    const message = this.withheld.get(messageId);
    if (!message) return undefined;
    this.withheld.delete(messageId);
    if (message.attachments.length > 0) this.stand([...message.attachments, ...this.items]);
    return message.typed;
  }

  /** The Agent is gone, and everything it held with it. */
  releaseAll(): void {
    const held = [...this.withheld.values()].flatMap((message) => message.attachments);
    const all = [...this.items, ...held];
    this.withheld.clear();
    this.stand([]);
    for (const attachment of all) this.options.releaseAttachment?.(attachment);
  }

  private identified(attachment: StagedAttachment): ComposerAttachment {
    return { ...attachment, id: `a${this.nextId++}` };
  }

  private stand(items: readonly ComposerAttachment[]): void {
    this.items = items;
    this.options.onAttachments?.(items.map(({ id: _id, ...attachment }) => attachment));
  }
}
