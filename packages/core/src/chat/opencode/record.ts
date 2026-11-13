// Reads the lines the OpenCode record source hands the reducer (Swift OpenCodeLine, ADR 0025).
// Decoding never throws: unknown keys are ignored, and a value of an unexpected JSON type reads as
// absent, so one odd field costs only itself.

import { decodeUtf8 } from '../../events/utf8';
import { asArray, asInt, asObject, asString, type JsonObject } from '../model/reducer';
import type {
  OpenCodeError,
  OpenCodeFileDiff,
  OpenCodeItemKind,
  OpenCodeLine,
  OpenCodeNote,
  OpenCodeQuestion,
  OpenCodeRow,
  OpenCodeRowContent,
  OpenCodeSession,
  OpenCodeStep,
  OpenCodeText,
  OpenCodeTool,
  OpenCodeToolInput,
  OpenCodeToolMetadata,
} from './record-types';

export type * from './record-types';

/** A flag stored as a JSON boolean, or as the 0 or 1 SQLite's `json_extract` makes of one. */
function flag(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  const int = asInt(value);
  return int === null ? null : int !== 0;
}

const str = (object: JsonObject, key: string) => asString(object[key]);
const int = (object: JsonObject, key: string) => asInt(object[key]);

/** The elements of the array at `key` that read as `Element`; empty when absent or not an array. */
function lossy<T>(value: unknown, read: (element: unknown) => T | null): T[] {
  const out: T[] = [];
  for (const element of asArray(value) ?? []) {
    const item = read(element);
    if (item !== null) out.push(item);
  }
  return out;
}

export function readError(value: unknown): OpenCodeError | null {
  const message = asString(value);
  if (message !== null) return { type: null, message };
  const object = asObject(value);
  return object ? { type: str(object, 'type'), message: str(object, 'message') } : null;
}

function readFileDiff(value: unknown): OpenCodeFileDiff | null {
  const object = asObject(value);
  if (!object) return null;
  return {
    file: str(object, 'file'),
    status: str(object, 'status'),
    additions: int(object, 'additions'),
    deletions: int(object, 'deletions'),
    patch: str(object, 'patch'),
  };
}

function readMetadata(value: unknown): OpenCodeToolMetadata | null {
  const object = asObject(value);
  if (!object) return null;
  const answers = asArray(object.answers);
  const rows = answers?.map((row) => asArray(row)) ?? null;
  const valid = rows?.every((row) => row?.every((label) => typeof label === 'string'));
  return {
    exit: int(object, 'exit'),
    truncated: flag(object.truncated),
    status: str(object, 'status'),
    sessionID: str(object, 'sessionID'),
    name: str(object, 'name'),
    files: lossy(object.files, readFileDiff),
    diff: str(object, 'diff'),
    filediff: readFileDiff(object.filediff),
    answers: valid ? (rows as string[][]) : null,
  };
}

function readQuestion(value: unknown): OpenCodeQuestion | null {
  const object = asObject(value);
  if (!object) return null;
  return {
    question: str(object, 'question'),
    header: str(object, 'header'),
    options: lossy(object.options, (option) => {
      const entry = asObject(option);
      return entry ? { label: str(entry, 'label'), description: str(entry, 'description') } : null;
    }),
    multiple: flag(object.multiple),
  };
}

function emptyInput(): OpenCodeToolInput {
  return {
    filePath: null,
    path: null,
    command: null,
    pattern: null,
    url: null,
    query: null,
    description: null,
    agent: null,
    subagentType: null,
    patchText: null,
    id: null,
    questions: [],
    text: null,
  };
}

function readInput(value: unknown): OpenCodeToolInput {
  const text = asString(value);
  if (text !== null) return { ...emptyInput(), text };
  const object = asObject(value);
  if (!object) return emptyInput();
  return {
    ...emptyInput(),
    filePath: str(object, 'filePath'),
    path: str(object, 'path'),
    command: str(object, 'command'),
    pattern: str(object, 'pattern'),
    url: str(object, 'url'),
    query: str(object, 'query'),
    description: str(object, 'description'),
    agent: str(object, 'agent'),
    subagentType: str(object, 'subagent_type'),
    patchText: str(object, 'patchText'),
    id: str(object, 'id'),
    questions: lossy(object.questions, readQuestion),
  };
}

function readText(object: JsonObject): OpenCodeText {
  const time = asObject(object.time);
  return {
    text: str(object, 'text') ?? '',
    length: int(object, 'n'),
    started: time ? int(time, 'created') : null,
    completed: time ? int(time, 'completed') : null,
  };
}

function readTool(object: JsonObject): OpenCodeTool | null {
  const name = str(object, 'name');
  if (name === null) return null;
  return {
    callID: str(object, 'id'),
    name,
    status: str(object, 'status'),
    input: readInput(object.input),
    error: readError(object.error),
    metadata: readMetadata(object.meta),
    output: str(object, 'out'),
    outputLength: int(object, 'outN'),
  };
}

