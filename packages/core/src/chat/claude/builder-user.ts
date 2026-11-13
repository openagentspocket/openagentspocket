// User messages, system records and queued commands.

import { divider, notice, userMessage } from '../model/factories';
import { capPreview } from '../model/preview';
import type { ChatEntry, ChatNotice } from '../model/types';
import { ToolBuilder } from './builder-tools';
import {
  compactionDetail,
  compactionPreview,
  isHuman,
  modelChangeTitle,
  unknownCommand,
  unknownSkillArguments,
  VISIBLE_META_ORIGINS,
} from './prompts';
import {
  type ClaudeRecord,
  imageCountOf,
  isAttachment,
  textsOf,
  toolResultsOf,
} from './record-types';
import { noticeParts } from './text';
import { absorbsInterruptMarker, toolOutcome } from './tool-summary';
import { isInterruptMarker, noticeForNotification, notificationKey } from './turns';
import { type ClaudeUserText, classifyUserText } from './user-text';

function nonEmpty(text: string | null | undefined): string | null {
  return text === null || text === undefined || text === '' ? null : text;
}

function commandText(name: string, args: string): string {
  return args === '' ? `/${name}` : `/${name} ${args}`;
}

export class Builder extends ToolBuilder {
  build(): void {
    for (const record of this.chain.records) {
      if (this.consumed.has(record.uuid)) continue;
      if (this.role === 'main' && (record.isSidechain || record.teamName !== null)) continue;
      if (this.role === 'main') this.noteTurn(record);
      const kind = record.kind;
      if (kind.type === 'assistant') this.addAssistant(record);
      else if (kind.type === 'user') this.addUser(record);
      else if (kind.type === 'system') this.addSystem(record, kind.subtype);
      else if (isAttachment(record, 'queued_command')) this.addQueuedCommand(record);
    }
  }

  // MARK: User

  protected addUser(record: ClaudeRecord): void {
    if (toolResultsOf(record).length > 0) return;
    if (record.isCompactSummary) {
      this.attachCompactionSummary(record);
      return;
    }
    // Messages a tool call produced, such as a skill a Skill call loaded.
    if (record.sourceToolUseID !== null) return;
    const text = textsOf(record).join('\n');
    if (record.isMeta) {
      if (record.originKind === null || !VISIBLE_META_ORIGINS.has(record.originKind)) return;
      const classified = classifyUserText(text);
      if (classified.type === 'prompt') this.addSystemNotice(classified.text, record);
      else if (classified.type === 'external') this.addSystemNotices(classified.messages, record);
      return;
    }
    if (isInterruptMarker(record)) {
      this.addInterruptMarker(record, text);
      return;
    }
    const wasQueued = record.promptSource === 'queued';
    const classified = classifyUserText(text);
    switch (classified.type) {
      case 'prompt':
        if (!isHuman(record.originKind) || record.promptSource === 'system') {
          this.addSystemNotice(classified.text, record);
          return;
        }
        if (classified.text === '' && imageCountOf(record) === 0) return;
        this.add(`user:${record.uuid}`, record, {
          type: 'user',
          value: userMessage(classified.text, { imageCount: imageCountOf(record), wasQueued }),
        });
        return;
      case 'command': {
        // A local command records its output below it; a skill or prompt command records the
        // expanded prompt, which stays hidden.
        const output = this.takeOutput(record, localOutput);
        if (output !== null) {
          this.add(`notice:${record.uuid}`, record, {
            type: 'notice',
            value: notice(
              'command',
              commandText(classified.invocation.name, classified.invocation.arguments),
              this.commandOutput(output.text, output.record),
            ),
          });
        } else {
          this.add(`user:${record.uuid}`, record, {
            type: 'user',
            value: userMessage(
              commandText(classified.invocation.name, classified.invocation.arguments),
              {
                imageCount: imageCountOf(record),
                command: classified.invocation,
                wasQueued,
              },
            ),
          });
        }
        return;
      }
      case 'localCommandOutput':
        this.addOutputNotice('command', classified.text, record);
        return;
      case 'bashInput': {
        const output = this.takeOutput(record, bashOutput);
        this.add(`notice:${record.uuid}`, record, {
          type: 'notice',
          value: notice('shellCommand', classified.text, { detail: nonEmpty(output?.text) }),
        });
        return;
      }
      case 'bashOutput':
        this.addOutputNotice('shellCommand', classified.text, record);
        return;
      case 'taskNotification':
        this.add(`notice:${record.uuid}`, record, {
          type: 'notice',
          value: noticeForNotification(classified.notification),
        });
        return;
      case 'external':
        this.addSystemNotices(classified.messages, record);
        return;
      default:
        // A model-loaded skill already shows as its Skill call's row.
        return;
    }
  }

