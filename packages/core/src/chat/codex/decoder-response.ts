// `response_item` and `retained_context` lines (Swift CodexRecordDecoder, "Response items").

import { type ChatLine, isTruncatedLine } from '../model/lines';
import { asArray, asObject, asString } from '../model/reducer';
import { CLASSIFIER_PREFIX_LIMIT, type CodexLineClassification, classifyLine } from './classifier';
import {
  type DecodeContext,
  envelope,
  fileURLPath,
  reference,
  remoteImagePath,
  shapeChecked,
} from './decoder-common';
import { includesBytes } from './json-bytes';
import { isCompleteObject } from './json-prefix';
import { type RawResponse, readResponse, readRetained } from './raw-response';
import {
  ACCEPTED,
  type CodexCallOutput,
  type CodexLineOutcome,
  type CodexSyncQuestion,
  type CodexToolSnapshot,
  callOutput,
  INVALID,
  OVERSIZED,
  snapshot,
  withRecord,
} from './record';
import * as summary from './tool-summary';

const CODE_MODE_PATCH_CALL = 'tools.apply_patch(';
const ABORTED_BY_USER = 'aborted by user';
export const CANCELLED_QUESTION_OUTPUT =
  'request_user_input was cancelled before receiving a response';

function response(line: ChatLine): RawResponse | null {
  const payload = envelope(line)?.payload;
  return payload ? readResponse(payload) : null;
}

/** The line classified from all the bytes it has, for a field the default prefix cut off. */
function reclassified(line: ChatLine): CodexLineClassification | null {
  return line.data.length > CLASSIFIER_PREFIX_LIMIT
    ? classifyLine(line.data, line.data.length)
    : null;
}

export function decodeResponse(
  type: string,
  line: ChatLine,
  classification: CodexLineClassification,
  context: DecodeContext,
): CodexLineOutcome {
  const legacy = context.dialect === 'legacy';
  switch (type) {
    case 'function_call': {
      let current = classification;
      if (current.name === null) current = reclassified(line) ?? current;
      if (current.name === 'request_user_input') return decodeQuestionCall(line, context);
      return legacy ? decodeCall(type, line, current, context) : shapeChecked(line);
    }
    case 'custom_tool_call':
    case 'local_shell_call': {
      if (legacy) return decodeCall(type, line, classification, context);
      if (type === 'custom_tool_call' && classification.name === 'exec') {
        const patch = codeModePatch(line, context);
        if (patch) return patch;
      }
      return shapeChecked(line);
    }
    case 'function_call_output':
      return decodeOutput(line, classification, context);
    case 'custom_tool_call_output':
      if (legacy) return decodeOutput(line, classification, context);
      return abortedOutput(line) ?? shapeChecked(line);
    case 'message':
      if (legacy && classification.role === 'user') return decodeHookMessage(line);
      return shapeChecked(line);
    default:
      return shapeChecked(line);
  }
}

function decodeHookMessage(line: ChatLine): CodexLineOutcome {
  if (isTruncatedLine(line) || !includesBytes(line.data, '<hook_prompt')) return shapeChecked(line);
  const parsed = response(line);
  if (!parsed) return INVALID;
  const hook = hookPrompt(parsed.content ?? []);
  if (hook === null) return ACCEPTED;
  const id = parsed.id ?? `hook@${line.offset}`;
  return withRecord({
    type: 'legacyItem',
    item: { id, content: { type: 'hook', text: hook } },
    placement: { type: 'current' },
  });
}

/** A paginated rollout's code-mode `exec` call, read only when its script applies a patch. */
function codeModePatch(line: ChatLine, context: DecodeContext): CodexLineOutcome | null {
  if (isTruncatedLine(line) || !includesBytes(line.data, CODE_MODE_PATCH_CALL)) return null;
  const parsed = response(line);
  if (!parsed || parsed.callID === null || parsed.input === null) return null;
  const patches = summary.codeModePatches(parsed.input, CODE_MODE_PATCH_CALL);
  if (patches.length === 0) return null;
  const patch = summary.patchSummary(patches.join('\n'), context.cwd);
  if (!patch) return null;
  // Only a declined or stopped call shows this row: nothing was applied, so no output or counts.
  const row = snapshot({
    kind: patch.kind,
    name: 'apply_patch',
    title: patch.title,
    callID: parsed.callID,
    output: reference(line),
  });
  return withRecord({
    type: 'codeModePatch',
    patch: { callID: parsed.callID, turnID: parsed.turnID, snapshot: row },
  });
}

