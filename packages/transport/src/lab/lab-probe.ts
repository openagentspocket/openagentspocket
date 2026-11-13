// What the agent lab checks on one running Agent, with the app's own code and the app's own Host
// commands: herdr's Agent record, the screen read the Blocked card reads (dialog, plan of each
// option, never sent), the pre-send input box check, the mode and the shortcuts, and Chat's read
// of the conversation. Every raw input is written beside the report, so a capture can become a
// fixture. Node only; never part of the app.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BlockedCardStore,
  type ChatHostFiles,
  type ChatStore,
  type ChatTranscript,
  chatCommands,
  createSendRules,
  decodeAnsiScreen,
  decodeUtf8,
  detectInputBox,
  encodeUtf8,
  frameLines,
  holdReason,
  parseBlockedDialog,
  planDialogAction,
  programDefinition,
  projectionContext,
  readProgramMode,
  renderText,
  resolveConversation,
  type StoreQuery,
  sendPolicyFor,
  storeQueryRunner,
} from '@openagentspocket/core';
import { herdrScreenIO } from '../blocked/screen-io';
import { systemClock } from '../clock';
import { runBoundedScript } from '../host/bounded-script';
import { SessionHostFiles } from '../host/remote-files';
import type { SshTransport } from '../transport';

type Program = 'opencode' | 'codex';
type Json = Record<string, unknown>;

/** Chat's file port as the app builds it (apps/mobile TransportChatFiles), recording each script's output. */
function labChatFiles(transport: SshTransport, out: string): ChatHostFiles {
  const files = new SessionHostFiles(transport);
  let runs = 0;
  const runScript = async (script: Uint8Array) => {
    const result = await runBoundedScript(transport, decodeUtf8(script), {
      feature: 'Chat',
      deadlineMs: 10_000,
      remoteSeconds: 8,
      timeoutMarkerPrefix: '__AGENTICO_OC_TIMEOUT_',
      timedOut: { kind: 'hostFileTimedOut' },
    });
    runs += 1;
    writeFileSync(join(out, `store-${runs}.out`), result.stdout);
    return {
      stdout: encodeUtf8(result.stdout),
      stderr: encodeUtf8(result.stderr),
      exitStatus: result.exitCode,
    };
  };
  return {
    home: () => files.home(),
    status: (path) => files.status(path),
    list: (request) => files.list(request),
    read: (range) => files.read(range),
    queryStore: (store: ChatStore, query: StoreQuery) => storeQueryRunner(runScript)(store, query),
  };
}

function entrySummary(transcript: ChatTranscript): Json[] {
  return transcript.entries.map(({ content }) => {
    const value = content.value as unknown as Json;
    const text = [value.text, value.title, value.summary, value.command, value.name].find(
      (candidate) => typeof candidate === 'string',
    ) as string | undefined;
    return { type: content.type, text: text?.slice(0, 160) ?? null };
  });
}

async function readChat(transport: SshTransport, program: Program, session: unknown, out: string) {
  const definition = programDefinition(program);
  const resolution = resolveConversation(session as Parameters<typeof resolveConversation>[0]);
  if (resolution.type === 'noSession')
    return { found: false, why: renderText(definition.noSessionMessage()) };
  if (resolution.type !== 'bound' || resolution.reference.program !== program) {
    return { found: false, resolution };
  }
  const { sessionID } = resolution.reference;
  const adapter = definition.adapter();
  if (!adapter) return { found: false, why: 'no adapter in this build' };
  const files = labChatFiles(transport, out);
  const source = adapter.makeRecordSource?.(sessionID);
  if (!source) {
    const location = await definition.locate({
      reference: resolution.reference,
      files,
      now: () => Date.now(),
      directories: [],
      relocatedDirectory: null,
      lostAMessage: false,
      awaitingFirstMessage: false,
      activity: 'idle',
      newConversationActivity: null,
      accountDirectories: [],
    } as never);
    if (location.type !== 'found') return { found: false, location };
    // The lab's Host is this machine: the located file is read from disk, as SFTP would return it.
    const { path } = location;
    const bytes = new Uint8Array(readFileSync(path));
    writeFileSync(join(out, 'rollout.jsonl'), bytes);
    const framed = frameLines(bytes);
    const fileReducer = adapter.makeReducer({ path, firstLine: framed[0] ?? null } as never);
    fileReducer.append(framed);
    const read = fileReducer.transcript(projectionContext({ activity: 'idle' }));
    return {
      found: true,
      path,
      lines: framed.length,
      entries: entrySummary(read),
      pendingRequests: read.pendingRequests.length,
      unsupportedFormat: fileReducer.unsupportedFormat ?? null,
    };
  }
  const lines = await source.open(files);
  const reducer = adapter.makeReducer({ path: '', firstLine: null } as never);
  reducer.append(lines ?? []);
  const transcript = reducer.transcript(projectionContext({ activity: 'idle' }));
  return {
    found: true,
    sessionID,
    lines: lines?.length ?? 0,
    entries: entrySummary(transcript),
    pendingRequests: transcript.pendingRequests.length,
    unsupportedFormat: reducer.unsupportedFormat ?? null,
  };
}

