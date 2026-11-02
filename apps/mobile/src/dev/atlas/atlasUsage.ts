import {
  demoUsageReport,
  emptyAccountFile,
  encodeAccountFile,
  type HostReading,
  MemoryAccountFileStore,
  type UsageSource,
} from '@openagentspocket/core';

/**
 * Usage world for the atlas screens that need more than the default demo (one available Host and
 * one that is not connected): a second Host that answers, so the Hosts section, the Host column
 * and the share figures have something to compare; and an Account file with a renamable Account.
 */
export const atlasUsageSource: UsageSource = {
  async readings(): Promise<HostReading[]> {
    const now = new Date();
    return [
      {
        id: 'demo',
        name: 'Demo Host',
        state: { kind: 'available', report: demoUsageReport(now) },
      },
      {
        id: 'lab',
        name: 'Lab',
        state: { kind: 'available', report: demoUsageReport(now, 0.45) },
      },
      { id: 'offline', name: 'Spare Host', state: { kind: 'idle' }, isConnected: false },
    ];
  },
};

/** The demo Host's Accounts file lists the "work" Account the report already names. */
export function atlasAccountFiles(): MemoryAccountFileStore {
  const files = new MemoryAccountFileStore();
  void files.write(
    'demo',
    encodeAccountFile({
      ...emptyAccountFile(),
      accounts: [
        { id: 'b41d07c5', directory: '/home/dev/.claude-2', name: 'claude-2', extra: {} },
        { id: '7f3c9a2e', directory: '/home/dev/.claude-work', name: 'work', extra: {} },
      ],
    }),
  );
  return files;
}
