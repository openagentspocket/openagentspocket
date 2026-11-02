import {
  type FakeClock,
  HerdrApiError,
  type JsonObject,
  TransportFailure,
} from '@openagentspocket/core';
import { SshError, utf8Decode, utf8Encode } from 'agentico-ssh';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HOME_COMMAND } from './settings';
import { connected, methodOf, paramsOf, reply, SOCKET, settingsFor, settle } from './test-helpers';

const PANE = { pane_id: 'p1', tab_id: 't1', terminal_id: 'term1', workspace_id: 'w1' };
const AGENT = {
  pane_id: 'p1',
  tab_id: 't1',
  terminal_id: 'term1',
  workspace_id: 'w1',
  agent_status: 'blocked',
  name: 'claude',
  focused: false,
  revision: 1,
  state_change_seq: 4,
};

const RESULTS: Record<string, JsonObject> = {
  ping: { type: 'pong', version: '0.9.4', protocol: 19 },
  'agent.list': { type: 'agent_list', agents: [AGENT] },
  'agent.get': { type: 'agent_info', agent: AGENT },
  'agent.prompt': { type: 'agent_prompted', agent: AGENT },
  'agent.send_keys': { type: 'ok' },
  'pane.read': {
    type: 'pane_read',
    read: {
      pane_id: 'p1',
      text: 'hello',
      format: 'text',
      source: 'recent',
      revision: 1,
      tab_id: 't1',
      workspace_id: 'w1',
      truncated: false,
    },
  },
  'session.snapshot': { type: 'session_snapshot', snapshot: { protocol: 19 } },
  'tab.create': { type: 'tab_created', tab: { tab_id: 't1' }, root_pane: PANE },
  'workspace.rename': { type: 'workspace_info', workspace: { workspace_id: 'w1' } },
  'worktree.list': { type: 'worktree_list', source: {}, worktrees: [] },
};

const answer = (_socket: string, request: Uint8Array) => {
  const result = RESULTS[methodOf(request)];
  return result ? reply(request, result) : reply(request, { type: 'ok' });
};

async function kindOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'resolved';
  } catch (error) {
    return error instanceof TransportFailure
      ? error.error.kind
      : error instanceof HerdrApiError
        ? `api:${error.code}`
        : 'other';
  }
}

describe('herdr request round trips', () => {
  it('pings and reports the server protocol', async () => {
    const { transport } = await connected(answer);
    expect(await transport.ping()).toEqual({ version: '0.9.4', protocolVersion: 19 });
  });

  it('answers a request per method family on the configured socket', async () => {
    const seen: string[] = [];
    const sockets = new Set<string>();
    const { transport } = await connected((socket, request) => {
      seen.push(methodOf(request));
      sockets.add(socket);
      return answer(socket, request);
    });
    expect(await transport.listAgents()).toHaveLength(1);
    expect((await transport.agentInfo({ target: 'p1' })).pane_id).toBe('p1');
    expect((await transport.promptAgent({ target: 'p1', text: 'go' })).pane_id).toBe('p1');
    await transport.sendAgentKeys({ target: 'p1', keys: ['Enter'] });
    expect(await transport.sessionSnapshot()).toBeDefined();
    expect(
      await transport.readPane({ paneId: 'p1', source: 'recent', lines: 20, stripAnsi: true }),
    ).toMatchObject({ text: 'hello' });
    expect((await transport.createTab({ focus: false })).root_pane.pane_id).toBe('p1');
    await transport.renameWorkspace({ workspace_id: 'w1', label: 'x' });
    await transport.closePane('p1');
    expect(await transport.listWorktrees('w1')).toMatchObject({ worktrees: [] });
    expect(seen).toEqual([
      'agent.list',
      'agent.get',
      'agent.prompt',
      'agent.send_keys',
      'session.snapshot',
      'pane.read',
      'tab.create',
      'workspace.rename',
      'pane.close',
      'worktree.list',
    ]);
    expect([...sockets]).toEqual([SOCKET]);
  });

  it('sends pane reads with herdr snake_case params and no nulls', async () => {
    let params: JsonObject = {};
    const { transport } = await connected((socket, request) => {
      params = paramsOf(request);
      return answer(socket, request);
    });
    await transport.readPane({ paneId: 'p9', source: 'recent', lines: 5, stripAnsi: false });
    expect(params).toEqual({ pane_id: 'p9', source: 'recent', lines: 5, strip_ansi: false });
  });

  it('lists agents with their wire status and state sequence', async () => {
    const { transport } = await connected(answer);
    const rows = await transport.listAgents();
    expect(rows).toEqual([
      expect.objectContaining({ pane_id: 'p1', agent_status: 'blocked', state_change_seq: 4 }),
    ]);
  });

  it('surfaces herdr rejections as HerdrApiError', async () => {
    const { transport } = await connected((_s, request) => {
      const { id } = JSON.parse(utf8Decode(request)) as { id: string };
      return utf8Encode(
        `${JSON.stringify({ id, error: { code: 'pane_not_found', message: 'gone' } })}\n`,
      );
    });
    expect(await kindOf(transport.closePane('p1'))).toBe('api:pane_not_found');
  });

  it('rejects a response that answers another request', async () => {
    const { transport } = await connected(() =>
      utf8Encode('{"id":"other","result":{"type":"ok"}}\n'),
    );
    expect(await kindOf(transport.closePane('p1'))).toBe('malformedResponse');
  });

  it('refuses requests after close', async () => {
    const { transport } = await connected(answer);
    await transport.close();
    expect(await transport.isConnected()).toBe(false);
    expect(await kindOf(transport.ping())).toBe('sshUnreachable');
  });
});

