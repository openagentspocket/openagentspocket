import { groupForHome, type HomeSection } from '@agentico/core';
import { Screen, SectionHeader, type Status, Text } from '@agentico/ui';
import { Fragment } from 'react';
import { AgentCard } from './AgentCard';
import { useAgents } from './useAgents';

const SECTIONS: { key: HomeSection; title: string; status: Status }[] = [
  { key: 'needsYou', title: 'Needs you', status: 'blocked' },
  { key: 'working', title: 'Working', status: 'working' },
  { key: 'done', title: 'Done', status: 'done' },
];

export function HomeScreen() {
  const groups = groupForHome(useAgents());
  return (
    <Screen>
      <Text variant="title">Agentico</Text>
      {SECTIONS.map(({ key, title, status }) => (
        <Fragment key={key}>
          <SectionHeader title={title} status={status} count={groups[key].length} />
          {groups[key].map((agent) => (
            <AgentCard key={`${agent.hostId}:${agent.paneId}`} agent={agent} />
          ))}
        </Fragment>
      ))}
    </Screen>
  );
}
