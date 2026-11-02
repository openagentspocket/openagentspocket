import { groupForHome, type HomeSection, rowKey } from '@openagentspocket/core';
import { type AppKey, t } from '@openagentspocket/i18n';
import { Screen, SectionHeader, type Status, Text } from '@openagentspocket/ui';
import { Fragment } from 'react';
import { useConsole } from '../console/hooks';
import { AgentCard } from './AgentCard';

const SECTIONS = [
  { key: 'needsYou', title: 'Needs you', status: 'blocked' },
  { key: 'working', title: 'Working', status: 'working' },
  { key: 'done', title: 'Done', status: 'done' },
] as const satisfies readonly { key: HomeSection; title: AppKey; status: Status }[];

export function HomeScreen() {
  const groups = groupForHome(useConsole());
  return (
    <Screen>
      <Text variant="title">OpenAgentsPocket</Text>
      {SECTIONS.map(({ key, title, status }) => (
        <Fragment key={key}>
          <SectionHeader title={t(title)} status={status} count={groups[key].length} />
          {groups[key].map((agent) => (
            <AgentCard key={rowKey(agent)} row={agent} />
          ))}
        </Fragment>
      ))}
    </Screen>
  );
}
