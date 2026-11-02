// Classifies what a user record says (Swift ClaudeUserText).

import type { ChatCommandInvocation } from '../model/types';
import {
  attribute,
  blocksOfTag,
  type ClaudeTaskNotification,
  contentOfTag,
  joinedContent,
  leadingTag,
  parseTaskNotification,
  unescapeMarkup,
} from './text';

export type ClaudeUserText =
  | { type: 'prompt'; text: string }
  | { type: 'command'; invocation: ChatCommandInvocation }
  | { type: 'skillLoaded'; invocation: ChatCommandInvocation }
  | { type: 'localCommandOutput'; text: string }
  | { type: 'bashInput'; text: string }
  | { type: 'bashOutput'; text: string }
  | { type: 'taskNotification'; notification: ClaudeTaskNotification }
  | { type: 'external'; messages: string[] }
  | { type: 'hidden' };

const COMMAND_TAGS = new Set([
  'command-name',
  'command-message',
  'command-args',
  'command-contents',
]);
const LOCAL_OUTPUT_TAGS = new Set(['local-command-stdout', 'local-command-stderr']);
const BASH_OUTPUT_TAGS = new Set(['bash-stdout', 'bash-stderr', 'bash-exit-code']);
const HIDDEN_TAGS = new Set([
  'local-command-caveat',
  'system-reminder',
  'system_reminder',
  'user-prompt-submit-hook',
  'function_results',
  'tool_use_error',
  'sandbox_violations',
  'persisted-output',
  'total_tokens',
  'tick',
  'fork-boilerplate',
  'forked-skill-launch',
  'fork-source',
  'message-files-missing',
  'skill-format',
]);
const EXTERNAL_TAGS = new Set([
  'teammate-message',
  'channel',
  'cross-session-message',
  'slack-ping',
  'slack-tag-message',
  'agent-message',
  'coordinator-relay',
  'remote-review',
  'fetched-web-content',
]);

export const USER_TEXT_MARKERS = [
  '[Request interrupted by user]',
  '[Request interrupted by user for tool use]',
  '[Tool call did not complete:',
  '[Tool call interrupted:',
  '[Tool call result not in this copy:',
  "The user doesn't want to take this action right now.",
  '[Tool call skipped:',
  '[Tool call not completed:',
];

export function isMarker(text: string): boolean {
  return USER_TEXT_MARKERS.some((marker) => text.startsWith(marker));
}

const PEER_HEADERS = [
  'Another Claude session sent a message:',
  'Another Claude session sent a message while you were working:',
  'A peer session sent a message while you were working:',
];

function idleNotification(content: string): { from: string | null; result: string | null } | null {
  if (!content.startsWith('{')) return null;
  try {
    const object: unknown = JSON.parse(content);
    if (typeof object !== 'object' || object === null) return null;
    const record = object as Record<string, unknown>;
    if (record.type !== 'idle_notification') return null;
    const result = typeof record.result === 'string' ? record.result.trim() : null;
    return {
      from: typeof record.from === 'string' ? record.from : null,
      result: result === '' ? null : result,
    };
  } catch {
    return null;
  }
}

function teammateMessages(tag: string, text: string): string[] | null {
  const blocks = blocksOfTag(tag, text);
  if (blocks.length === 0) return null;
  return blocks.map((block) => {
    const content = block.content.trim();
    const sender = attribute('teammate_id', block.openingTag);
    const idle = idleNotification(content);
    if (idle) {
      const name = idle.from ?? sender;
      const title = name === null ? 'Teammate finished' : `Teammate @${name} finished`;
      return [title, idle.result].flatMap((part) => part ?? []).join('\n');
    }
    const title = sender === null ? 'Message' : `Message from @${sender}`;
    return content === '' ? title : `${title}\n${content}`;
  });
}

export function peerMessages(text: string): string[] | null {
  const header = PEER_HEADERS.find((candidate) => text.startsWith(candidate));
  if (!header) return null;
  const body = text.slice(header.length).trim();
  const tag = leadingTag(body);
  if (tag === null || !EXTERNAL_TAGS.has(tag)) return null;
  return teammateMessages(tag, body);
}