  protected addInterruptMarker(record: ClaudeRecord, text: string): void {
    const parentID = this.chain.parents.get(record.uuid);
    const parent = parentID === undefined ? undefined : this.selected.get(parentID);
    if (
      parent &&
      toolResultsOf(parent).some((result) =>
        absorbsInterruptMarker(toolOutcome(result, parent.toolResult, [])),
      )
    )
      return;
    const trimmed = text.trim();
    const title = trimmed.startsWith('[Request interrupted by user')
      ? 'Interrupted'
      : noticeParts(trimmed).title;
    this.add(`notice:${record.uuid}`, record, {
      type: 'notice',
      value: notice('interrupted', title),
    });
  }

  protected attachCompactionSummary(record: ClaudeRecord): void {
    if (this.compactionEntry === null) return;
    const entry = this.entries[this.compactionEntry] as ChatEntry;
    if (entry.content.type !== 'divider' || entry.content.value.detail !== null) return;
    const summary = textsOf(record).join('\n').trim();
    if (summary === '') return;
    entry.content = {
      type: 'divider',
      value: { ...entry.content.value, detail: compactionDetail(compactionPreview(summary)) },
    };
  }

  // MARK: System and attachments

  protected addSystem(record: ClaudeRecord, subtype: string): void {
    const content = record.system?.content ?? '';
    switch (subtype) {
      case 'compact_boundary':
        if (
          this.add(`compact:${record.uuid}`, record, {
            type: 'divider',
            value: divider('compaction'),
          })
        ) {
          this.compactionEntry = this.entries.length - 1;
        }
        return;
      case 'local_command':
        this.addLocalCommand(record, content);
        return;
      case 'model_refusal_fallback':
      case 'model_fallback':
      case 'model_consent_fallback': {
        const value = notice(
          'modelChange',
          modelChangeTitle(
            record.system?.originalModel ?? null,
            record.system?.fallbackModel ?? null,
          ),
        );
        if (content !== '') {
          const parts = noticeParts(content);
          value.title = parts.title;
          value.detail = parts.detail;
        }
        this.add(`notice:${record.uuid}`, record, { type: 'notice', value });
        return;
      }
      case 'agents_killed':
        this.add(`notice:${record.uuid}`, record, {
          type: 'notice',
          value: notice('stopped', 'All background agents stopped'),
        });
        return;
      case 'informational':
        if (unknownCommand(record) !== null) this.addUnknownCommand(record, content);
        return;
      default:
        // Turn timings, away summaries, other informational lines, memory saves and anything
        // unknown stay hidden.
        return;
    }
  }

  protected addUnknownCommand(record: ClaudeRecord, content: string): void {
    const value = notice('error', content);
    const child = (this.children.get(record.uuid) ?? []).find(
      (candidate) =>
        !this.consumed.has(candidate.uuid) && unknownSkillArguments(candidate, record) !== null,
    );
    if (child) {
      this.consumed.add(child.uuid);
      value.detail = child.system?.content ?? null;
    }
    this.add(`notice:${record.uuid}`, record, { type: 'notice', value });
  }

