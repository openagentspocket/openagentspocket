import { gitStatusOfState } from '@openagentspocket/core';
import { waitFor } from '@testing-library/react-native';
import { utf8Decode } from 'agentico-ssh';
import { changesTargetId, parseChangesTarget } from '@/changes/target';
import { createWorld, SAMPLE_HOST, type World } from '@/connections/testWorld';
import {
  changesRecording,
  headers,
  NONCE,
  ordinary,
} from '../../../../packages/core/src/changes/fixtures';
import { type Composition, createComposition } from './createComposition';

jest.mock('expo-secure-store', () => ({}));
jest.mock('expo-sqlite/kv-store', () => ({}));

const HOST_ID = SAMPLE_HOST.id;

async function connectedWorld(): Promise<{ world: World; composition: Composition }> {
  const world = await createWorld();
  const composition = createComposition({
    access: world.manager,
    console: world.store,
    hosts: () => world.runtime.model.getSnapshot().hosts,
    storage: world.deps.storage,
    clock: world.clock,
    openAgent: jest.fn(),
    openChanges: jest.fn(),
  });
  world.manager.start();
  await world.runtime.model.add(SAMPLE_HOST, null);
  await waitFor(() => {
    world.acknowledgeEvents();
    const status = world.store.getState().hosts.find((host) => host.id === HOST_ID)?.status;
    expect(status?.kind).toBe('connected');
  });
  return { world, composition };
}

describe('changes targets', () => {
  it('round-trips agent and directory targets and rejects anything else', () => {
    const agent = { kind: 'agent', hostId: 'h', paneId: 'p' } as const;
    const directory = { kind: 'directory', hostId: 'h', directory: '/a b/c' } as const;
    expect(parseChangesTarget(changesTargetId(agent))).toEqual(agent);
    expect(parseChangesTarget(changesTargetId(directory))).toEqual(directory);
    expect(parseChangesTarget('demo')).toBeUndefined();
    expect(parseChangesTarget('["agent","h"]')).toBeUndefined();
  });
});

describe('composition over a live Host', () => {
  it('lists the Host for New Agent and opens Files for it, not for an unknown Host', async () => {
    const { world, composition } = await connectedWorld();
    expect(composition.newAgent.hosts.map((host) => host.id)).toEqual([HOST_ID]);
    expect(composition.fileSource(HOST_ID, '/work')?.startPath).toBe('/work');
    expect(composition.fileSource('nope')).toBeUndefined();
    expect(composition.newAgent.worktreeDetail(HOST_ID, 'p1')).toBeUndefined();
    world.manager.stop();
  });

  it('follows the Console for Usage: a connected Host gets a port, a removed one goes', async () => {
    const { world, composition } = await connectedWorld();
    const stop = composition.start();
    await waitFor(() => expect(composition.usage.store(HOST_ID)?.isConnected).toBe(true));
    await world.runtime.model.remove(HOST_ID);
    await waitFor(() => expect(composition.usage.store(HOST_ID)).toBeUndefined());
    stop();
    world.manager.stop();
  });

  it('reads Changes in the Agent directory over the Host transport', async () => {
    const { world, composition } = await connectedWorld();
    const session = world.ssh.sessions[0];
    if (!session) throw new Error('no session');
    const scripts: string[] = [];
    const exec = jest
      .spyOn(session, 'exec')
      .mockImplementation(async (command: string, ...rest: unknown[]) => {
        const options = rest[0];
        const input =
          typeof options === 'object' && options !== null && 'input' in options
            ? options.input
            : undefined;
        scripts.push(`${command}\n${input instanceof Uint8Array ? utf8Decode(input) : ''}`);
        return { exitCode: 1, stdout: '', stderr: '' };
      });
    const store = composition.changesFactory(
      changesTargetId({ kind: 'agent', hostId: HOST_ID, paneId: 'p1' }),
    );
    await store.appear().catch(() => undefined);
    expect(exec).toHaveBeenCalled();
    expect(scripts.some((script) => script.includes('/work/api'))).toBe(true);
    world.manager.stop();
  });

  it('reads the git status of an Agent directory over the Host transport, behind the Host gate', async () => {
    const { world, composition } = await connectedWorld();
    const session = world.ssh.sessions[0];
    if (!session) throw new Error('no session');
    const directories: string[] = [];
    jest.spyOn(session, 'exec').mockImplementation(async (_command: string, ...rest: unknown[]) => {
      const options = rest[0];
      const input =
        typeof options === 'object' && options !== null && 'input' in options
          ? utf8Decode(options.input as Uint8Array)
          : '';
      const nonce = /__AGENTICO_GIT_([0-9a-f]{32})__/.exec(input)?.[1] ?? NONCE;
      if (input.includes('/work/api')) directories.push('/work/api');
      const out = changesRecording({
        status: headers('# branch.ab +2 -1\0') + ordinary('.M', 'a.ts') + '? new.txt\0',
        numstat: '5\t2\ta.ts\0',
      });
      return {
        exitCode: 0,
        stdout: out.stdout.replaceAll(NONCE, nonce),
        stderr: out.stderr.replaceAll(NONCE, nonce),
      };
    });
    const store = composition.rowChangesFactory({
      hostId: HOST_ID,
      directory: '/work/api',
      paneId: 'p1',
    });
    await store?.appear();
    expect(directories).toContain('/work/api');
    const status = store ? gitStatusOfState(store.getState()) : null;
    expect(status).toMatchObject({
      branch: 'main',
      changed: 1,
      untracked: 1,
      diff: { added: 5, removed: 2 },
    });
    world.manager.stop();
  });

  it('dials the Ports session without a prompt, and reports the Host platform', async () => {
    const { world, composition } = await connectedWorld();
    const before = world.prompts.count;
    const sessions = world.ssh.sessions.length;
    await world.manager.connectDedicated(HOST_ID);
    expect(world.ssh.sessions.length).toBe(sessions + 1);
    expect(world.prompts.count).toBe(before);
    await expect(world.manager.connectDedicated('nope')).rejects.toThrow();
    expect(composition.platformOf(HOST_ID)).toBe('posix');
    world.manager.stop();
  });
});
