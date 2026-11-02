import { groupForHome, type HomeSection } from '@openagentspocket/core';
import { type AppKey, t } from '@openagentspocket/i18n';
import { Screen, SectionHeader, type Status, Text } from '@openagentspocket/ui';
import { Fragment } from 'react';
import { AgentCard } from './AgentCard';
import { useAgents } from './useAgents';

const SECTIONS = [
  { key: 'needsYou', title: 'Needs you', status: 'blocked' },
  { key: 'working', title: 'Working', status: 'working' },
  { key: 'done', title: 'Done', status: 'done' },
] as const satisfies readonly { key: HomeSection; title: AppKey; status: Status }[];

export function HomeScreen() {
  const groups = groupForHome(useAgents());
  return (
    <Screen>
      <Text variant="title">Agentico</Text>
      {SECTIONS.map(({ key, title, status }) => (
        <Fragment key={key}>
          <SectionHeader title={t(title)} status={status} count={groups[key].length} />
          {groups[key].map((agent) => (
            <AgentCard key={`${agent.hostId}:${agent.paneId}`} agent={agent} />
          ))}
        </Fragment>
      ))}
    </Screen>
  );
}
