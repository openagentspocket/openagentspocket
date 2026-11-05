// Atlas entries of the agent detail family (agent-detail.*). Owned by its UX family task, so parallel tasks never edit the same registry file.
import { t } from '@openagentspocket/i18n';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import { ShellTerminalScreen } from '@/features/terminals/ShellTerminalScreen';
import { deviceStorage } from '@/settings/deviceStorage';
import { noop, titled } from './atlasHelpers';
import type { AtlasEntry } from './entries';

export const agentDetailEntries: Readonly<Record<string, AtlasEntry>> = {
  'agent-detail.container': {
    render: () =>
      titled(
        '',
        <AgentDetailScreen
          hostId="demo"
          paneId="p1"
          storage={deviceStorage}
          surface="chat"
          onSwitch={noop}
        />,
      ),
  },
  'agent-detail.terminal': {
    render: () =>
      titled(
        '',
        <AgentDetailScreen
          hostId="demo"
          paneId="p1"
          storage={deviceStorage}
          surface="terminal"
          onSwitch={noop}
        />,
      ),
  },
  'agent-detail.shell-terminal': {
    render: () =>
      titled(
        t('Terminal'),
        <ShellTerminalScreen
          hostId="demo"
          workspaceId="w0"
          cwd="/work/api-server"
          onClose={noop}
        />,
      ),
  },
};
