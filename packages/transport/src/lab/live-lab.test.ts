// The agent lab's live probe: runs only when `scripts/agent-lab.py probe` sets OAP_LAB_ROOT, and
// is skipped everywhere else (verify-fast, `pnpm test`). It connects to the lab's sshd as the app
// does and probes every Agent the lab started; see docs/e2e-live-backend.md.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { systemClock } from '../clock';
import { SshTransport } from '../transport';
import { usageHostPort } from '../usage-port';
import { actOnAgent, type LabAction, probeAgent } from './lab-probe';
import { LabSshSession, type LabState } from './lab-ssh';

const ROOT = process.env.OAP_LAB_ROOT;
const STEP = process.env.OAP_LAB_STEP ?? 'snapshot';
const ONLY = process.env.OAP_LAB_PROGRAM;
/** After the probe: `OAP_LAB_SEND` sends a Chat message, `OAP_LAB_KEYS` (comma separated) presses keys. */
const ACTION: LabAction = {
  send: process.env.OAP_LAB_SEND,
  keys: process.env.OAP_LAB_KEYS?.split(',').filter(Boolean),
  answer: process.env.OAP_LAB_ANSWER ? Number(process.env.OAP_LAB_ANSWER) : undefined,
  stop: process.env.OAP_LAB_STOP === '1',
};

describe.skipIf(!ROOT)('agent lab, live', () => {
  it('probes every lab Agent with the app code', async () => {
    const lab = JSON.parse(readFileSync(join(ROOT as string, 'state.json'), 'utf8')) as LabState;
    const session = new LabSshSession(lab);
    await session.start();
    const transport = new SshTransport(
      session,
      {
        routes: [{ host: '127.0.0.1', port: lab.ssh_port, jump: null, id: null }],
        username: lab.user,
        hostKeyPolicy: null as never,
        socket: { kind: 'defaultSession' },
        clock: systemClock,
      },
      null,
    );
    try {
      expect((await transport.ping()).version).toBeTruthy();
      if (process.env.OAP_LAB_USAGE === '1') {
        // Usage as the app reads it: the plugin's query over one bounded exec.
        const port = usageHostPort(transport);
        const plugin = await port.readPlugin();
        const report = plugin?.pluginRoot
          ? await port.query({
              pluginRoot: plugin.pluginRoot,
              timeZone: 'UTC',
              claudeLimits: false,
            })
          : null;
        const out = join(lab.root, 'captures', STEP);
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, 'usage.json'), `${JSON.stringify({ plugin, report }, null, 2)}\n`);
      }
      for (const [name, agent] of Object.entries(lab.agents)) {
        if (ONLY && ONLY !== name) continue;
        const program = name as 'opencode' | 'codex';
        const out = join(lab.root, 'captures', STEP, program);
        mkdirSync(out, { recursive: true });
        const report = await probeAgent(transport, program, agent.name, out);
        const acted = await actOnAgent(transport, program, agent.pane, ACTION);
        writeFileSync(join(out, 'action.json'), `${JSON.stringify(acted, null, 2)}\n`);
        console.log(JSON.stringify({ ...report, acted }, null, 2));
      }
    } finally {
      await session.disconnect();
    }
  }, 120_000);
});
