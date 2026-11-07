// Atlas entries of the agent detail family (agent-detail.*). Owned by its UX family task, so parallel tasks never edit the same registry file.
import { t } from '@openagentspocket/i18n';
import { Stack } from 'expo-router';
import { AgentDetailScreen } from '@/agent-detail/AgentDetailScreen';
import { closeTerminalConfirmation } from '@/features/terminals/closeConfirmation';
import { SHELL_CLOSE_ANCHOR, ShellTerminalScreen } from '@/features/terminals/ShellTerminalScreen';
import { deviceStorage } from '@/settings/deviceStorage';
import { AtlasBlocked } from './atlasBlocked';
import { AtlasChat } from './atlasChat';
import { noop, titled } from './atlasHelpers';
import { AlertOver, closePanePopover, TerminalStatusAtlas } from './atlasOverlays';
import type { AtlasEntry } from './entries';

/** The Agent detail in a fixed state: Agent pane, surface, and what is pressed after it settles. */
function detail(
  pane: 'p1' | 'p2' | 'p4',
  surface: 'chat' | 'terminal',
  press?: readonly string[],
  blocked = false,
  looking = false,
  background?: 'list' | 'blocked',
): AtlasEntry {
  return {
    script: press ? { press } : undefined,
    render: () => (
      <AtlasChat looking={looking} background={background}>
        <Stack.Screen options={{ headerShown: false }} />
        {blocked ? (
          <AtlasBlocked>
            <AgentDetailScreen
              hostId="demo"
              paneId={pane}
              storage={deviceStorage}
              surface={surface}
              onSwitch={noop}
            />
          </AtlasBlocked>
        ) : (
          <AgentDetailScreen
            hostId="demo"
            paneId={pane}
            storage={deviceStorage}
            surface={surface}
            onSwitch={noop}
          />
        )}
      </AtlasChat>
    ),
  };
}

const chat = detail('p2', 'chat');
const terminal = detail('p2', 'terminal');

/**
 * Every Swift `agent-detail.*` id. Ids whose RN state does not exist yet render the nearest screen
 * (listed as KNOWN GAP in atlasMap.json) so the sheet shows what RN has, not a blank.
 */
export const agentDetailEntries: Readonly<Record<string, AtlasEntry>> = {
  'agent-detail.container': terminal,
  'agent-detail.terminal': terminal,
  'agent-detail.chat': chat,
  'agent-detail.chat-timeline': chat,
  'agent-detail.chat-floating-controls': chat,
  'agent-detail.chat-background-strip': detail('p2', 'chat', undefined, false, false, 'list'),
  'agent-detail.subagent-transcript': detail(
    'p2',
    'chat',
    ['work-row-w3', 'work-open-w3'],
    false,
    false,
    'list',
  ),
  'agent-detail.chat-background-sheet': detail('p2', 'chat', ['work-row-w1'], false, false, 'list'),
  'agent-detail.chat-banners': detail('p2', 'chat', undefined, false, true),
  'agent-detail.chat-command-suggestions': chat,
  'agent-detail.chat-tools-keyboard': chat,
  'agent-detail.select-text-sheet': chat,
  'agent-detail.header': chat,
  'agent-detail.status-line': chat,
  'agent-detail.agent-switcher': chat,
  'agent-detail.composer': chat,
  'agent-detail.composer-skill-suggestions': chat,
  'agent-detail.composer-more-menu': detail('p4', 'terminal', ['composer-input', 'composer-more']),
  'agent-detail.composer-add-menu': detail('p2', 'chat', ['composer-add']),
  'agent-detail.header-more-menu': detail('p2', 'chat', ['agent-header-more']),
  'agent-detail.session-drawer': detail('p2', 'chat', ['agent-header-sidebar']),
  'agent-detail.session-drawer--agents': detail('p2', 'chat', ['agent-header-sidebar']),
  'agent-detail.chat-blocked-card': detail('p1', 'chat', undefined, true, false, 'blocked'),
  'agent-detail.direct-input': terminal,
  'agent-detail.direct-input-more-menu': detail('p2', 'terminal', ['toolbar-more']),
  'agent-detail.terminal-toolbar': terminal,
  'agent-detail.terminal-toolbar-dpad': detail('p2', 'terminal', ['toolbar-dPad']),
  'agent-detail.terminal-toolbar-more-menu': detail('p2', 'terminal', ['toolbar-more']),
  'agent-detail.tools-keyboard': terminal,
  'agent-detail.control-keys': detail('p2', 'terminal', ['toolbar-more']),
  'agent-detail.skills-pane': terminal,
  'agent-detail.snippets-pane': terminal,
  'agent-detail.terminal-appearance-pane': terminal,
  'agent-detail.terminal-status-overlay': {
    render: () => (
      <AtlasChat>
        <Stack.Screen options={{ headerShown: false }} />
        <TerminalStatusAtlas status={{ kind: 'connecting' }} />
      </AtlasChat>
    ),
  },
  'agent-detail.attach-links': terminal,
  'agent-detail.close-confirm': {
    render: () => <AlertOver options={closePanePopover}>{terminal.render()}</AlertOver>,
  },
  'agent-detail.open-terminal-chooser': chat,
  'agent-detail.skills-picker': terminal,
  'agent-detail.snippets-manager': terminal,
  'agent-detail.snippet-editor': terminal,
  'agent-detail.shell-close-confirm': {
    render: () => (
      <AlertOver options={{ ...closeTerminalConfirmation(), anchorKey: SHELL_CLOSE_ANCHOR }}>
        {titled(
          t('Terminal'),
          <ShellTerminalScreen
            hostId="demo"
            workspaceId="w0"
            cwd="/work/api-server"
            onClose={noop}
          />,
        )}
      </AlertOver>
    ),
  },
  'agent-detail.shell-keys-dock': terminal,
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
