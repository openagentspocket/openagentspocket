// Codex's code mode in a paginated rollout: a `custom_tool_call` named `exec` whose script calls
// Codex's own tools (`tools.apply_patch("...")`, `tools.exec_command({cmd: "..."})`), and the
// `custom_tool_call_output` that ends it. Codex 0.167 runs every shell command this way; a command
// that runs also gets a CommandExecution item, one that waits for approval or is declined does not.

import { type ChatLine, isTruncatedLine } from '../model/lines';
import { type DecodeContext, envelope, reference } from './decoder-common';
import { includesBytes } from './json-bytes';
import { type RawResponse, readResponse } from './raw-response';
import { type CodexLineOutcome, callOutput, snapshot, withRecord } from './record';
import * as summary from './tool-summary';

const PATCH_CALL = 'tools.apply_patch(';
const COMMAND_CALL = 'tools.exec_command(';
const ABORTED_BY_USER = 'aborted by user';
const SCRIPT = 'Script ';
const SCRIPT_COMPLETED = 'Script completed';
const SCRIPT_RUNNING = 'Script running';
const OUTPUT_HEADER = 'Output:\n';

function response(line: ChatLine): RawResponse | null {
  const payload = envelope(line)?.payload;
  return payload ? readResponse(payload) : null;
}

/** A code-mode `exec` call, read when its script applies a patch or runs a command. */
export function decodeCodeModeCall(
  line: ChatLine,
  context: DecodeContext,
): CodexLineOutcome | null {
  if (isTruncatedLine(line)) return null;
  const isPatch = includesBytes(line.data, PATCH_CALL);
  if (!isPatch && !includesBytes(line.data, COMMAND_CALL)) return null;
  const parsed = response(line);
  if (!parsed || parsed.callID === null || parsed.input === null) return null;
  const callID = parsed.callID;
  const call = (row: ReturnType<typeof snapshot>, commands: string[] | null) =>
    withRecord({
      type: 'codeModeCall',
      call: { callID, turnID: parsed.turnID, snapshot: row, commands },
    });
  const patches = isPatch ? summary.codeModePatches(parsed.input, PATCH_CALL) : [];
  const patch = patches.length > 0 ? summary.patchSummary(patches.join('\n'), context.cwd) : null;
  if (patch) {
    // Only a declined or stopped call shows this row: nothing was applied, so no output or counts.
    const row = snapshot({ kind: patch.kind, name: 'apply_patch', title: patch.title, callID });
    return call({ ...row, output: reference(line) }, null);
  }
  const commands = summary.codeModeCommands(parsed.input, COMMAND_CALL);
  if (commands.length === 0) return null;
  // The command lines as Codex's approval card shows them, one per line when the script runs several.
  const row = snapshot({
    kind: 'command',
    name: 'exec_command',
    title: commands.join('\n'),
    callID,
  });
  return call({ ...row, output: reference(line) }, commands);
}

interface CommandResult {
  exitCode: number | null;
  output: string | null;
  /** The command still runs after the script yielded: a session id, no exit code yet. */
  isRunning: boolean;
}

/** A JSON chunk an `exec_command` result prints: `{exit_code, output}`, or a settled promise of it. */
function commandResult(chunk: string): CommandResult | null {
  if (!chunk.startsWith('{')) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(chunk);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const value = (
    typeof record.value === 'object' && record.value !== null ? record.value : record
  ) as Record<string, unknown>;
  const exitCode = typeof value.exit_code === 'number' ? value.exit_code : null;
  const output = typeof value.output === 'string' ? value.output : null;
  const isRunning = exitCode === null && value.session_id !== undefined;
  return exitCode === null && output === null ? null : { exitCode, output, isRunning };
}

/**
 * What a finished script printed: the commands' outputs, the first failing exit code (or 0), and
 * whether a command still runs after the script returned.
 */
function scriptResult(body: string): { exitCode: number | null; text: string; isRunning: boolean } {
  const outputs: string[] = [];
  const codes: number[] = [];
  const plain: string[] = [];
  let isRunning = false;
  for (const chunk of body.split('\n')) {
    const result = commandResult(chunk.trim());
    if (result) {
      isRunning ||= result.isRunning;
      if (result.exitCode !== null) codes.push(result.exitCode);
      if (result.output !== null && result.output !== '') outputs.push(result.output);
      continue;
    }
    const printed = /^exit_code=(-?\d+)$/.exec(chunk.trim());
    if (printed) codes.push(Number.parseInt(printed[1] as string, 10));
    else plain.push(chunk);
  }
  const exitCode = codes.find((code) => code !== 0) ?? codes[0] ?? null;
  const text = [...outputs, plain.join('\n').trim()].filter((t) => t !== '').join('\n');
  return { exitCode, text, isRunning };
}

/**
 * A code-mode output: aborted by the user (declined on Codex's card, or stopped), or a finished
 * script with its commands' exit code and output. A script still running has no outcome yet.
 */
export function decodeCodeModeOutput(
  line: ChatLine,
  context: DecodeContext,
): CodexLineOutcome | null {
  if (isTruncatedLine(line) || line.length > context.outputDecodeLimit) return null;
  const aborted = includesBytes(line.data, ABORTED_BY_USER);
  if (!aborted && !includesBytes(line.data, SCRIPT)) return null;
  const parsed = response(line);
  if (!parsed || parsed.callID === null) return null;
  const text = parsed.output?.text ?? '';
  const ref = reference(line);
  if (text.startsWith(ABORTED_BY_USER)) {
    return withRecord({
      type: 'callOutput',
      output: callOutput(parsed.callID, ref, { isAbortedByUser: true }),
    });
  }
  if (!text.startsWith(SCRIPT) || text.startsWith(SCRIPT_RUNNING)) return null;
  const header = text.indexOf(OUTPUT_HEADER);
  const result = scriptResult(header < 0 ? '' : text.slice(header + OUTPUT_HEADER.length));
  if (result.isRunning) return null;
  const failed = !text.startsWith(SCRIPT_COMPLETED) || (result.exitCode ?? 0) !== 0;
  return withRecord({
    type: 'callOutput',
    output: callOutput(parsed.callID, ref, {
      scriptStatus: failed ? 'failed' : 'succeeded',
      exitCode: result.exitCode,
      preview: summary.preview(result.text, parsed.output?.imageCount ?? 0),
    }),
  });
}