describe('socket resolution and failures', () => {
  it('probes HOME once for a named session and caches it', async () => {
    let probes = 0;
    const sockets: string[] = [];
    const { transport, ssh } = await connected(
      (socket, request) => {
        sockets.push(socket);
        return answer(socket, request);
      },
      { socket: { kind: 'namedSession', name: 'work' } },
      { exec: {} },
    );
    const session = ssh.sessions[0];
    const originalExec = session?.exec.bind(session);
    if (!session || !originalExec) throw new Error('no session');
    session.exec = async (command) => {
      if (command.includes('__AGENTICO_HOME__')) probes += 1;
      return command === `LC_ALL=C ${DEFAULT_HOME_COMMAND}`
        ? { exitCode: 0, stdout: 'Last login\n__AGENTICO_HOME__=/home/dev\r\n', stderr: '' }
        : originalExec(command);
    };
    await transport.ping();
    await transport.ping();
    expect(sockets).toEqual([
      '/home/dev/.config/herdr/sessions/work/herdr.sock',
      '/home/dev/.config/herdr/sessions/work/herdr.sock',
    ]);
    expect(probes).toBe(1);
  });

  it('classifies a missing socket from test -S', async () => {
    const refuse = () => {
      throw new SshError('streamLocalOpenFailed');
    };
    const { transport, ssh } = await connected(
      refuse,
      {},
      {
        exec: {
          [`/bin/sh -c 'test -S "$1"' agentico '${SOCKET}'`]: {
            exitCode: 1,
            stdout: '',
            stderr: '',
          },
        },
      },
    );
    expect(ssh.sessions).toHaveLength(1);
    expect(await kindOf(transport.ping())).toBe('socketNotFound');
  });

  it('wakes a stopped server once and repeats the request', async () => {
    let refusals = 1;
    const woke: string[] = [];
    const exec: Record<string, { exitCode: number; stdout: string; stderr: string }> = {};
    const { transport } = await connected(
      (socket, request) => {
        if (refusals > 0 && woke.length === 0) {
          refusals -= 1;
          throw new SshError('streamLocalOpenFailed');
        }
        return answer(socket, request);
      },
      {},
      { exec },
    );
    const command = transport.wakeExecCommand(SOCKET);
    exec[`/bin/sh -c 'test -S "$1"' agentico '${SOCKET}'`] = {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };
    exec[command] = { exitCode: 0, stdout: '', stderr: '' };
    const session = transport.session;
    const run = session.exec.bind(session);
    session.exec = async (c, o) => {
      if (c === command) woke.push(c);
      return run(c, o);
    };
    expect((await transport.ping()).protocolVersion).toBe(19);
    expect(woke).toHaveLength(1);
  });

  it('keeps the original classification when the wake fails', async () => {
    const refuse = () => {
      throw new SshError('streamLocalOpenFailed');
    };
    const { transport } = await connected(refuse);
    expect(await kindOf(transport.ping())).toBe('streamLocalOpenFailed');
  });

  it('builds the wake from the endpoint launcher when the Host has one', async () => {
    const { transport } = await connected(
      answer,
      settingsFor({
        endpoint: { socketPath: SOCKET, executablePath: '/opt/herdr/bin/herdr' },
      }),
    );
    const command = transport.wakeExecCommand(SOCKET);
    expect(command).toContain("'/opt/herdr/bin/herdr'");
    expect(command).not.toContain('$PATH');
  });

  it('scopes a named session wake to its own state directory', async () => {
    const { transport } = await connected(
      answer,
      { socket: { kind: 'namedSession', name: 'work' } },
      { exec: {} },
    );
    expect(transport.wakeExecCommand(SOCKET)).toContain('HERDR_SESSION="$2"');
    expect(transport.wakeExecCommand(SOCKET).endsWith(' work')).toBe(true);
  });

  it('stops reusing a connection the module declared invalid', async () => {
    const { transport } = await connected(() => {
      throw new SshError('connectionInvalidated');
    });
    expect(await kindOf(transport.ping())).toBe('sshUnreachable');
    expect(await transport.isConnected()).toBe(false);
  });
});

describe('deadlines and admission', () => {
  it('fails a request that never answers with timedOut and frees its channel', async () => {
    const { transport, settings } = await connected(answer);
    transport.session.exchangeStreamLocal = () => new Promise(() => {});
    const pending = kindOf(transport.ping());
    await settle();
    expect(transport.admission.snapshot().ordinaryForwarding).toBe(1);
    await (settings.clock as FakeClock).advance(15_000);
    expect(await pending).toBe('timedOut');
    expect(transport.admission.snapshot().ordinaryForwarding).toBe(0);
  });

  it('holds the ninth concurrent request until a forwarding channel frees', async () => {
    const { transport } = await connected(answer);
    const releases: (() => void)[] = [];
    transport.session.exchangeStreamLocal = (_s, request) =>
      new Promise((resolve) =>
        releases.push(() => resolve(reply(request, RESULTS.ping as JsonObject))),
      );
    const all = Array.from({ length: 9 }, () => transport.ping());
    await settle();
    expect(releases).toHaveLength(8);
    expect(transport.admission.snapshot().ordinaryForwarding).toBe(8);
    releases[0]?.();
    await settle();
    expect(releases).toHaveLength(9);
    for (const release of releases) release();
    expect((await Promise.all(all)).every((pong) => pong.protocolVersion === 19)).toBe(true);
  });
});
