import { agentDisplayName, type ConsoleRow, rowKey } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { AgentSwitcher as Capsule, type SwitcherAgent } from '@openagentspocket/ui';
import { View } from 'react-native';
import { statusDot } from '@/console/agentStatus';
import type { Surface } from './surface';

interface Props {
  rows: readonly ConsoleRow[];
  currentKey: string;
  onSelect: (row: ConsoleRow) => void;
  surface: Surface;
  onSurface: (surface: Surface) => void;
}

/** The Console's Agents in the bottom capsule, with the Chat/Terminal switch pinned at its end. */
export function AgentSwitcher({ rows, currentKey, onSelect, surface, onSurface }: Props) {
  const agents: SwitcherAgent[] = rows.map((row) => ({
    id: rowKey(row),
    title: agentDisplayName(row.agent),
    program: row.agent.agent ?? 'unknown',
    status: statusDot(row.agent.agent_status),
  }));
  const current = rows.find((row) => rowKey(row) === currentKey);
  return (
    <View testID="agent-switcher">
      <Capsule
        agents={agents}
        currentId={current ? rowKey(current) : ''}
        onSelect={(id) => {
          const row = rows.find((candidate) => rowKey(candidate) === id);
          if (row && rowKey(row) !== currentKey) onSelect(row);
        }}
        trailing={[
          {
            key: 'surface',
            icon: surface === 'chat' ? 'terminal' : 'chat',
            label: surface === 'chat' ? t('Show Terminal') : t('Show Chat'),
            onPress: () => onSurface(surface === 'chat' ? 'terminal' : 'chat'),
          },
        ]}
        labels={{ switcher: t('Agents'), switchTo: t('Switch to') }}
        testID="switch"
      />
    </View>
  );
}