function readStep(data: JsonObject): OpenCodeStep {
  const items = (asArray(data.content) ?? []).map((element, position) => {
    const object = asObject(element);
    if (!object) return { index: position, kind: { type: 'other' } as OpenCodeItemKind };
    const index = int(object, '_i') ?? position;
    switch (str(object, 'type')) {
      case 'text':
        return { index, kind: { type: 'text', text: readText(object) } as OpenCodeItemKind };
      case 'reasoning':
        return { index, kind: { type: 'reasoning', text: readText(object) } as OpenCodeItemKind };
      case 'tool': {
        const tool = readTool(object);
        return {
          index,
          kind: (tool ? { type: 'tool', tool } : { type: 'other' }) as OpenCodeItemKind,
        };
      }
      default:
        return { index, kind: { type: 'other' } as OpenCodeItemKind };
    }
  });
  const retry = asObject(data.retry);
  const time = asObject(data.time);
  return {
    items,
    finish: str(data, 'finish'),
    error: readError(data.error),
    retry: retry ? { attempt: int(retry, 'attempt'), error: readError(retry.error) } : null,
    completed: time ? int(time, 'completed') : null,
  };
}

function readNote(data: JsonObject): OpenCodeNote {
  const metadata = asObject(data.metadata);
  return {
    text: str(data, 'text'),
    description: str(data, 'description'),
    hasMetadata: metadata !== null,
    source: metadata ? str(metadata, 'source') : null,
    jobID: metadata ? str(metadata, 'jobID') : null,
    childID: metadata ? str(metadata, 'childID') : null,
    state: metadata ? str(metadata, 'state') : null,
    notice: metadata ? str(metadata, 'notice') : null,
    skill: str(data, 'skill'),
    name: str(data, 'name'),
  };
}

function readContent(type: string, data: JsonObject): OpenCodeRowContent {
  switch (type) {
    case 'user':
      return {
        type: 'user',
        message: {
          text: str(data, 'text'),
          length: int(data, 'n'),
          files: lossy(data.files, (file) => {
            const entry = asObject(file);
            return entry ? { name: str(entry, 'name'), mime: str(entry, 'mime') } : null;
          }),
        },
      };
    case 'assistant':
      return { type: 'assistant', step: readStep(data) };
    case 'idle':
      return {
        type: 'idle',
        idle: { outcome: str(data, 'outcome'), error: readError(data.error) },
      };
    case 'compaction':
      return {
        type: 'compaction',
        compaction: {
          status: str(data, 'status'),
          reason: str(data, 'reason'),
          summary: str(data, 'summary'),
          error: readError(data.error),
        },
      };
    case 'synthetic':
    case 'system':
    case 'skill':
      return { type: 'note', note: readNote(data) };
    case 'shell':
      return {
        type: 'shell',
        shell: { command: str(data, 'command'), output: str(data, 'output') },
      };
    case 'agent-switched':
      return { type: 'agentSwitched', agent: str(data, 'agent') };
    case 'model-switched': {
      const model = asObject(data.model);
      return { type: 'modelSwitched', model: model ? str(model, 'id') : null };
    }
    case 'location-switched': {
      const location = asObject(data.location);
      return { type: 'locationSwitched', directory: location ? str(location, 'directory') : null };
    }
    default:
      return { type: 'unknown' };
  }
}

function readRow(object: JsonObject): OpenCodeRow | null {
  const id = str(object, 'id');
  const type = str(object, 'type');
  const seq = int(object, 'seq');
  if (id === null || type === null || seq === null) return null;
  const big = int(object, 'big');
  const data = asObject(object.d);
  let content: OpenCodeRowContent;
  if (big !== null) content = { type: 'oversized', size: big };
  else if (data && str(data, 'k') !== 'invalid') content = readContent(type, data);
  else content = { type: 'invalid' };
  return {
    id,
    type,
    seq,
    created: int(object, 'tc'),
    updated: int(object, 'tu'),
    isFinal: flag(object.f) ?? true,
    content,
  };
}

export function readOpenCodeLine(data: Uint8Array): OpenCodeLine {
  let value: unknown;
  try {
    value = JSON.parse(decodeUtf8(data));
  } catch {
    return { kind: 'malformed' };
  }
  const object = asObject(value);
  if (!object) return { kind: 'malformed' };
  switch (str(object, 'k')) {
    case 'session':
      return {
        kind: 'session',
        session: {
          parent: str(object, 'parent'),
          title: str(object, 'title'),
          version: str(object, 'version'),
          revertMessage: str(object, 'revertMessage'),
          revertSeq: int(object, 'revertSeq'),
        },
      };
    case 'inbox':
      return {
        kind: 'inbox',
        inbox: {
          items: lossy(object.items, (element) => {
            const item = asObject(element);
            if (!item) return null;
            return {
              id: str(item, 'id'),
              type: str(item, 'type'),
              seq: int(item, 'seq'),
              text: str(item, 'text'),
              length: int(item, 'n'),
              files: lossy(item.files, asString),
            };
          }),
        },
      };
    case 'row': {
      const row = readRow(object);
      return row ? { kind: 'row', row } : { kind: 'malformed' };
    }
    default:
      return { kind: 'malformed' };
  }
}

/** The major version of a session's `version`. */
export function majorVersion(session: OpenCodeSession | null): number | null {
  const first = session?.version?.split('.')[0];
  if (first === undefined || !/^[0-9]+$/.test(first)) return null;
  return Number.parseInt(first, 10);
}
