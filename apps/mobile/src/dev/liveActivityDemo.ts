import {
  type ActivityContentState,
  type AgentInfo,
  buildDesire,
  type ConsoleRow,
  encodeBase64Url,
  type LiveActivityController,
  sealContent,
} from '@openagentspocket/core';
import { APP_GROUP, type AppGroupStore } from 'agentico-app-group';

/** Demo-only identifiers and key. The key protects nothing: it only lets the widget open the demo envelope. */
export const DEMO_HOST_ID = '00000000-0000-4000-8000-0000000000a1';
export const DEMO_HOST_NAME = 'demo';
const DEMO_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
export const KEY_MIRROR_FILE = 'notification-keys.json';

export type DemoStep = 'start' | 'update' | 'end';

/** Demo-only nonce source: the real app needs a secure one (see the report's follow-ups). */
const demoRandomBytes = (length: number) =>
  Uint8Array.from({ length }, () => Math.floor(Math.random() * 256));

function row(paneId: string, status: string, title: string, workspace: string): ConsoleRow {
  const agent = {
    pane_id: paneId,
    agent_status: status,
    agent: 'claude',
    terminal_title_stripped: title,
    focused: false,
    revision: 0,
    tab_id: 't',
    terminal_id: 'x',
    workspace_id: 'w',
  } as AgentInfo;
  return {
    hostId: DEMO_HOST_ID,
    hostName: DEMO_HOST_NAME,
    agent,
    workspaceLabel: workspace,
    workspaceTabCount: 1,
    tabPaneCount: 1,
  };
}

/** What the demo Host's Agents look like at each step. */
export function demoRows(step: DemoStep): ConsoleRow[] {
  if (step === 'end') return [];
  return [
    row('w1:p1', step === 'start' ? 'working' : 'done', 'Refactor the settings store', 'app'),
    row('w1:p2', 'blocked', 'Run the migration?', 'api'),
    row('w1:p3', 'working', 'Write release notes', 'docs'),
  ];
}

/** Content for a step, or null when nothing should be shown (the end signal). */
export function demoContent(step: DemoStep): ActivityContentState | null {
  const desire = buildDesire({ rows: demoRows(step), hostName: DEMO_HOST_NAME });
  return desire ? sealContent(desire, DEMO_KEY, demoRandomBytes) : null;
}

/**
 * The widget cannot reach the Keychain while the device is locked, so it reads Notification Keys
 * from a mirror in the App Group container. The demo writes its key there.
 */
export async function writeDemoKeyMirror(store: AppGroupStore): Promise<boolean> {
  const mirror = {
    v: 1,
    records: [{ host: DEMO_HOST_ID, name: DEMO_HOST_NAME, key: encodeBase64Url(DEMO_KEY) }],
  };
  return store.writeFile(KEY_MIRROR_FILE, JSON.stringify(mirror));
}

export { APP_GROUP };

/** Runs one demo step against the real controller; returns a one-line outcome. */
export async function runDemoStep(
  step: DemoStep,
  controller: LiveActivityController,
  store: AppGroupStore,
): Promise<string> {
  if (!controller.areEnabled) return 'Live Activities are disabled for this app.';
  const existing = (await controller.currentActivities()).find((a) => a.hostId === DEMO_HOST_ID);
  if (step === 'end') {
    if (existing) controller.end(existing.id, null, true);
    return existing ? `ended ${existing.id}` : 'nothing to end';
  }
  if (!(await writeDemoKeyMirror(store)))
    return 'App Group unavailable: the widget cannot read the key.';
  const content = demoContent(step);
  if (!content) return 'sealing failed';
  if (existing) {
    controller.update(existing.id, content);
    return `updated ${existing.id}`;
  }
  const handle = await controller.request(DEMO_HOST_ID, content);
  return `started ${handle.id}`;
}
