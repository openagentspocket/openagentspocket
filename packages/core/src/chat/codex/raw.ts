// Lenient readers for the JSON a rollout line holds (Swift CodexRawItem, CodexRawEvent, ...).
// Rollouts are written by many Codex versions: a wrongly typed field reads as absent, never as an
// error. Each reader flattens its payload over every field the adapter uses.

import { asArray, asBool, asInt, asObject, asString, type JsonObject } from '../model/reducer';

export function lossyStrings(value: unknown): string[] | null {
  const array = asArray(value);
  return array ? array.filter((v): v is string => typeof v === 'string') : null;
}

export function lossyObjects<T>(
  value: unknown,
  read: (object: JsonObject) => T | null,
): T[] | null {
  const array = asArray(value);
  if (!array) return null;
  const out: T[] = [];
  for (const element of array) {
    const object = asObject(element);
    const item = object ? read(object) : null;
    if (item !== null) out.push(item);
  }
  return out;
}

function count(value: unknown): number {
  return asArray(value)?.length ?? 0;
}

export interface RawPart {
  type: string | null;
  text: string | null;
  path: string | null;
  name: string | null;
}

export function readPart(o: JsonObject): RawPart {
  return {
    type: asString(o.type),
    text: asString(o.text),
    path: asString(o.path),
    name: asString(o.name),
  };
}

export function readParts(value: unknown): RawPart[] | null {
  return lossyObjects(value, readPart);
}

export interface RawOutputBody {
  text: string;
  imageCount: number;
}

/** A tool output body: a string, or content items whose non-empty `input_text` parts join. */
export function readOutputBody(value: unknown): RawOutputBody | null {
  if (typeof value === 'string') return { text: value, imageCount: 0 };
  const parts = readParts(value);
  if (!parts) return null;
  return {
    text: parts
      .filter((p) => p.type === 'input_text' && p.text)
      .map((p) => p.text)
      .join('\n'),
    imageCount: parts.filter((p) => p.type === 'input_image').length,
  };
}

export interface RawAsyncQuestion {
  title: string | null;
  options: string[] | null;
}

function readAsyncQuestions(value: unknown): RawAsyncQuestion[] | null {
  return lossyObjects(value, (o) => ({
    title: asString(o.title),
    options: lossyStrings(o.options),
  }));
}

export interface RawParsedCommand {
  type: string | null;
  cmd: string | null;
  name: string | null;
  path: string | null;
  query: string | null;
}

export interface RawFileChange {
  type: string | null;
  content: string | null;
  unifiedDiff: string | null;
  movePath: string | null;
}

function readChanges(value: unknown): Record<string, RawFileChange> | null {
  const object = asObject(value);
  if (!object) return null;
  const out: Record<string, RawFileChange> = {};
  for (const [path, raw] of Object.entries(object)) {
    const o = asObject(raw);
    if (!o) continue;
    out[path] = {
      type: asString(o.type),
      content: asString(o.content),
      unifiedDiff: asString(o.unified_diff),
      movePath: asString(o.move_path),
    };
  }
  return out;
}

export interface RawMcpResult {
  content: RawPart[];
  isError: boolean | null;
}

export function readMcpResult(value: unknown): RawMcpResult | null {
  const o = asObject(value);
  if (!o) return null;
  return {
    content: readParts(o.content) ?? [],
    isError: asBool(o.isError) ?? asBool(o.is_error),
  };
}

export interface RawMcpEndResult {
  ok: RawMcpResult | null;
  error: string | null;
}

function readMcpEndResult(value: unknown): RawMcpEndResult | null {
  const o = asObject(value);
  return o ? { ok: readMcpResult(o.Ok), error: asString(o.Err) } : null;
}

export interface RawWebAction {
  type: string | null;
  query: string | null;
  queries: string[] | null;
  url: string | null;
  pattern: string | null;
}

function readWebAction(value: unknown): RawWebAction | null {
  const o = asObject(value);
  if (!o) return null;
  return {
    type: asString(o.type),
    query: asString(o.query),
    queries: lossyStrings(o.queries),
    url: asString(o.url),
    pattern: asString(o.pattern),
  };
}

function durationMilliseconds(value: unknown): number | null {
  const o = asObject(value);
  const seconds = o ? asInt(o.secs) : null;
  if (!o || seconds === null) return null;
  return seconds * 1000 + Math.trunc((asInt(o.nanos) ?? 0) / 1_000_000);
}

function errorMessage(value: unknown): string | null {
  return asString(asObject(value)?.message);
}

function reviewExplanation(value: unknown): string | null {
  return asString(asObject(value)?.overall_explanation);
}

/** A `TurnItem`, flattened: every item type's fields, all optional. */
export interface RawItem {
  type: string | null;
  id: string | null;
  kind: string | null;
  content: RawPart[] | null;
  phase: string | null;
  delivery: string | null;
  questions: RawAsyncQuestion[] | null;
  summaryText: string[] | null;
  text: string | null;
  fragments: string[] | null;
  command: string[] | null;
  cwd: string | null;
  parsedCommands: RawParsedCommand[] | null;
  source: string | null;
  status: string | null;
  aggregatedOutput: string | null;
  exitCode: number | null;
  changes: Record<string, RawFileChange> | null;
  stdout: string | null;
  stderr: string | null;
  server: string | null;
  tool: string | null;
  namespace: string | null;
  result: RawMcpResult | null;
  errorMessage: string | null;
  contentItems: RawPart[] | null;
  success: boolean | null;
  prompt: string | null;
  query: string | null;
  action: RawWebAction | null;
  path: string | null;
  revisedPrompt: string | null;
  savedPath: string | null;
  durationMilliseconds: number | null;
  agentPath: string | null;
  userFacingHint: string | null;
  reviewExplanation: string | null;
  name: string | null;
  output: RawOutputBody | null;
}