/** A paginated rollout's custom tool output, read only when the user aborted the call. */
function abortedOutput(line: ChatLine): CodexLineOutcome | null {
  if (isTruncatedLine(line) || !includesBytes(line.data, ABORTED_BY_USER)) return null;
  const parsed = response(line);
  if (!parsed || parsed.callID === null || !parsed.output?.text.startsWith(ABORTED_BY_USER)) {
    return null;
  }
  return withRecord({
    type: 'callOutput',
    output: callOutput(parsed.callID, reference(line), { isAbortedByUser: true }),
  });
}

function syncQuestions(argumentsText: string | null): CodexSyncQuestion[] {
  if (argumentsText === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(argumentsText);
  } catch {
    return [];
  }
  const questions = asArray(asObject(parsed)?.questions) ?? [];
  const out: CodexSyncQuestion[] = [];
  for (const raw of questions) {
    const o = asObject(raw);
    if (!o) continue;
    const options = (asArray(o.options) ?? []).flatMap((option) => {
      if (typeof option === 'string') return [{ label: option, detail: null }];
      const fields = asObject(option);
      const label = fields ? asString(fields.label) : null;
      return label === null ? [] : [{ label, detail: asString(fields?.description) }];
    });
    out.push({
      id: asString(o.id),
      header: asString(o.header),
      text: asString(o.question) ?? '',
      options,
    });
  }
  return out;
}

function decodeQuestionCall(line: ChatLine, context: DecodeContext): CodexLineOutcome {
  if (isTruncatedLine(line)) return OVERSIZED;
  const parsed = response(line);
  if (!parsed) return INVALID;
  if (parsed.callID === null) return ACCEPTED;
  const questions = syncQuestions(parsed.arguments);
  return withRecord(
    context.dialect === 'legacy'
      ? {
          type: 'toolCall',
          call: { callID: parsed.callID, role: { type: 'question', questions } },
        }
      : {
          type: 'questionCall',
          call: { callID: parsed.callID, turnID: parsed.turnID, questions },
        },
  );
}

function mayHoldAnswers(data: Uint8Array): boolean {
  return includesBytes(data, 'answers') || includesBytes(data, CANCELLED_QUESTION_OUTPUT);
}

/** `{"answers": {"<id>": {"answers": [...]}}}` as answers by question id, newline-joined. */
function answerObject(text: string): Record<string, string> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const answers = asObject(asObject(parsed)?.answers);
  if (!answers) return null;
  const out: Record<string, string> = {};
  for (const [id, raw] of Object.entries(answers)) {
    const list = asObject(raw);
    if (!list) continue;
    const strings = (asArray(list.answers) ?? []).filter((v): v is string => typeof v === 'string');
    if (strings.length > 0) out[id] = strings.join('\n');
  }
  return out;
}

/**
 * A tool output. A paginated rollout needs only question answers from outputs, so one without the
 * word `answers` (or the cancellation text) is never decoded: it still resolves its call by id.
 */
function decodeOutput(
  line: ChatLine,
  classification: CodexLineClassification,
  context: DecodeContext,
): CodexLineOutcome {
  const decodes =
    !isTruncatedLine(line) &&
    line.length <= context.outputDecodeLimit &&
    (context.dialect === 'legacy' || mayHoldAnswers(line.data));
  if (!decodes) {
    const callID = classification.callID ?? reclassified(line)?.callID ?? null;
    if (callID === null) return isTruncatedLine(line) ? OVERSIZED : shapeChecked(line);
    if (!isTruncatedLine(line) && !isCompleteObject(line.data)) return INVALID;
    return withRecord({ type: 'callOutput', output: callOutput(callID, reference(line)) });
  }
  const parsed = response(line);
  if (!parsed) return INVALID;
  if (parsed.callID === null) return ACCEPTED;
  const text = parsed.output?.text ?? '';
  const output: CodexCallOutput = callOutput(parsed.callID, reference(line));
  const answers = text.startsWith('{') ? answerObject(text) : null;
  if (answers) output.answers = answers;
  else if (text.trim() === CANCELLED_QUESTION_OUTPUT) output.isCancelled = true;
  if (context.dialect === 'legacy') {
    const legacy = summary.legacyOutput(text);
    output.exitCode = legacy.exitCode;
    output.preview = summary.preview(legacy.body, parsed.output?.imageCount ?? 0);
  }
  return withRecord({ type: 'callOutput', output });
}

