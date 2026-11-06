import {
  type AgentSkill,
  type SkillsPaneStore,
  skillCommand,
  skillId,
  skillInsertionText,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { AsyncContent, Banner, ListRow, Section, TextField } from '@openagentspocket/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import { toolsText } from './text';

interface SkillsPaneProps {
  store: SkillsPaneStore;
  /** Types the command and a space into the draft or terminal; never submits. */
  onInsert: (text: string) => void;
  /** Opens the skill's document (the content sheet). */
  onViewContent?: (skill: AgentSkill) => void;
}

function SkillRow({
  skill,
  onInsert,
  onViewContent,
}: {
  skill: AgentSkill;
  onInsert: (text: string) => void;
  onViewContent?: (skill: AgentSkill) => void;
}) {
  return (
    <ListRow
      title={skillCommand(skill)}
      subtitle={skill.description}
      onPress={() => onInsert(skillInsertionText(skill))}
      menu={
        onViewContent
          ? [{ key: 'view', title: t('View Content'), onPress: () => onViewContent(skill) }]
          : undefined
      }
      testID={`skill-${skillId(skill)}`}
    />
  );
}

/** skills-pane: lazy-loaded list of the Agent's skills; tap one to insert its command. */
export function SkillsPane({ store, onInsert, onViewContent }: SkillsPaneProps) {
  const phase = useSyncExternalStore(
    store.subscribe.bind(store),
    () => store.phase,
    () => store.phase,
  );
  const [query, setQuery] = useState('');
  useEffect(() => {
    void store.loadIfNeeded();
  }, [store]);

  const none = store.skills.length === 0;
  const shown = store.matching(query);
  const groups = [
    { key: 'project', title: t('Project'), skills: shown.filter((s) => s.scope === 'project') },
    { key: 'global', title: t('Global'), skills: shown.filter((s) => s.scope === 'global') },
  ];
  return (
    <AsyncContent
      failure={
        phase.kind === 'failed' && none
          ? {
              layout: 'compact',
              summary: t('Skills Unavailable'),
              detail: toolsText(phase.message),
              onRetry: () => void store.refresh(),
              testID: 'skills-failed',
            }
          : null
      }
      loading={phase.kind === 'idle' || (phase.kind === 'loading' && none)}
      loadingLabel={t('Loading…')}
      empty={
        none
          ? {
              layout: 'compact',
              title: t('No Skills'),
              message: t('No skills found for this agent.'),
              testID: 'skills-empty',
            }
          : null
      }
    >
      <View testID="skills-pane">
        {phase.kind === 'failed' ? (
          <Banner title={toolsText(phase.message)} tone="warning" testID="skills-refresh-failed" />
        ) : null}
        <TextField
          label={t('Search Skills')}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          testID="skills-search"
        />
        {groups.map((group) =>
          group.skills.length === 0 ? null : (
            <Section key={group.key} title={group.title} count={group.skills.length} grouped>
              {group.skills.map((skill) => (
                <SkillRow
                  key={skillId(skill)}
                  skill={skill}
                  onInsert={onInsert}
                  onViewContent={onViewContent}
                />
              ))}
            </Section>
          ),
        )}
      </View>
    </AsyncContent>
  );
}
