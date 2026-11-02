import { FakeLiveActivityController } from '@openagentspocket/core';
import type { AppGroupStore } from 'agentico-app-group';
import { DEMO_HOST_ID, demoContent, runDemoStep } from './liveActivityDemo';

function memoryStore(): AppGroupStore & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    available: true,
    containerPath: async () => '/group',
    writeFile: async (name, text) => {
      files.set(name, text);
      return true;
    },
    readFile: async (name) => files.get(name) ?? null,
    reloadWidgets: async () => undefined,
    requestNotificationAuthorization: async () => true,
    notificationKeychain: null,
  };
}

describe('live activity demo', () => {
  it('shows nothing once the demo Agents are gone', () => {
    expect(demoContent('end')).toBeNull();
  });

  it('counts the demo Agents and seals their details', () => {
    const content = demoContent('start');
    expect(content?.counts).toEqual({ working: 2, blocked: 1, done: 0 });
    expect(content?.envelope?.ct.length).toBeGreaterThan(0);
  });

  it('starts, updates in place and ends the one activity', async () => {
    const controller = new FakeLiveActivityController();
    const store = memoryStore();
    await runDemoStep('start', controller, store);
    expect(controller.requestedHandles.map((h) => h.hostId)).toEqual([DEMO_HOST_ID]);
    expect(store.files.has('notification-keys.json')).toBe(true);
    await runDemoStep('update', controller, store);
    expect(controller.requested).toHaveLength(1);
    expect(controller.updates).toHaveLength(1);
    await runDemoStep('end', controller, store);
    expect(controller.ended).toHaveLength(1);
  });
});
