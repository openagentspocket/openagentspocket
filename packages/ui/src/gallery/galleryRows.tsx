import { useState } from 'react';
import { NavRow, PickerRow, StepperRow, ToggleRow } from '../form/FormRows';
import { TextField } from '../form/TextField';
import { toast } from '../overlay/toast';
import { Badge } from '../primitives/Badge';
import { Card } from '../primitives/Card';
import { Icon } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';
import { ProgramMark } from '../primitives/ProgramMark';
import { Section } from '../primitives/Section';
import { Text } from '../primitives/Text';
import { sampleAgents } from './galleryData';
import { Specimen, Stack } from './galleryKit';

const said = (title: string) => () => toast({ title, tone: 'info', durationMs: 1500 });

export function CardsAndRows() {
  const [expanded, setExpanded] = useState(true);
  return (
    <>
      <Specimen name="Card">
        <Stack>
          <Card>
            <Text variant="headline">Surface card</Text>
            <Text tone="secondary">The card corner and a hairline at 16%.</Text>
          </Card>
          <Card level="overlay">
            <Text variant="headline">Overlay card</Text>
            <Text tone="secondary">Inside sheets and drawers.</Text>
          </Card>
          <Card
            accent="statusBlocked"
            onPress={said('Card pressed')}
            accessibilityLabel="Needs you"
          >
            <Text variant="headline">Asks for attention</Text>
            <Text tone="secondary">Accent outline at 40%; pressable.</Text>
          </Card>
        </Stack>
      </Specimen>
      <Specimen name="Section + ListRow">
        <Section title="Agents" count={sampleAgents.length} footer="Swipe a row or long-press it.">
          {sampleAgents.map((agent) => (
            <ListRow
              key={agent.id}
              title={agent.name}
              subtitle={`${agent.program} · ${agent.workspace}`}
              leading={<ProgramMark program={agent.program} status={agent.status} size={24} />}
              chevron
              onPress={said(agent.name)}
              menu={[
                { key: 'rename', title: 'Rename', icon: 'edit', onPress: said('Rename') },
                { key: 'pin', title: 'Pin', icon: 'pin', onPress: said('Pin') },
                {
                  key: 'close',
                  title: 'Close',
                  icon: 'trash',
                  destructive: true,
                  onPress: said('Close'),
                },
              ]}
              swipeActions={[
                { key: 'pin', title: 'Pin', icon: 'pin', tone: 'accent', onPress: said('Pin') },
                {
                  key: 'close',
                  title: 'Close',
                  icon: 'trash',
                  tone: 'danger',
                  onPress: said('Close'),
                },
              ]}
            />
          ))}
        </Section>
      </Specimen>
      <Specimen name="ListRow states">
        <Section>
          <ListRow title="Value and chevron" value="Índigo" chevron onPress={said('Theme')} />
          <ListRow
            title="Trailing badge"
            leading={<Icon name="server" color="textPrimary" />}
            trailing={<Badge label="2" kind="control" />}
          />
          <ListRow
            title="Disabled"
            subtitle="Not available on this Host"
            disabled
            onPress={said('x')}
          />
        </Section>
      </Specimen>
      <Specimen name="Section collapsible">
        <Section
          title="Done"
          status="done"
          count={2}
          expanded={expanded}
          onToggle={() => setExpanded((open) => !open)}
          action={{ title: 'See all', onPress: said('See all') }}
        >
          <ListRow title="Write the pairing docs" subtitle="pi · docs" />
          <ListRow title="Bump the relay" subtitle="codex · relay" />
        </Section>
      </Specimen>
    </>
  );
}

const THEMES = [
  { value: 'indigo', label: 'Índigo' },
  { value: 'papel', label: 'Papel' },
  { value: 'noche', label: 'Noche' },
] as const;

export function Forms() {
  const [name, setName] = useState('');
  const [port, setPort] = useState('22x');
  const [notify, setNotify] = useState(true);
  const [theme, setTheme] = useState<(typeof THEMES)[number]['value']>('indigo');
  const [fontSize, setFontSize] = useState(13);
  return (
    <>
      <Specimen name="TextField">
        <Stack>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="My Host"
            hint="Shown in the Hosts list."
          />
          <TextField
            label="Port"
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
            mono
            error={/^\d+$/.test(port) ? undefined : 'Use digits only.'}
          />
          <TextField label="Notes" multiline placeholder="Anything worth remembering" />
        </Stack>
      </Specimen>
      <Specimen name="Form rows">
        <Section title="Settings" footer="Rows drive the settings schema renderer.">
          <ToggleRow
            title="Notifications"
            subtitle="When an Agent needs you"
            value={notify}
            onValueChange={setNotify}
          />
          <PickerRow title="Theme" options={THEMES} value={theme} onChange={setTheme} />
          <StepperRow
            title="Font size"
            value={fontSize}
            min={9}
            max={20}
            onChange={setFontSize}
            format={(value) => `${value} pt`}
          />
          <NavRow title="Hosts" value="2" onPress={said('Hosts')} />
        </Section>
      </Specimen>
    </>
  );
}
