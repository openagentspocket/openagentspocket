import { describe, expect, it } from 'vitest';
import {
  attachChannelFailure,
  attachExecCommand,
  DEFAULT_AGENT_ATTACH_COMMAND,
  DEFAULT_TERMINAL_ATTACH_COMMAND,
  isBareHerdrCommand,
} from './attach-command';
import { ATTACH_MARKER_PRINTF_FORMAT } from './handshake';
import { agentPaneTarget, terminalTarget } from './types';

const commands = {
  agentAttachCommand: DEFAULT_AGENT_ATTACH_COMMAND,
  terminalAttachCommand: DEFAULT_TERMINAL_ATTACH_COMMAND,
};
const SOCKET = '/run/herdr/herdr.sock';
const request = (target = agentPaneTarget('pane-1'), takeover = false) => ({
  target,
  takeover,
  cols: 80,
  rows: 24,
});

describe('attachExecCommand', () => {
  it('prints the handshake marker right before exec of attach, with the socket as an argument', () => {
    const command = attachExecCommand({ commands, request: request(), socketPath: SOCKET });
    expect(command).toContain(
      `printf "${ATTACH_MARKER_PRINTF_FORMAT}"; exec herdr agent attach "$1"`,
    );
    expect(command).toContain(`attach 'pane-1' '${SOCKET}'`);
    expect(command).not.toContain('--takeover');
  });

  it('carries takeover and selects terminal attach for a terminal target', () => {
    const command = attachExecCommand({
      commands,
      request: request(terminalTarget('t-9'), true),
      socketPath: SOCKET,
    });
    expect(command).toContain('exec herdr terminal attach "$1" --takeover');
  });

  it('rides an injectable command through unchanged', () => {
    const command = attachExecCommand({
      commands: { ...commands, agentAttachCommand: '/opt/fixture/attach' },
      request: request(),
      socketPath: SOCKET,
    });
    expect(command).toContain('exec /opt/fixture/attach "$1"');
  });

  it('refuses unquotable targets and socket paths', () => {
    for (const id of ["a'b", 'a\\b', 'a\nb', '']) {
      expect(() =>
        attachExecCommand({ commands, request: request(agentPaneTarget(id)), socketPath: SOCKET }),
      ).toThrow();
    }
    expect(() =>
      attachExecCommand({ commands, request: request(), socketPath: "/run/it's/herdr.sock" }),
    ).toThrow();
    expect(() =>
      attachExecCommand({ commands, request: request(), socketPath: 'relative' }),
    ).toThrow();
  });

  it('runs an endpoint launcher with no PATH export and keeps the validation', () => {
    const endpoint = { socketPath: SOCKET, executablePath: '/opt/herdr/launch' };
    const command = attachExecCommand({
      commands,
      request: request(terminalTarget('t-1'), true),
      socketPath: SOCKET,
      endpoint,
    });
    expect(command).toContain('exec "$3" terminal attach "$1" --takeover');
    expect(command).toContain("'/opt/herdr/launch'");
    expect(command).not.toContain('export PATH');
    expect(() =>
      attachExecCommand({
        commands,
        request: request(agentPaneTarget("x'y")),
        socketPath: SOCKET,
        endpoint,
      }),
    ).toThrow();
  });
});

describe('attachChannelFailure', () => {
  const base = { attachCommand: DEFAULT_AGENT_ATTACH_COMMAND };
  it('maps exit 127 on a bare herdr to a missing binary', () => {
    expect(attachChannelFailure({ ...base, exitStatus: 127 })).toEqual({
      kind: 'herdrBinaryNotFound',
    });
  });
  it('keeps 127 as an attach exit for injectable or absolute commands', () => {
    for (const attachCommand of ['/opt/x/attach', '/nonexistent/herdr agent attach']) {
      expect(attachChannelFailure({ attachCommand, exitStatus: 127 }).kind).toBe('attachExited');
    }
  });
  it('quotes herdr output on other exits', () => {
    expect(attachChannelFailure({ ...base, exitStatus: 2, output: 'herdr: boom' })).toEqual({
      kind: 'attachExited',
      status: 2,
      output: 'herdr: boom',
    });
  });
  it('maps 126 and 127 to a missing launcher for an endpoint', () => {
    const endpoint = { socketPath: SOCKET, executablePath: '/opt/herdr/launch' };
    for (const exitStatus of [126, 127]) {
      expect(attachChannelFailure({ ...base, exitStatus, endpoint })).toEqual({
        kind: 'herdrLauncherNotFound',
        path: '/opt/herdr/launch',
      });
    }
  });
  it('recognizes a bare herdr behind environment assignments only', () => {
    expect(isBareHerdrCommand('HERDR_X=1 herdr agent attach')).toBe(true);
    expect(isBareHerdrCommand('ENV=herdr other')).toBe(false);
    expect(isBareHerdrCommand("'herdr: not json'")).toBe(false);
  });
});
