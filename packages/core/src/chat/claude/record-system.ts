// Decoding of system and attachment records.

import { asBool, asInt, asObject, asString, type JsonObject } from '../model/reducer';
import { rawBlocks, strings } from './record-result';
import type {
  ClaudeAttachmentDetails,
  ClaudeCompaction,
  ClaudeSystemDetails,
} from './record-types';

function nonEmptyOrNull(value: string | null): string | null {
  return value === null || value === '' ? null : value;
}

export const SYSTEM_CONTENT_CAP = 16 * 1024;

function decodeCompaction(value: unknown): ClaudeCompaction | null {
  const raw = asObject(value);
  if (!raw) return null;
  const compaction: ClaudeCompaction = {
    trigger: asString(raw.trigger),
    preTokens: asInt(raw.preTokens),
    preservedSegment: null,
    preservedMessages: null,
  };
  const segment = asObject(raw.preservedSegment);
  const head = asString(segment?.headUuid);
  const anchor = asString(segment?.anchorUuid);
  const tail = asString(segment?.tailUuid);
  if (head !== null && anchor !== null && tail !== null) {
    compaction.preservedSegment = { headUUID: head, anchorUUID: anchor, tailUUID: tail };
  }
  const messages = asObject(raw.preservedMessages);
  const messageAnchor = asString(messages?.anchorUuid);
  const uuids = strings(messages?.uuids);
  if (messageAnchor !== null && uuids !== null) {
    compaction.preservedMessages = { anchorUUID: messageAnchor, uuids };
  }
  return compaction;
}

function capSystemContent(text: string): string {
  return text.length <= SYSTEM_CONTENT_CAP
    ? text
    : Array.from(text).slice(0, SYSTEM_CONTENT_CAP).join('');
}

export function decodeSystem(raw: JsonObject): ClaudeSystemDetails {
  const content = asString(raw.content);
  const run = asObject(raw.commandRun);
  const command = asString(run?.command);
  return {
    content: content === null ? null : capSystemContent(content),
    logicalParentUUID: asString(raw.logicalParentUuid),
    compaction: decodeCompaction(raw.compactMetadata),
    retractedMessageUUIDs: strings(raw.retractedMessageUuids) ?? [],
    originalModel: asString(raw.originalModel),
    fallbackModel: asString(raw.fallbackModel),
    commandRun:
      command === null
        ? null
        : {
            name: command.startsWith('/') ? command.slice(1) : command,
            arguments: asString(run?.args) ?? '',
          },
  };
}

export function decodeAttachment(raw: JsonObject, type: string): ClaudeAttachmentDetails | null {
  const attachment = asObject(raw.attachment);
  if (!attachment) return null;
  const details: ClaudeAttachmentDetails = {
    queuedCommand: null,
    planFilePath: asString(attachment.planFilePath),
  };
  if (type === 'queued_command') {
    const blocks = rawBlocks(attachment.prompt) ?? [];
    details.queuedCommand = {
      text: blocks
        .flatMap((b) => (asString(b.type) === 'text' ? (asString(b.text) ?? []) : []))
        .join('\n'),
      imageCount: blocks.filter((b) => asString(b.type) === 'image').length,
      sourceUUID: nonEmptyOrNull(asString(attachment.source_uuid)),
      commandMode: asString(attachment.commandMode),
      originKind: asString(asObject(attachment.origin)?.kind),
      isMeta: asBool(attachment.isMeta) ?? false,
    };
  }
  return details;
}