function readScreen(program: Program, ansi: string): Json {
  const screen = decodeAnsiScreen(ansi);
  const text = screen.rows.map((row) => row.text).join('\n');
  const definition = programDefinition(program);
  const parsed = parseBlockedDialog(screen, program);
  const policy = sendPolicyFor(program);
  const box = detectInputBox(screen, policy);
  const dialog =
    parsed.kind === 'dialog'
      ? {
          kind: parsed.dialog.kind,
          title: parsed.dialog.title,
          body: parsed.dialog.body,
          options: parsed.dialog.options.map((option, index) => {
            const plan = planDialogAction(parsed.dialog, { kind: 'choose', ordinal: index + 1 });
            return { option, plan: plan.ok ? plan.plan : plan.error };
          }),
          subject: parsed.dialog.subject,
          focus: parsed.dialog.focus,
          note: parsed.dialog.note,
        }
      : parsed.kind === 'unrecognized'
        ? { unrecognized: parsed.excerpt.rows.map((row) => row.text) }
        : null;
  const modes = definition.modes?.();
  const mode = modes ? readProgramMode(modes, text) : null;
  return {
    dialog,
    inputBox: box,
    sendHold: box.kind === 'empty' ? null : holdReason(box, policy),
    mode: mode && renderText(mode),
    shortcuts: definition.shortcuts?.() ?? [],
    bottomRows: text
      .split('\n')
      .filter((row) => row.trim() !== '')
      .slice(-8),
  };
}

export interface LabAction {
  /** A Chat message: the send rules and the input box gate decide, then `agent.prompt` as the Composer sends. */
  send?: string;
  /** herdr key names sent with `agent.send_keys`, as a shortcut or a Blocked card would. */
  keys?: string[];
  /**
   * Taps this option (1-based) on the Blocked card, through the card itself. Phase 1 and 2 of the
   * lab never approve: only a decline or cancel option, or an answer to a question, is tapped.
   */
  answer?: number;
  /** Chat's Stop: the program's screen guard decides, then its Stop keys go. */
  stop?: boolean;
}

async function stopAgent(transport: SshTransport, program: Program, pane: string) {
  const { stop } = sendPolicyFor(program);
  const agents = await transport.listAgents();
  const activity = (agents.find((agent) => agent.pane_id === pane)?.agent_status ??
    'unknown') as never;
  const read = await transport.readAgent({
    target: pane,
    source: 'visible',
    format: 'ansi',
    strip_ansi: false,
  });
  const verdict = stop.screenGuard?.({ screen: decodeAnsiScreen(read.text), activity }) ?? {
    kind: 'press',
  };
  if (verdict.kind === 'press')
    await transport.sendAgentKeys({ target: pane, keys: [...stop.keys] });
  return { stop: verdict, keys: stop.keys, activity };
}

/** The roles a lab run may tap; every approve role is missing on purpose. */
const TAPPABLE = new Set(['decline', 'cancel']);
const QUESTION_KINDS = new Set(['openCodeQuestion', 'codexQuestion', 'codexAsyncQuestion']);

async function answerCard(
  transport: SshTransport,
  program: Program,
  pane: string,
  ordinal: number,
) {
  const card = new BlockedCardStore({
    program,
    io: herdrScreenIO(pane, (operation) => operation(transport)),
    clock: systemClock,
  });
  card.setActivity('blocked');
  await card.refresh();
  const { content } = card.getState();
  if (content.kind !== 'card') return { answered: false, content: content.kind };
  const option = content.dialog.options[ordinal - 1];
  const answersQuestion = option?.role === 'answer' && QUESTION_KINDS.has(content.dialog.kind);
  if (!option || !(TAPPABLE.has(option.role) || answersQuestion)) {
    return {
      answered: false,
      refused: 'the lab taps only Deny, Reject, Cancel or a question answer',
      option,
    };
  }
  await card.perform({ kind: 'choose', ordinal });
  const state = card.getState();
  card.end();
  return {
    answered: true,
    option,
    progress: state.progress,
    notice: state.notice && renderText(state.notice),
  };
}

/** Performs one Chat action on a lab Agent the way the app would, and says what it decided. */
export async function actOnAgent(
  transport: SshTransport,
  program: Program,
  pane: string,
  action: LabAction,
): Promise<Json> {
  if (action.answer !== undefined) return answerCard(transport, program, pane, action.answer);
  if (action.stop) return stopAgent(transport, program, pane);
  if (action.keys?.length) {
    await transport.sendAgentKeys({ target: pane, keys: action.keys });
    return { keys: action.keys, sent: true };
  }
  if (action.send === undefined) return {};
  const policy = sendPolicyFor(program);
  const agents = await transport.listAgents();
  const idle = agents.find((agent) => agent.pane_id === pane)?.agent_status === 'idle';
  const rules = createSendRules(policy, chatCommands([], idle, policy));
  const refusal = rules.validate(action.send);
  const read = await transport.readAgent({
    target: pane,
    source: 'visible',
    format: 'ansi',
    strip_ansi: false,
  });
  const box = detectInputBox(decodeAnsiScreen(read.text), policy);
  const verdict = { send: action.send, refusal: refusal ?? null, inputBox: box };
  if (refusal || box.kind !== 'empty') return { ...verdict, sent: false };
  await transport.promptAgent({ target: pane, text: rules.outgoingText(action.send) });
  return { ...verdict, sent: true, outgoing: rules.outgoingText(action.send) };
}

/** Probes one lab Agent and writes `<out>/screen.ansi`, `store-N.out` and `report.json`. */
export async function probeAgent(
  transport: SshTransport,
  program: Program,
  name: string,
  out: string,
): Promise<Json> {
  const agents = await transport.listAgents();
  const info = agents.find((agent) => agent.name === name) ?? null;
  const read = await transport.readAgent({
    target: name,
    source: 'visible',
    format: 'ansi',
    strip_ansi: false,
  });
  writeFileSync(join(out, 'screen.ansi'), read.text);

  let chat: unknown;
  try {
    chat = await readChat(transport, program, info?.agent_session ?? null, out);
  } catch (error) {
    chat = { found: false, error: String((error as Error)?.message ?? error), detail: error };
  }
  const report = { program, herdr: info, screen: readScreen(program, read.text), chat };
  writeFileSync(join(out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
