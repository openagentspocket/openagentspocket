// Helpers shared by the line decoders (Swift CodexRecordDecoder, helpers part).

import { decodeUtf8 } from '../../events/utf8';
import { type ChatLine, isTruncatedLine } from '../model/lines';
import { isAbsoluteHostPath } from '../model/paths';
import { asObject, asString, type JsonObject } from '../model/reducer';
import type { ChatOutputReference, ToolStatus } from '../model/types';
import { isCompleteObject, repairedPrefix } from './json-prefix';
import type { RawPart } from './raw';
import {
  ACCEPTED,
  type CodexLineOutcome,
  type CodexUserContent,
  INVALID,
  userContent as makeUserContent,
} from './record';

export interface DecodeContext {
  dialect: 'paginated' | 'legacy';
  /** The recorded session working directory, for titles and image paths. */
  cwd: string | null;
  /** The longest tool output decoded; an expanded row reading one again raises it. */
  outputDecodeLimit: number;
}

/** Tool outputs up to this size are decoded while following. */
export const OUTPUT_DECODE_LIMIT = 256 * 1024;

export function decodeContext(
  dialect: 'paginated' | 'legacy',
  cwd: string | null,
  outputDecodeLimit = OUTPUT_DECODE_LIMIT,
): DecodeContext {
  return { dialect, cwd, outputDecodeLimit };
}

/** A line that is never decoded: accepted when it is one whole object. */
export function shapeChecked(line: ChatLine): CodexLineOutcome {
  if (isTruncatedLine(line)) return ACCEPTED;
  return isCompleteObject(line.data) ? ACCEPTED : INVALID;
}

export interface Envelope {
  ordinal: number | null;
  type: string | null;
  payload: JsonObject | null;
}

/** Decodes a whole line, or a truncated line's repaired prefix. */
export function envelope(line: ChatLine): Envelope | null {
  const data = isTruncatedLine(line) ? repairedPrefix(line.data) : line.data;
  if (data === null) return null;
  let root: unknown;
  try {
    root = JSON.parse(decodeUtf8(data));
  } catch {
    return null;
  }
  const object = asObject(root);
  if (!object) return null;
  return {
    ordinal: typeof object.ordinal === 'number' ? object.ordinal : null,
    type: asString(object.type),
    payload: asObject(object.payload),
  };
}

export function reference(line: ChatLine): ChatOutputReference {
  return { path: null, offset: line.offset, length: line.length };
}

/** The Chat status a tool item's status records, or null while the call has no outcome. */
export function chatStatus(status: string | null): ToolStatus | null {
  switch (status) {
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'declined':
      return 'declined';
    case 'interrupted':
      return 'interrupted';
    default:
      return null;
  }
}

export function userContentOf(parts: readonly RawPart[]): CodexUserContent {
  const content = makeUserContent('');
  const texts: string[] = [];
  for (const part of parts) {
    switch (part.type ?? '') {
      case 'text':
        texts.push(part.text ?? '');
        break;
      case 'image':
        content.imageCount += 1;
        break;
      case 'local_image':
        content.imageCount += 1;
        if (part.path !== null) content.localImagePaths.push(part.path);
        break;
      case 'skill':
        if (part.name !== null) content.skillNames.push(part.name);
        break;
      case 'mention':
        break;
      case 'audio':
      case 'local_audio':
        content.attachmentLabels.push('Audio');
        break;
      default:
        content.attachmentLabels.push('Attachment');
    }
  }
  content.text = texts.join('');
  return content;
}

export function firstLine(text: string): string | null {
  const line = text.split('\n').find((l) => l !== '');
  const trimmed = line?.replace(/^[ \t]+|[ \t]+$/g, '');
  return trimmed ? trimmed : null;
}

export function mcpName(server: string | null, tool: string | null): string {
  return [server, tool].filter((v): v is string => v !== null).join('.');
}

/** A patch declined on Codex's card or cut off by Esc: failed with this output, nothing applied. */
export function isAbortedPatch(output: string | null): boolean {
  return output?.trim() === 'execution error: TurnAborted';
}

export function joinedOutput(stdout: string | null, stderr: string | null): string | null {
  const parts = [stdout, stderr].filter((p): p is string => p !== null && p !== '');
  return parts.length === 0 ? null : parts.join('\n');
}

export function sleepTitle(milliseconds: number | null): string {
  if (milliseconds === null) return 'Sleep';
  return milliseconds % 1000 === 0 ? `Sleep ${milliseconds / 1000}s` : `Sleep ${milliseconds}ms`;
}

/** A `file://` URI's path; plain paths pass through. */
export function fileURLPath(value: string): string {
  const match = /^file:\/\/[^/?#]*(\/[^?#]*)?/.exec(value);
  if (!match) return value;
  try {
    return decodeURIComponent(match[1] ?? '');
  } catch {
    return value;
  }
}

/** Resolves only recorded filesystem paths; joining keeps remote symlink semantics. */
export function remoteImagePath(value: string | null, cwd: string | null): string | null {
  if (!value) return null;
  if (value.toLowerCase().startsWith('file:')) {
    const match = /^file:\/\/([^/?#]*)(\/[^?#]*)?$/i.exec(value);
    if (!match) return null;
    const host = match[1] ?? '';
    if (host !== '' && host.toLowerCase() !== 'localhost') return null;
    let path: string;
    try {
      path = decodeURIComponent(match[2] ?? '');
    } catch {
      return null;
    }
    return isAbsoluteHostPath(path) ? path : null;
  }
  if (isAbsoluteHostPath(value)) return value;
  // Schemes, drive-relative and home-relative paths need context the transcript lacks.
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || value.startsWith('~') || value.startsWith('\\')) {
    return null;
  }
  if (!cwd || !isAbsoluteHostPath(cwd)) return null;
  const separator = cwd.startsWith('/') ? '/' : '\\';
  const path = cwd.endsWith(separator) ? cwd + value : cwd + separator + value;
  return isAbsoluteHostPath(path) ? path : null;
}
