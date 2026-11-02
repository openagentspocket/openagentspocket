import { agentDisplayName, type ConsoleRow, rowDirectory } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type ActionMenuItem, AgentHeader as FloatingHeader } from '@openagentspocket/ui';
import type { Surface } from './surface';

interface Props {
  row: ConsoleRow;
  surface: Surface;
  onSurface: (surface: Surface) => void;
  onSidebar: () => void;
  /** Changes, Files, Ports and the rest, from the route. */
  menu?: readonly ActionMenuItem[];
}

const tail = (path: string | undefined) => path?.split('/').filter(Boolean).at(-1);

/** The floating header: Sessions circle, the Agent's title block, one ... menu with Chat/Terminal. */
export function AgentHeader({ row, surface, onSurface, onSidebar, menu = [] }: Props) {
  const items: ActionMenuItem[] = [
    {
      key: 'surface-chat',
      title: t('Show Chat'),
      icon: 'chat',
      checked: surface === 'chat',
      onPress: () => onSurface('chat'),
    },
    {
      key: 'surface-terminal',
      title: t('Show Terminal'),
      icon: 'terminal',
      checked: surface === 'terminal',
      onPress: () => onSurface('terminal'),
    },
    ...menu,
  ];
  return (
    <FloatingHeader
      surface={surface}
      onSidebar={onSidebar}
      menu={items}
      eyebrow={[row.hostName, row.agent.agent].filter(Boolean).join(' · ')}
      title={agentDisplayName(row.agent)}
      subtitle={[row.workspaceLabel, tail(rowDirectory(row))].filter(Boolean).join(' · ')}
      labels={{ sidebar: t('Sessions'), more: t('More') }}
      testID="agent-header"
    />
  );
}
