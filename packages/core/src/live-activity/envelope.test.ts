import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AgentInfo } from '../console/agent-fields';
import type { ConsoleRow } from '../console/row';
import { decodeBase64Url } from '../pairing/bytes';
import { buildDesire } from './desire';
import { ActivityEnvelopeError, openActivity, sealActivity } from './envelope';
import type { ActivityAgentDetail, ActivityAsk, ActivityDetails } from './types';

// The plugin's shared vectors are the oracle: the Node plugin seals them, the Swift app opens them.
const VECTORS = new URL(
  '../../../plugin/test-vectors/live-activity-content-v1.json',
  import.meta.url,
);

interface WireAgent {
  kind: string;
  name?: string;
  pane: string;
  status: string;
  title?: string;
  workspace?: string;
  ask?: { act: number; bid: string; opts: string[]; q: string; res?: string; ts: number };
  rows?: unknown;
}
interface Payload {
  agents: WireAgent[];
  host: string;
  v: number;
}
interface ValidVector {
  name: string;
  key: string;
  keyId: string;
  envelope: string;
  payload: Payload;
  decodeOnly?: boolean;
  pinned_pane_ids?: string[];
  counts?: { working: number; blocked: number; done: number };
  inventory?: Record<string, string>[];
}
interface InvalidVector {
  name: string;
  key: string;
  envelope: string;
  error: string;
}
const file = JSON.parse(readFileSync(VECTORS, 'utf8')) as {
  valid: ValidVector[];
  invalid: InvalidVector[];
};

const keyOf = (text: string) => decodeBase64Url(text) ?? new Uint8Array();

function toDetail(agent: WireAgent): ActivityAgentDetail {
  const ask: ActivityAsk | undefined = agent.ask && {
    episodeId: agent.ask.bid,
    denyOnly: agent.ask.act === 2,
    prompt: agent.ask.q,
    options: agent.ask.opts,
    timestamp: agent.ask.ts,
    ...(agent.ask.res ? { result: agent.ask.res as ActivityAsk['result'] } : {}),
  };
  return {
    paneId: agent.pane,
    kind: agent.kind,
    status: agent.status,
    ...(agent.name ? { name: agent.name } : {}),
    ...(agent.title ? { title: agent.title } : {}),
    ...(agent.workspace ? { workspace: agent.workspace } : {}),
    ...(ask ? { ask } : {}),
  };
}

const detailsOf = (payload: Payload): ActivityDetails => ({
  hostName: payload.host,
  agents: payload.agents.map(toDetail),
});

const sealable = file.valid.filter(
  (v) => !v.decodeOnly && !JSON.stringify(v.payload).includes('"rows"'),
);

describe('activity envelope against the shared vectors', () => {
  it.each(sealable.map((v) => [v.name, v] as const))('seals %s byte for byte', (_name, vector) => {
    const frame = JSON.parse(vector.envelope) as { n: string };
    const nonce = decodeBase64Url(frame.n) ?? new Uint8Array();
    const sealed = sealActivity(detailsOf(vector.payload), keyOf(vector.key), nonce);
    expect(JSON.stringify(sealed)).toBe(JSON.stringify(JSON.parse(vector.envelope)));
    expect(sealed.kid).toBe(vector.keyId);
  });

  it.each(file.valid.map((v) => [v.name, v] as const))('opens %s', (_name, vector) => {
    const opened = openActivity(vector.envelope, keyOf(vector.key));
    const expected = detailsOf(vector.payload);
    expect(opened.hostName).toBe(expected.hostName);
    expect(opened.agents).toEqual(expected.agents);
  });

  it.each(file.invalid.map((v) => [v.name, v] as const))('refuses %s', (_name, vector) => {
    let kind: string | undefined;
    try {
      openActivity(vector.envelope, keyOf(vector.key));
    } catch (thrown) {
      kind = thrown instanceof ActivityEnvelopeError ? thrown.kind : String(thrown);
    }
    expect(kind).toBe(vector.error);
  });
});

function rowFrom(wire: Record<string, string>): ConsoleRow {
  const agent = {
    pane_id: wire.pane_id,
    agent_status: wire.agent_status,
    agent: wire.agent,
    name: wire.name,
    terminal_title_stripped: wire.terminal_title_stripped,
    focused: false,
    revision: 0,
    tab_id: 't',
    terminal_id: 'x',
    workspace_id: 'w',
  } as AgentInfo;
  return { hostId: 'h', hostName: 'mbp', agent, workspaceTabCount: 1, tabPaneCount: 1 };
}

describe('buildDesire against the vectors that carry an inventory', () => {
  const withInventory = file.valid.filter((v) => v.inventory);
  it('covers at least the pinned vectors', () => {
    expect(withInventory.length).toBeGreaterThanOrEqual(2);
  });

  it.each(withInventory.map((v) => [v.name, v] as const))('%s', (_name, vector) => {
    const desire = buildDesire({
      rows: (vector.inventory ?? []).map(rowFrom),
      hostName: vector.payload.host,
      pinnedPaneIds: vector.pinned_pane_ids,
    });
    expect(desire?.agents).toEqual(detailsOf(vector.payload).agents);
    if (vector.counts) expect(desire?.counts).toEqual(vector.counts);
  });
});
