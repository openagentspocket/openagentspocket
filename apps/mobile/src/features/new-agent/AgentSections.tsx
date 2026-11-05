import { PROGRAM_KINDS, type StartAgentState, type StartAgentStore } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  Banner,
  Button,
  EmptyState,
  Icon,
  ListRow,
  ProgramMark,
  Section,
  SkeletonRows,
  TextField,
} from '@openagentspocket/ui';
import type { ReactNode } from 'react';
import { newAgentText } from './text';

interface SectionProps {
  store: StartAgentStore;
  state: StartAgentState;
}

const infoFor = (kind: string) => PROGRAM_KINDS.find((info) => info.kind === kind);

/** The program picker: each installed Agent with its brand mark. */
export function AgentSection({ store, state }: SectionProps) {
  const { discovery, availableKinds, selectedKind } = state;
  const detect = () => void store.discoverAgents();
  let body: ReactNode;
  if (discovery.kind === 'idle') {
    body = (
      <ListRow
        title={t('Select a Host to detect installed Agents.')}
        titleTone="secondary"
        titleLines={2}
      />
    );
  } else if (discovery.kind === 'loading') {
    body = <SkeletonRows accessibilityLabel={t('Detecting installed Agents…')} />;
  } else if (discovery.kind === 'failed') {
    body = (
      <>
        <Banner
          tone="danger"
          title={newAgentText(discovery.message)}
          testID="new-agent-detect-error"
        />
        <Button kind="secondary" icon="refresh" title={t('Retry')} onPress={detect} />
      </>
    );
  } else if (availableKinds.length === 0) {
    body = (
      <>
        <EmptyState
          icon="search"
          title={t('No Agents Found')}
          message={t('Install a supported Agent CLI on this Host, then try again.')}
          layout="compact"
          testID="new-agent-none"
        />
        <Button kind="secondary" icon="refresh" title={t('Detect Again')} onPress={detect} />
      </>
    );
  } else {
    body = [
      ...availableKinds.map((kind) => {
        const info = infoFor(kind);
        return (
          <ListRow
            key={kind}
            title={info ? `${info.displayName} (${info.executable ?? info.kind})` : kind}
            leading={<ProgramMark program={kind} size={24} />}
            trailing={kind === selectedKind ? <Icon name="check" color="accent" /> : undefined}
            onPress={() => store.edit({ selectedKind: kind })}
            accessibilityHint={kind === selectedKind ? t('Selected') : undefined}
            testID={`new-agent-kind-${kind}`}
          />
        );
      }),
      <Button key="detect" kind="text" icon="refresh" title={t('Detect Again')} onPress={detect} />,
    ];
  }
  return (
    <Section
      title={t('Agent')}
      footer={t("Agents installed and launchable from this Host's PATH.")}
      grouped={
        discovery.kind === 'idle' || (discovery.kind === 'loaded' && availableKinds.length > 0)
      }
    >
      {body}
    </Section>
  );
}

/** The name, tab label and arguments fields: one grouped row each, a footer that teaches. */
export function DetailsSections({ store, state }: SectionProps) {
  const nameError = store.nameError;
  const argumentError = store.argumentError;
  return (
    <>
      <Section
        title={t('Agent Name')}
        footer={
          store.defaultName
            ? t('Empty names the agent %@.', store.defaultName)
            : t('Empty names the agent after its kind.')
        }
      >
        <TextField
          inline
          label={t('Agent name (optional)')}
          value={state.name}
          onChangeText={(name) => store.edit({ name })}
          error={nameError ? newAgentText(nameError) : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          testID="new-agent-name"
        />
      </Section>
      <Section title={t('Tab Name')} footer={t('Empty lets herdr or a title plugin name the tab.')}>
        <TextField
          inline
          label={t('Tab name (optional)')}
          value={state.tabLabel}
          onChangeText={(tabLabel) => store.edit({ tabLabel })}
          autoCorrect={false}
          testID="new-agent-tab"
        />
      </Section>
      <Section
        title={t('Arguments')}
        footer={t(
          'Quotes and backslash escapes are supported.\ne.g. %@',
          '--model "gpt 5" --continue',
        )}
      >
        <TextField
          inline
          label={t('Arguments (optional)')}
          value={state.arguments}
          onChangeText={(text) => store.edit({ arguments: text })}
          error={argumentError ? newAgentText(argumentError) : undefined}
          autoCapitalize="none"
          autoCorrect={false}
          smartInsertDelete={false}
          mono
          testID="new-agent-arguments"
        />
      </Section>
    </>
  );
}
