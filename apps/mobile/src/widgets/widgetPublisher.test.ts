import { WIDGET_SNAPSHOT_FILE } from '@openagentspocket/core';
import { createAppGroupStore, type NativeAppGroup } from 'agentico-app-group';
import { appGroupPort } from './widgetPublisher';

function fakeNative() {
  const files = new Map<string, string>();
  const reloads: (readonly string[])[] = [];
  const native: NativeAppGroup = {
    containerPath: async () => '/container',
    writeFile: async (_group, name, text) => {
      files.set(name, text);
      return true;
    },
    readFile: async (_group, name) => files.get(name) ?? null,
    reloadWidgets: async (kinds) => {
      reloads.push(kinds);
    },
    requestNotificationAuthorization: async () => true,
    keychainSave: () => true,
    keychainRead: () => null,
    keychainReadAll: () => ({}),
    keychainRemove: () => true,
  };
  return { native, files, reloads };
}

describe('appGroupPort', () => {
  it('writes the snapshot file in the group and reloads the kinds', async () => {
    const { native, files, reloads } = fakeNative();
    const port = appGroupPort(createAppGroupStore(native));
    expect(await port.writeSnapshot('{"version":1}')).toBe(true);
    await port.reloadWidgets(['kind']);
    expect(files.get(WIDGET_SNAPSHOT_FILE)).toBe('{"version":1}');
    expect(reloads).toEqual([['kind']]);
  });
});
