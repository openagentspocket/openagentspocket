import { type ConsoleRow, rowDirectory } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { ActionMenuItem } from '@openagentspocket/ui';
import { type Href, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useComposition } from '@/composition/CompositionProvider';
import { hrefs } from './hrefs';

interface Navigate {
  push(href: Href): void;
}

interface Hostish {
  id: string;
  name: string;
}

/**
 * Files, Ports and Changes run POSIX shell commands: they stay hidden for a native Windows
 * Host (the Swift app hides them there). A Host that has not connected yet is not known to be one.
 */
export function hostMenu(host: Hostish, isWindows: boolean, nav: Navigate): ActionMenuItem[] {
  const items: ActionMenuItem[] = [
    {
      key: 'new-agent',
      title: t('New Agent'),
      icon: 'add',
      onPress: () => nav.push(hrefs.newAgent({ hostId: host.id })),
    },
  ];
  if (!isWindows) {
    items.push(
      {
        key: 'files',
        title: t('Files'),
        icon: 'folder',
        onPress: () => nav.push(hrefs.files(host.id)),
      },
      {
        key: 'ports',
        title: t('Ports'),
        icon: 'globe',
        onPress: () => nav.push(hrefs.ports(host.id, host.name)),
      },
    );
  }
  return items;
}

/** Open, Changes, Files here, Ports, and a new tab beside the Agent. */
export function agentMenu(row: ConsoleRow, isWindows: boolean, nav: Navigate): ActionMenuItem[] {
  const { hostId, hostName } = row;
  const directory = rowDirectory(row);
  const items: ActionMenuItem[] = [
    {
      key: 'open',
      title: t('Open'),
      icon: 'terminal',
      onPress: () => nav.push(hrefs.agent(hostId, row.agent.pane_id)),
    },
  ];
  if (!isWindows) {
    items.push({
      key: 'changes',
      title: t('Changes'),
      icon: 'file',
      onPress: () => nav.push(hrefs.changesForAgent(hostId, row.agent.pane_id)),
    });
    items.push({
      key: 'ports',
      title: t('Ports'),
      icon: 'globe',
      onPress: () => nav.push(hrefs.ports(hostId, hostName)),
    });
  }
  if (directory) {
    items.push({
      key: 'new-agent-here',
      title: t('New Agent Here'),
      icon: 'add',
      onPress: () =>
        nav.push(hrefs.newAgent({ hostId, workspaceId: row.agent.workspace_id, cwd: directory })),
    });
  }
  return items;
}

/** The Host and Agent menus, bound to the router and to what the Hosts reported. */
export function useEntryMenus() {
  const router = useRouter();
  const composition = useComposition();
  return useMemo(() => {
    const windows = (hostId: string) => composition?.platformOf(hostId) === 'nativeWindows';
    return {
      host: (host: Hostish) => hostMenu(host, windows(host.id), router),
      agent: (row: ConsoleRow) => agentMenu(row, windows(row.hostId), router),
    };
  }, [router, composition]);
}
