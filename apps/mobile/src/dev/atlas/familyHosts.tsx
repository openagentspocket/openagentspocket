// Atlas entries added by the Add Host flow (hosts.add-choice). Owned by its UX task, so parallel tasks never edit the same registry file.
import HostsRoute from '@/app/hosts';
import { AddHostSheet } from '@/features/hosts/AddHostSheet';
import type { AtlasEntry } from './entries';

const noop = () => {};

export const hostsEntries: Readonly<Record<string, AtlasEntry>> = {
  'hosts.add-choice': {
    render: () => (
      <>
        <HostsRoute />
        <AddHostSheet onClose={noop} onEasyPair={noop} onAddManually={noop} />
      </>
    ),
  },
};
