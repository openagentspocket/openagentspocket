// Text helpers and the user-text classifier (Swift ClaudeText / ClaudeUserText /
// ClaudeTaskNotification). Notice titles are English product text recorded in the transcript
// entry, as in the Swift app; a UI that wants another language maps the notice kind.

import { trimSpaces } from '../../hosts/text';
import { workUsage } from '../model/factories';
import { capPreview } from '../model/preview';
import type { BackgroundWorkUsage, ChatToolPreview } from '../model/types';

export const MAXIMUM_TITLE_LENGTH = 200;

export function trimAll(text: string): string {
  return text.trim();
}

const TAG_CHAR = /[\p{L}\p{N}\-_]/u;
const SPACE = /\s/u;

export function leadingTag(text: string): string | null {
  if (!text.startsWith('<')) return null;
  let name = '';
  for (const char of text.slice(1)) {
    if (TAG_CHAR.test(char)) name += char;
    else if (char === '>' || SPACE.test(char)) return name === '' ? null : name;
    else return null;
  }
  return null;
}

/** The inside of the first `<tag …>…</tag>`; the rest of the text when it never closes. */
export function contentOfTag(tag: string, text: string): string | null {
  let searchStart = 0;
  for (;;) {
    const open = text.indexOf(`<${tag}`, searchStart);
    if (open < 0) return null;
    const afterOpen = open + tag.length + 1;
    if (afterOpen >= text.length) return null;
    const next = text.charAt(afterOpen);
    if (next !== '>' && !SPACE.test(next)) {
      searchStart = afterOpen;
      continue;
    }
    const openEnd = text.indexOf('>', afterOpen);
    if (openEnd < 0) return null;
    const close = text.indexOf(`</${tag}>`, openEnd + 1);
    return close < 0 ? text.slice(openEnd + 1) : text.slice(openEnd + 1, close);
  }
}

export function blocksOfTag(tag: string, text: string): { openingTag: string; content: string }[] {
  const blocks: { openingTag: string; content: string }[] = [];
  let searchStart = 0;
  for (;;) {
    const open = text.indexOf(`<${tag}`, searchStart);
    if (open < 0) break;
    const afterOpen = open + tag.length + 1;
    if (afterOpen >= text.length) break;
    const next = text.charAt(afterOpen);
    if (next !== '>' && !SPACE.test(next)) {
      searchStart = afterOpen;
      continue;
    }
    const openEnd = text.indexOf('>', afterOpen);
    if (openEnd < 0) break;
    const close = text.indexOf(`</${tag}>`, openEnd + 1);
    if (close < 0) break;
    blocks.push({
      openingTag: text.slice(open, openEnd + 1),
      content: text.slice(openEnd + 1, close),
    });
    searchStart = close + tag.length + 3;
  }
  return blocks;
}

export function attribute(name: string, tag: string): string | null {
  const marker = ` ${name}="`;
  const start = tag.indexOf(marker);
  if (start < 0) return null;
  const end = tag.indexOf('"', start + marker.length);
  if (end < 0) return null;
  const value = tag.slice(start + marker.length, end);
  return value === '' ? null : value;
}

export function stripTerminalEscapes(text: string): string {
  if (!text.includes('\u001b')) return text;
  const chars = Array.from(text);
  let out = '';
  let i = 0;
  while (i < chars.length) {
    const char = chars[i] as string;
    i += 1;
    if (char !== '\u001b') {
      out += char;
      continue;
    }
    const kind = chars[i];
    if (kind === '[') {
      i += 1;
      while (i < chars.length) {
        const code = (chars[i] as string).codePointAt(0) ?? 0;
        i += 1;
        if (code >= 0x40 && code <= 0x7e) break;
      }
    } else if (kind === ']') {
      i += 1;
      while (i < chars.length) {
        const next = chars[i] as string;
        i += 1;
        if (next === '\u0007') break;
        if (next === '\u001b') {
          if (chars[i] === '\\') i += 1;
          break;
        }
      }
    } else {
      i += 1;
    }
  }
  return out;
}

export function unescapeMarkup(text: string): string {
  if (!text.includes('&')) return text;
  return text.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
}

export function joinedContent(tags: string[], text: string): string {
  return tags
    .flatMap((tag) => contentOfTag(tag, text) ?? [])
    .map((part) => stripTerminalEscapes(part).trim())
    .filter((part) => part !== '')
    .join('\n');
}

export function previewJoining(parts: string[], imageCount = 0): ChatToolPreview {
  let text = '';
  let truncated = false;
  for (const part of parts) {
    const capped = capPreview(part);
    text += text === '' ? capped.text : `\n${capped.text}`;
    if (capped.isTruncated) {
      truncated = true;
      break;
    }
  }
  const preview = capPreview(text, imageCount);
  return { text: preview.text, isTruncated: truncated || preview.isTruncated, imageCount };
}

/** A notice's one-line title and the rest as detail. */
export function noticeParts(text: string): { title: string; detail: string | null } {
  const trimmed = text.trim();
  const newline = trimmed.indexOf('\n');
  const firstLine = trimSpaces(newline < 0 ? trimmed : trimmed.slice(0, newline));
  const title = Array.from(firstLine).slice(0, MAXIMUM_TITLE_LENGTH).join('');
  const rest =
    title === firstLine ? (newline < 0 ? '' : trimmed.slice(newline + 1).trim()) : trimmed;
  return { title, detail: rest === '' ? null : capPreview(rest).text };
}

export interface ClaudeTaskNotification {
  summary: string | null;
  status: string | null;
  toolUseID: string | null;
  taskID: string | null;
  result: string | null;
  usage: BackgroundWorkUsage | null;
}

export function parseTaskNotification(text: string): ClaudeTaskNotification {
  const field = (tag: string): string | null => contentOfTag(tag, text)?.trim() ?? null;
  const usageOpen = text.lastIndexOf('<usage>');
  const usageText = usageOpen < 0 ? null : contentOfTag('usage', text.slice(usageOpen));
  const count = (tag: string): number | null => {
    const value = usageText === null ? null : contentOfTag(tag, usageText)?.trim();
    return value && /^[+-]?\d+$/.test(value) ? Number.parseInt(value, 10) : null;
  };
  return {
    summary: field('summary'),
    status: field('status'),
    toolUseID: field('tool-use-id'),
    taskID: field('task-id'),
    result: field('result'),
    usage:
      usageText === null
        ? null
        : workUsage({
            tokens: count('subagent_tokens'),
            toolUses: count('tool_uses'),
            durationMilliseconds: count('duration_ms'),
            agents: count('agent_count'),
            agentsDone: count('agents_done'),
            agentsFailed: count('agents_error'),
          }),
  };
}

export function taskNotificationTitle(notification: ClaudeTaskNotification): string {
  if (notification.summary) return notification.summary;
  return notification.status === null
    ? 'Background task finished'
    : `Background task ${notification.status}`;
}