function decodeCall(
  type: string,
  line: ChatLine,
  classification: CodexLineClassification,
  context: DecodeContext,
): CodexLineOutcome {
  const fallbackName = type === 'local_shell_call' ? 'local_shell' : 'tool';
  if (isTruncatedLine(line)) {
    // `call_id` precedes the large field in custom and local shell calls, not in function calls.
    const callID = classification.callID;
    if (callID === null) return OVERSIZED;
    const name = classification.name ?? fallbackName;
    const row = snapshot({ kind: 'other', name, title: name, callID, output: reference(line) });
    return withRecord({
      type: 'toolCall',
      call: { callID, role: { type: 'tool', snapshot: row } },
    });
  }
  const parsed = response(line);
  if (!parsed) return INVALID;
  const callID = parsed.callID;
  if (callID === null) return ACCEPTED;
  if (parsed.name === 'request_user_input_async') {
    return withRecord({ type: 'toolCall', call: { callID, role: { type: 'asyncQuestions' } } });
  }
  const row = legacyCallSnapshot(type, parsed, callID, line, context);
  return withRecord({ type: 'toolCall', call: { callID, role: { type: 'tool', snapshot: row } } });
}

interface CallArguments {
  command: string[] | null;
  cmd: string | null;
  input: string | null;
  path: string | null;
}

function callArguments(text: string | null): CallArguments | null {
  if (text === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const o = asObject(parsed);
  if (!o) return null;
  return {
    command:
      (asArray(o.command) ?? null)?.filter((v): v is string => typeof v === 'string') ?? null,
    cmd: asString(o.cmd),
    input: asString(o.input),
    path: asString(o.path),
  };
}

/** A legacy call's row before its output arrives. */
function legacyCallSnapshot(
  type: string,
  parsed: RawResponse,
  callID: string,
  line: ChatLine,
  context: DecodeContext,
): CodexToolSnapshot {
  const name = parsed.name ?? (type === 'local_shell_call' ? 'local_shell' : 'tool');
  const row = snapshot({ kind: 'other', name, title: name, callID, output: reference(line) });
  if (type === 'local_shell_call') {
    row.kind = 'command';
    row.title = summary.commandTitle(parsed.command ?? []);
    return row;
  }
  const args = callArguments(parsed.arguments ?? parsed.input);
  switch (name) {
    case 'shell':
    case 'container.exec':
    case 'local_shell':
      row.kind = 'command';
      row.title = summary.commandTitle(args?.command ?? []);
      break;
    case 'exec_command':
      row.kind = 'command';
      row.title = args?.cmd ?? name;
      break;
    case 'apply_patch': {
      const patch = type === 'custom_tool_call' ? parsed.input : (args?.input ?? null);
      const result = patch === null ? null : summary.patchSummary(patch, context.cwd);
      if (result) {
        row.kind = result.kind;
        row.title = result.title;
        row.diff = result.diff;
      } else {
        row.kind = 'fileEdit';
      }
      break;
    }
    case 'update_plan':
      row.kind = 'todo';
      row.title = 'Update plan';
      break;
    case 'view_image':
      row.kind = 'image';
      row.title = args?.path ? summary.relativePath(fileURLPath(args.path), context.cwd) : name;
      row.imagePath = remoteImagePath(args?.path ?? null, context.cwd);
      break;
    default:
      break;
  }
  if (row.title === '') row.title = name;
  return row;
}

export function decodeRetained(type: string, line: ChatLine): CodexLineOutcome {
  if (type !== 'verified_answer') return shapeChecked(line);
  if (isTruncatedLine(line)) return OVERSIZED;
  const payload = envelope(line)?.payload;
  if (!payload) return INVALID;
  const retained = readRetained(payload);
  if (retained.callID === null) return ACCEPTED;
  const answers = (retained.questions ?? []).flatMap((q) =>
    q.question !== null && q.answer !== null ? [{ question: q.question, answer: q.answer }] : [],
  );
  return withRecord({
    type: 'verifiedAnswer',
    answer: { turnID: retained.turnID, callID: retained.callID, answers },
  });
}

/** A hook prompt response item: every part is `<hook_prompt hook_run_id="…">text</hook_prompt>`. */
function hookPrompt(parts: { type: string | null; text: string | null }[]): string | null {
  const fragments: string[] = [];
  for (const part of parts) {
    if (part.type !== 'input_text' || part.text === null) return null;
    const trimmed = part.text.trim();
    if (
      !trimmed.startsWith('<hook_prompt') ||
      !trimmed.endsWith('</hook_prompt>') ||
      !trimmed.includes('hook_run_id=')
    ) {
      return null;
    }
    const open = trimmed.indexOf('>');
    const body = trimmed.slice(open + 1, trimmed.length - '</hook_prompt>'.length);
    fragments.push(xmlUnescaped(body));
  }
  return fragments.length === 0 ? null : fragments.join('\n\n');
}

function xmlUnescaped(text: string): string {
  return text
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');
}