export function readItem(o: JsonObject): RawItem {
  return {
    type: asString(o.type),
    id: asString(o.id),
    kind: asString(o.kind),
    content: readParts(o.content),
    phase: asString(o.phase),
    delivery: asString(o.delivery),
    questions: readAsyncQuestions(o.questions),
    summaryText: lossyStrings(o.summary_text),
    text: asString(o.text),
    fragments: lossyObjects(o.fragments, (f) => asString(f.text)),
    command: lossyStrings(o.command),
    cwd: asString(o.cwd),
    parsedCommands: lossyObjects(o.parsed_cmd, (p) => ({
      type: asString(p.type),
      cmd: asString(p.cmd),
      name: asString(p.name),
      path: asString(p.path),
      query: asString(p.query),
    })),
    source: asString(o.source),
    status: asString(o.status),
    aggregatedOutput: asString(o.aggregated_output),
    exitCode: asInt(o.exit_code),
    changes: readChanges(o.changes),
    stdout: asString(o.stdout),
    stderr: asString(o.stderr),
    server: asString(o.server),
    tool: asString(o.tool),
    namespace: asString(o.namespace),
    result: readMcpResult(o.result),
    errorMessage: errorMessage(o.error) ?? asString(o.error),
    contentItems: readParts(o.content_items),
    success: asBool(o.success),
    prompt: asString(o.prompt),
    query: asString(o.query),
    action: readWebAction(o.action),
    path: asString(o.path),
    revisedPrompt: asString(o.revised_prompt) ?? asString(o.revisedPrompt),
    savedPath: asString(o.saved_path) ?? asString(o.savedPath),
    durationMilliseconds: asInt(o.durationMs) ?? durationMilliseconds(o.duration),
    agentPath: asString(o.agent_path),
    userFacingHint: asString(o.user_facing_hint) ?? asString(o.review),
    reviewExplanation: reviewExplanation(o.review_output),
    name: asString(o.name),
    output: readOutputBody(o.output),
  };
}

/** An `event_msg` payload, flattened over the event types the adapter reads. */
export interface RawEvent {
  type: string | null;
  turnID: string | null;
  rootTurnID: string | null;
  reason: string | null;
  errorMessage: string | null;
  item: RawItem | null;
  startedAtMilliseconds: number | null;
  completedAtMilliseconds: number | null;
  turnStartedAt: number | null;
  turnCompletedAt: number | null;
  message: string | null;
  kind: string | null;
  imageCount: number;
  localImages: string[];
  audioCount: number;
  phase: string | null;
  delivery: string | null;
  questions: RawAsyncQuestion[] | null;
  text: string | null;
  numTurns: number | null;
  callID: string | null;
  stdout: string | null;
  stderr: string | null;
  success: boolean | null;
  status: string | null;
  changes: Record<string, RawFileChange> | null;
  server: string | null;
  tool: string | null;
  mcpResult: RawMcpEndResult | null;
  query: string | null;
  action: RawWebAction | null;
  revisedPrompt: string | null;
  savedPath: string | null;
  eventID: string | null;
  agentPath: string | null;
  itemID: string | null;
  userFacingHint: string | null;
  reviewExplanation: string | null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readEvent(o: JsonObject): RawEvent {
  const item = asObject(o.item);
  const invocation = asObject(o.invocation);
  return {
    type: asString(o.type),
    turnID: asString(o.turn_id),
    rootTurnID: asString(o.root_turn_id),
    reason: asString(o.reason),
    errorMessage: errorMessage(o.error),
    item: item ? readItem(item) : null,
    startedAtMilliseconds: asInt(o.started_at_ms),
    completedAtMilliseconds: asInt(o.completed_at_ms),
    turnStartedAt: asNumber(o.started_at),
    turnCompletedAt: asNumber(o.completed_at),
    message: asString(o.message),
    kind: asString(o.kind),
    imageCount: count(o.images) + count(o.file_ids),
    localImages: lossyStrings(o.local_images) ?? [],
    audioCount: count(o.audio) + count(o.local_audio),
    phase: asString(o.phase),
    delivery: asString(o.delivery),
    questions: readAsyncQuestions(o.questions),
    text: asString(o.text),
    numTurns: asInt(o.num_turns),
    callID: asString(o.call_id),
    stdout: asString(o.stdout),
    stderr: asString(o.stderr),
    success: asBool(o.success),
    status: asString(o.status),
    changes: readChanges(o.changes),
    server: invocation ? asString(invocation.server) : null,
    tool: invocation ? asString(invocation.tool) : null,
    mcpResult: readMcpEndResult(o.result),
    query: asString(o.query),
    action: readWebAction(o.action),
    revisedPrompt: asString(o.revised_prompt),
    savedPath: asString(o.saved_path),
    eventID: asString(o.event_id),
    agentPath: asString(o.agent_path),
    itemID: asString(o.item_id),
    userFacingHint: asString(o.user_facing_hint),
    reviewExplanation: reviewExplanation(o.review_output),
  };
}
