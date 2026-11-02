import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Composer } from '../composer/Composer';
import { DiffView } from '../diff/DiffView';
import { KeyboardDock } from '../keys/KeyboardDock';
import { Markdown } from '../markdown/Markdown';
import { toast } from '../overlay/toast';
import { ListRow } from '../primitives/ListRow';
import { ProgramMark } from '../primitives/ProgramMark';
import { Text } from '../primitives/Text';
import { VirtualSectionList } from '../primitives/VirtualList';
import { type TerminalHandle, TerminalView } from '../terminal/TerminalView';
import { useTheme } from '../theme/theme';
import {
  type SampleAgent,
  sampleAgents,
  sampleDiff,
  sampleKeyRows,
  sampleMarkdown,
  sampleTerminal,
} from './galleryData';
import { Specimen, Stack } from './galleryKit';

const said = (title: string) => toast({ title, tone: 'info', durationMs: 1500 });

export function Content() {
  const theme = useTheme();
  const terminal = useRef<TerminalHandle>(null);
  const [draft, setDraft] = useState('');
  const [lastKey, setLastKey] = useState('none');
  useEffect(() => {
    terminal.current?.write(sampleTerminal);
  }, []);
  return (
    <>
      <Specimen name="Markdown + CodeBlock">
        <Markdown text={sampleMarkdown} onLinkPress={(href) => said(href)} />
      </Specimen>
      <Specimen name="DiffView unified">
        <DiffView diff={sampleDiff} />
      </Specimen>
      <Specimen name="DiffView split">
        <DiffView diff={sampleDiff} layout="split" />
      </Specimen>
      <Specimen name="TerminalView (text fallback)">
        <View
          style={{
            height: 140,
            borderRadius: theme.metrics.cardRadius,
            overflow: 'hidden',
            borderWidth: theme.metrics.hairlineWidth,
            borderColor: theme.hairline,
          }}
        >
          <TerminalView ref={terminal} onInput={(data) => terminal.current?.write(data)} />
        </View>
      </Specimen>
      <Specimen name="KeyboardDock">
        <Stack>
          <Text variant="caption" tone="secondary">
            Last key: {lastKey}
          </Text>
          <KeyboardDock
            rows={sampleKeyRows}
            onKey={(key, modifiers) =>
              setLastKey(
                `${modifiers.ctrl ? 'ctrl+' : ''}${modifiers.alt ? 'alt+' : ''}${key.label}`,
              )
            }
          />
        </Stack>
      </Specimen>
      <Specimen name="Composer idle">
        <Composer
          value={draft}
          onChangeText={setDraft}
          onSend={() => {
            said(`Sent: ${draft}`);
            setDraft('');
          }}
          placeholder="Message the Agent"
          addMenu={[
            { key: 'file', title: 'Attach a file', icon: 'attach', onPress: () => said('file') },
            {
              key: 'snippet',
              title: 'Insert a snippet',
              icon: 'sparkles',
              onPress: () => said('snippet'),
            },
          ]}
          suggestions={[
            { key: 'continue', label: 'Continue' },
            { key: 'tests', label: 'Run the tests' },
          ]}
          onSuggestion={(key) => said(key)}
        />
      </Specimen>
      <Specimen name="Composer busy (Stop)">
        <Composer
          value=""
          onChangeText={() => {}}
          onSend={() => {}}
          onStop={() => said('Stop')}
          busy
          placeholder="Agent is working"
        />
      </Specimen>
    </>
  );
}

const SECTIONS = [
  {
    key: 'needs',
    title: 'Needs you',
    data: sampleAgents.filter((agent) => agent.status === 'blocked'),
  },
  {
    key: 'working',
    title: 'Working',
    data: sampleAgents.filter((agent) => agent.status === 'working'),
  },
  {
    key: 'rest',
    title: 'Done',
    data: sampleAgents.filter((agent) => agent.status === 'done' || agent.status === 'idle'),
  },
];

const keyOf = (agent: SampleAgent) => agent.id;

export function Lists() {
  const theme = useTheme();
  return (
    <Specimen name="VirtualSectionList (FlashList v2)">
      <View
        style={{
          height: 300,
          borderRadius: theme.metrics.cardRadius,
          borderWidth: theme.metrics.hairlineWidth,
          borderColor: theme.hairline,
          overflow: 'hidden',
        }}
      >
        <VirtualSectionList
          sections={SECTIONS}
          keyExtractor={keyOf}
          stickyHeaders
          renderItem={(agent) => (
            <ListRow
              title={agent.name}
              subtitle={agent.workspace}
              leading={<ProgramMark program={agent.program} status={agent.status} size={22} />}
              chevron
              onPress={() => said(agent.name)}
            />
          )}
        />
      </View>
    </Specimen>
  );
}
