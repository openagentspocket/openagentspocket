// How a recorded user message reads in Chat, following the Codex TUI's display rules (Swift
// CodexMessageFormatter): an answer to an async question is an Answered row, an IDE preamble folds
// into a chip, and a recognized `$skill` prompt reads as `/skill`.

import { userMessage } from '../model/factories';
import { asArray, asObject, asString } from '../model/reducer';
import type { ChatCommandInvocation, ChatUserMessage } from '../model/types';
import type { CodexUserContent } from './record';

/** Ends the IDE context the desktop app and IDE extension prepend; the request follows it. */
export const IDE_REQUEST_MARKER = '## My request for Codex:';
export const IDE_CONTEXT_PREFIX = '# Context from my IDE setup:\n';
/** The chip that stands in for a folded IDE preamble. */
export const IDE_CONTEXT_LABEL = 'IDE context';

const REPLY_OPEN = '<send_user_message_question_reply>';
const REPLY_CLOSE = '</send_user_message_question_reply>';

export interface QuestionReply {
  questionItemID: string;
  question: string;
  answer: string;
}

export type CodexUserDisplay =
  | { type: 'message'; message: ChatUserMessage }
  | { type: 'reply'; replies: QuestionReply[] };

function readReply(value: unknown): QuestionReply | null {
  const o = asObject(value);
  const id = o ? asString(o.questionItemId) : null;
  const question = o ? asString(o.question) : null;
  const answer = o ? asString(o.answer) : null;
  return id === null || question === null || answer === null
    ? null
    : { questionItemID: id, question, answer };
}

/** The request after the last IDE marker, trimmed; null when the text has no marker. */
export function ideRequest(text: string): string | null {
  const at = text.lastIndexOf(IDE_REQUEST_MARKER);
  return at < 0 ? null : text.slice(at + IDE_REQUEST_MARKER.length).trim();
}

/** The answers in an async-question reply envelope; null when the text is not one. */
export function questionReplies(raw: string): QuestionReply[] | null {
  let text = raw.trim();
  if (text.startsWith(IDE_CONTEXT_PREFIX)) {
    const marker = `\n${IDE_REQUEST_MARKER}\n`;
    const at = text.lastIndexOf(marker);
    if (at < 0) return null;
    text = text.slice(at + marker.length).trim();
  }
  if (
    !text.startsWith(REPLY_OPEN) ||
    !text.endsWith(REPLY_CLOSE) ||
    text.length < REPLY_OPEN.length + REPLY_CLOSE.length
  ) {
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(text.slice(REPLY_OPEN.length, text.length - REPLY_CLOSE.length));
  } catch {
    return null;
  }
  const array = asArray(json);
  if (array) {
    const replies = array.map(readReply);
    if (replies.some((r) => r === null)) return null;
    return replies.length === 0 ? null : (replies as QuestionReply[]);
  }
  const single = readReply(json);
  return single ? [single] : null;
}

function isSkillCharacter(char: string): boolean {
  return /^[A-Za-z0-9_:-]$/.test(char);
}

/** `$name rest` as a skill invocation when `name` is a known skill. */
export function skillInvocation(
  text: string,
  knownSkills: ReadonlySet<string>,
): ChatCommandInvocation | null {
  if (!text.startsWith('$')) return null;
  let end = 1;
  while (end < text.length && isSkillCharacter(text[end] as string)) end += 1;
  const name = text.slice(1, end);
  if (name === '' || !knownSkills.has(name)) return null;
  const rest = text.slice(end);
  if (rest !== '' && !/^\s/.test(rest)) return null;
  return { name, arguments: rest.replace(/^\s+/, '') };
}

/** The display for a user message. `skillNames` are the Host's skills. */
export function displayUserContent(
  content: CodexUserContent,
  skillNames: ReadonlySet<string>,
  wasQueued = false,
): CodexUserDisplay {
  const replies = questionReplies(content.text);
  if (replies) return { type: 'reply', replies };
  const labels = [...content.attachmentLabels];
  let body = content.text;
  const request = ideRequest(body);
  if (request !== null) {
    body = request;
    labels.unshift(IDE_CONTEXT_LABEL);
  }
  const known = new Set([...skillNames, ...content.skillNames]);
  return {
    type: 'message',
    message: userMessage(body, {
      imageCount: content.imageCount,
      attachmentLabels: labels,
      command: skillInvocation(body, known),
      wasQueued,
    }),
  };
}

/** `value` as a JSON string literal, escaped the way `serde_json` and `JSON.stringify` do. */
export function jsonString(value: string): string {
  return JSON.stringify(value);
}

/** The id the TUI gives question `index` of an async question message. */
export function asyncQuestionID(itemID: string, index: number): string {
  return `["request_user_input_async",${jsonString(itemID)},${index}]`;
}

/** True for legacy `user_message` events that carried model context rather than a prompt. */
export function isContextualLegacyMessage(text: string, kind: string | null): boolean {
  if (kind === 'environment_context' || kind === 'user_instructions') return true;
  const trimmed = text.trim().toLowerCase();
  return (
    (trimmed.startsWith('<environment_context>') && trimmed.endsWith('</environment_context>')) ||
    (trimmed.startsWith('<user_instructions>') && trimmed.endsWith('</user_instructions>'))
  );
}
