import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { Composer } from '../composer/Composer';
import { DiffView } from '../diff/DiffView';
import { KeyboardDock } from '../keys/KeyboardDock';
import { Markdown } from '../markdown/Markdown';
import { toast } from '../overlay/toast';
import { Text } from '../primitives/Text';
import { type TerminalHandle, TerminalView } from '../terminal/TerminalView';
import { useTheme } from '../theme/theme';
import { sampleDiff, sampleKeyRows, sampleMarkdown, sampleTerminal } from './galleryData';
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
          <Text variant="footnote" tone="secondary">
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