  protected addLocalCommand(record: ClaudeRecord, content: string): void {
    const classified = classifyUserText(content);
    if (classified.type === 'command') {
      const invocation = record.system?.commandRun ?? classified.invocation;
      const output = this.takeOutput(record, localOutput);
      this.add(`notice:${record.uuid}`, record, {
        type: 'notice',
        value: notice(
          'command',
          commandText(invocation.name, invocation.arguments),
          this.commandOutput(output?.text ?? null, output?.record ?? null),
        ),
      });
    } else if (classified.type === 'localCommandOutput') {
      const run = record.system?.commandRun;
      if (run) {
        this.add(`notice:${record.uuid}`, record, {
          type: 'notice',
          value: notice(
            'command',
            commandText(run.name, run.arguments),
            this.commandOutput(capPreview(classified.text).text, record),
          ),
        });
      } else {
        this.addOutputNotice('command', classified.text, record);
      }
    } else if (classified.type === 'prompt') {
      this.addOutputNotice('command', classified.text, record);
    }
  }

  /**
   * What a local command's notice shows: its output `text`, read from `from`. Claude Code also
   * records some commands' result for the model as markdown, in a meta user record under the
   * output (`/context`); that reads better than the terminal's text, so it is shown instead.
   */
  protected commandOutput(
    text: string | null,
    from: ClaudeRecord | null,
  ): Pick<ChatNotice, 'detail' | 'detailFormat'> {
    for (const child of from === null ? [] : (this.children.get(from.uuid) ?? [])) {
      if (this.consumed.has(child.uuid) || child.kind.type !== 'user' || !child.isMeta) continue;
      if (toolResultsOf(child).length > 0 || child.sourceToolUseID !== null) continue;
      if (child.originKind !== null) continue;
      const classified = classifyUserText(textsOf(child).join('\n'));
      const markdown = classified.type === 'prompt' ? classified.text.trim() : '';
      if (markdown === '') continue;
      this.consumed.add(child.uuid);
      return { detail: capPreview(markdown).text, detailFormat: 'markdown' };
    }
    return { detail: nonEmpty(text) };
  }

  protected addQueuedCommand(record: ClaudeRecord): void {
    const queued = record.attachment?.queuedCommand;
    if (!queued || queued.isMeta) return;
    // A user record written for the same prompt shows it instead.
    if (queued.sourceUUID !== null && this.indexed.has(queued.sourceUUID)) return;
    const entryID = `user:${queued.sourceUUID ?? record.uuid}`;
    const classified = classifyUserText(queued.text);
    switch (classified.type) {
      case 'prompt':
        if (!isHuman(queued.originKind)) {
          this.addSystemNotice(classified.text, record);
          return;
        }
        if (classified.text === '' && queued.imageCount === 0) return;
        this.add(entryID, record, {
          type: 'user',
          value: userMessage(classified.text, { imageCount: queued.imageCount, wasQueued: true }),
        });
        return;
      case 'command':
        this.add(entryID, record, {
          type: 'user',
          value: userMessage(
            commandText(classified.invocation.name, classified.invocation.arguments),
            {
              imageCount: queued.imageCount,
              command: classified.invocation,
              wasQueued: true,
            },
          ),
        });
        return;
      case 'taskNotification':
        if (this.notificationKeys.has(notificationKey(classified.notification))) return;
        this.add(`notice:${record.uuid}`, record, {
          type: 'notice',
          value: noticeForNotification(classified.notification),
        });
        return;
      case 'external':
        this.addSystemNotices(classified.messages, record);
        return;
      default:
        return;
    }
  }
}

function localOutput(text: ClaudeUserText): string | null {
  return text.type === 'localCommandOutput' ? text.text : null;
}

function bashOutput(text: ClaudeUserText): string | null {
  return text.type === 'bashOutput' ? text.text : null;
}

export type { ChatNotice };