const OPENER = '<pasted_content id="';

/** Pastes the CLI wraps in `<pasted_content id="xxxx">` come back as the pasted text. */
export function unwrapPastedContent(text: string): string {
  if (!text.includes(OPENER)) return text;
  const parts: string[] = [];
  let textStart = 0;
  let searchStart = 0;
  let unwrapped = false;
  for (;;) {
    const open = text.indexOf(OPENER, searchStart);
    if (open < 0) break;
    const idStart = open + OPENER.length;
    const idEnd = idStart + 4;
    if (
      idEnd + 3 > text.length ||
      !/^[0-9a-f]{4}$/.test(text.slice(idStart, idEnd)) ||
      text.slice(idEnd, idEnd + 3) !== '">\n'
    ) {
      searchStart = idStart;
      continue;
    }
    const bodyStart = idEnd + 3;
    const closer = `\n</pasted_content id="${text.slice(idStart, idEnd)}">`;
    // The closer's own newline may be the opener's, for an empty paste.
    const close = text.indexOf(closer, bodyStart - 1);
    if (close < 0) break;
    let textEnd = open;
    let dropped = 0;
    while (dropped < 2 && textEnd > textStart && text.charAt(textEnd - 1) === '\n') {
      textEnd -= 1;
      dropped += 1;
    }
    parts.push(text.slice(textStart, textEnd), text.slice(bodyStart, Math.max(bodyStart, close)));
    textStart = close + closer.length;
    dropped = 0;
    while (dropped < 2 && textStart < text.length && text.charAt(textStart) === '\n') {
      textStart += 1;
      dropped += 1;
    }
    searchStart = textStart;
    unwrapped = true;
  }
  if (!unwrapped) return text;
  parts.push(text.slice(textStart));
  return parts.join('');
}

export function classifyUserText(text: string): ClaudeUserText {
  const trimmed = text.trim();
  const peers = peerMessages(trimmed);
  if (peers) return { type: 'external', messages: peers };
  const tag = leadingTag(trimmed);
  if (tag === null) return { type: 'prompt', text: unwrapPastedContent(text) };
  if (COMMAND_TAGS.has(tag)) {
    const rawName = (
      contentOfTag('command-name', trimmed) ??
      contentOfTag('command-message', trimmed) ??
      ''
    ).trim();
    const args = (contentOfTag('command-args', trimmed) ?? '').trim();
    const skillFormat = contentOfTag('skill-format', trimmed)?.trim() === 'true';
    if (!rawName.startsWith('/') && skillFormat) {
      return { type: 'skillLoaded', invocation: { name: rawName, arguments: args } };
    }
    const name = rawName.startsWith('/') ? rawName.slice(1) : rawName;
    return { type: 'command', invocation: { name, arguments: args } };
  }
  if (LOCAL_OUTPUT_TAGS.has(tag)) {
    return {
      type: 'localCommandOutput',
      text: joinedContent(['local-command-stdout', 'local-command-stderr'], trimmed),
    };
  }
  if (tag === 'bash-input') return { type: 'bashInput', text: contentOfTag(tag, trimmed) ?? '' };
  if (BASH_OUTPUT_TAGS.has(tag)) {
    // The CLI escapes `&`, `<` and `>` in shell output so it cannot close the tags.
    return {
      type: 'bashOutput',
      text: unescapeMarkup(joinedContent(['bash-stdout', 'bash-stderr'], trimmed)),
    };
  }
  if (tag === 'task-notification')
    return { type: 'taskNotification', notification: parseTaskNotification(trimmed) };
  if (HIDDEN_TAGS.has(tag)) return { type: 'hidden' };
  if (tag === 'teammate-message') {
    const messages = teammateMessages(tag, trimmed);
    if (messages) return { type: 'external', messages };
  }
  if (EXTERNAL_TAGS.has(tag))
    return { type: 'external', messages: [contentOfTag(tag, trimmed) ?? trimmed] };
  return { type: 'prompt', text: unwrapPastedContent(text) };
}

/** The key a recorded prompt and its echoed user record share. */
export function echoKey(text: string): string {
  const unified = text.normalize('NFC').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  return unwrapPastedContent(unified).trim();
}
