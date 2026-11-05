// An assistant message on the branch (Swift PiTranscriptReducer, `message` role `assistant`): its
// text, thinking and tool calls, and how its stop reason ends the turn.

import { notice } from '../model/factories';
import { asObject, asString, type JsonObject } from '../model/reducer';
import type { PiBuilder } from './builder';
import { patchPaths } from './file-changes';
import type { PiRecord } from './record';
import {
  blocks,
  deviceArguments,
  deviceOf,
  LOCAL_SCHEME,
  OMP_SILENT_ABORT,
  PI_ABORT,
  PLAN_DEVICE,
  PLAN_READY,
  toolRow,
} from './tools';

export function assistantRow(
  b: PiBuilder,
  record: PiRecord,
  message: JsonObject,
  position: number,
  chain: readonly PiRecord[],
): void {
  const planProposed = b.lastToolResultText === PLAN_READY;
  b.lastToolResultText = null;
  blocks(message.content).forEach((raw, index) => {
    const block = asObject(raw);
    switch (asString(block?.type)) {
      case 'text': {
        const text = asString(block?.text);
        if (text) b.add(record, { type: 'assistant', value: { text } }, `:${index}`);
        break;
      }
      case 'thinking': {
        const text = asString(block?.thinking);
        if (text) {
          b.add(
            record,
            { type: 'reasoning', value: { text, durationMilliseconds: null } },
            `:${index}`,
          );
        }
        break;
      }
      case 'toolCall':
        toolCall(b, record, block as JsonObject);
        break;
      default:
        break;
    }
  });
  const stopReason = asString(message.stopReason);
  const errorMessage = asString(message.errorMessage);
  b.lastStopReason = stopReason;
  b.toolResultWrittenAt = null;
  const interrupted = () => {
    b.add(record, { type: 'notice', value: notice('interrupted', 'Interrupted') }, ':end');
    b.finish('interrupted', record);
  };
  switch (stopReason) {
    case 'stop':
    case 'length':
      b.finish('completed', record);
      break;
    case 'aborted':
      if (errorMessage === OMP_SILENT_ABORT) {
        // Oh My Pi ends a turn this way when it hands over to its own screen, such as a plan to review.
        if (planProposed) {
          b.add(
            record,
            { type: 'notice', value: notice('system', 'Plan ready for review') },
            ':end',
          );
        }
        b.finish('completed', record);
      } else {
        interrupted();
      }
      break;
    case 'error':
      if (errorMessage === PI_ABORT) {
        // Pi records Esc during a tool as an error.
        interrupted();
        break;
      }
      b.add(
        record,
        { type: 'notice', value: notice('error', 'Agent error', { detail: errorMessage }) },
        ':end',
      );
      {
        // Pi retries a provider error on its own and records the retry as the error's reply.
        // Until that is written, an Agent still working is retrying.
        const next = chain
          .slice(position + 1)
          .find((candidate) => candidate.type === 'message' || candidate.type === 'custom_message');
        const nextRole = asString(asObject(next?.value.message)?.role);
        if (nextRole === 'assistant' || (!next && b.context.activity === 'working')) {
          b.lastStopReason = null;
        } else {
          b.finish('failed', record);
        }
      }
      break;
    default:
      break;
  }
}

function toolCall(b: PiBuilder, record: PiRecord, block: JsonObject): void {
  const callID = asString(block.id);
  const name = asString(block.name);
  if (callID === null || name === null) return;
  const args = asObject(block.arguments);
  const path = asString(args?.path);
  const device = deviceOf(name, path);
  // Oh My Pi hands a plan to its review screen as a write to `xd://propose`, which changes no
  // file; the notice its turn ends with says so.
  if (device === PLAN_DEVICE) {
    b.hiddenCalls.add(callID);
    return;
  }
  // Any other device is a tool Oh My Pi drives by a write to `xd://<tool>`, its arguments as
  // JSON in `content`: a row for that tool, not a file.
  const tool =
    device !== null
      ? toolRow(device, deviceArguments(block.arguments), callID, b.context.activity, b.directory)
      : toolRow(name, block.arguments, callID, b.context.activity, b.directory);
  b.calls.set(callID, b.transcript.entries.length);
  if (device === null && path !== null) b.callPaths.set(callID, path);
  else b.callPaths.delete(callID);
  const input = asString(args?.input);
  if (device === null && path === null && input !== null) {
    const local = patchPaths(input).filter((candidate) => candidate.startsWith(LOCAL_SCHEME));
    if (local.length > 0) b.localPatchPaths.set(callID, local);
  }
  const written = asString(args?.content);
  if (device === null && name.toLowerCase() === 'write' && written !== null) {
    b.writes.set(callID, { content: written, offset: record.offset, length: record.length });
  }
  b.transcript.entries.push({
    id: `pi:tool:${callID}`,
    sourceOffset: record.offset,
    content: { type: 'tool', value: tool },
  });
}
