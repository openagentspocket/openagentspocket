import type { TransportError } from '../errors/transport-error';
import { TransportFailure } from '../errors/transport-error';
import type { HerdrEndpoint } from '../hosts/herdr-endpoint';
import { HERDR_PATH_EXPORT, quotedAbsolutePath } from '../hosts/host-path';
import { ATTACH_MARKER_PRINTF_FORMAT } from './handshake';
import type { TerminalAttachRequest, TerminalAttachTarget } from './types';

export const DEFAULT_AGENT_ATTACH_COMMAND = 'herdr agent attach';
export const DEFAULT_TERMINAL_ATTACH_COMMAND = 'herdr terminal attach';

const channelFailed = (detail: string) => new TransportFailure({ kind: 'channelFailed', detail });

/** True when `command` invokes an unpathed `herdr`; leading `NAME=value` words are skipped. */
export function isBareHerdrCommand(command: string): boolean {
  const word = command
    .trim()
    .split(/\s+/)
    .find((candidate) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(candidate));
  return word === 'herdr';
}

export interface AttachCommands {
  readonly agentAttachCommand: string;
  readonly terminalAttachCommand: string;
}

export function attachCommandFor(commands: AttachCommands, target: TerminalAttachTarget): string {
  return target.kind === 'agentPane' ? commands.agentAttachCommand : commands.terminalAttachCommand;
}

function hasUnquotable(text: string): boolean {
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (char === "'" || char === '\\' || code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * The remote exec request used once the PTY is accepted. `HERDR_SOCKET_PATH` is set by the
 * command itself, not an SSH environment request the Host may reject. The handshake marker is
 * printed immediately before `exec` of attach so the bootstrap gate can drop earlier chatter.
 * A paired endpoint's launcher replaces both injectable commands and carries no PATH export;
 * target and socket validation are the same. (Swift `attachExecCommand`.)
 */
export function attachExecCommand(options: {
  commands: AttachCommands;
  request: TerminalAttachRequest;
  socketPath: string;
  endpoint?: HerdrEndpoint | null;
}): string {
  const { commands, request, socketPath, endpoint } = options;
  const attachCommand = attachCommandFor(commands, request.target);
  const target = request.target.id;
  if (attachCommand === '' || target === '' || hasUnquotable(target)) {
    throw channelFailed('attach target cannot be quoted for the remote command');
  }
  const quotedSocket = quotedAbsolutePath(socketPath);
  if (!quotedSocket) throw channelFailed('The remote socket path cannot be quoted safely.');
  const takeover = request.takeover ? ' --takeover' : '';
  if (endpoint) {
    const launcher = quotedAbsolutePath(endpoint.executablePath);
    if (!launcher) throw channelFailed('The herdr launcher path cannot be quoted safely.');
    const subcommand = request.target.kind === 'agentPane' ? 'agent attach' : 'terminal attach';
    return (
      `/bin/sh -c 'export HERDR_SOCKET_PATH="$2"; printf "${ATTACH_MARKER_PRINTF_FORMAT}"; ` +
      `exec "$3" ${subcommand} "$1"${takeover}' attach '${target}' ${quotedSocket} ${launcher}`
    );
  }
  return (
    `/bin/sh -c '${HERDR_PATH_EXPORT}; export HERDR_SOCKET_PATH="$2"; ` +
    `printf "${ATTACH_MARKER_PRINTF_FORMAT}"; exec ${attachCommand} "$1"${takeover}' attach ` +
    `'${target}' ${quotedSocket}`
  );
}

/**
 * Maps a remote attach exit onto the taxonomy. Exit 127 is `herdrBinaryNotFound` only while the
 * exec'd command is still a bare `herdr`; with an endpoint launcher, 126 or 127 is
 * `herdrLauncherNotFound`. Anything else is `attachExited` with herdr's last line.
 */
export function attachChannelFailure(options: {
  exitStatus: number;
  output?: string | null;
  attachCommand: string;
  endpoint?: HerdrEndpoint | null;
}): TransportError {
  const { exitStatus, output, attachCommand, endpoint } = options;
  if (endpoint) {
    if (exitStatus === 126 || exitStatus === 127) {
      return { kind: 'herdrLauncherNotFound', path: endpoint.executablePath };
    }
  } else if (exitStatus === 127 && isBareHerdrCommand(attachCommand)) {
    return { kind: 'herdrBinaryNotFound' };
  }
  return output
    ? { kind: 'attachExited', status: exitStatus, output }
    : { kind: 'attachExited', status: exitStatus };
}
