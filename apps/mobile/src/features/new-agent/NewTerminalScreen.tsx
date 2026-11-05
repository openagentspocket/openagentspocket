import { t } from '@openagentspocket/i18n';
import { PickerRow, Screen, Section, SheetBar, TextField } from '@openagentspocket/ui';
import { useState } from 'react';
import { useNewAgentServices } from './services';

const NONE = '\u0000none';

interface NewTerminalScreenProps {
  /** The shell to open: its Host, Workspace, directory and optional tab name. */
  onOpen: (target: { hostId: string; workspaceId: string; cwd: string; label?: string }) => void;
  onCancel: () => void;
}

/** console.new-terminal: pick a Host and Workspace (and an optional tab name), then open a shell. */
export function NewTerminalScreen({ onOpen, onCancel }: NewTerminalScreenProps) {
  const { hosts, environment } = useNewAgentServices();
  const [hostId, setHostId] = useState<string | undefined>(
    hosts.length === 1 ? hosts[0]?.id : undefined,
  );
  const [picked, setPicked] = useState<string | undefined>();
  const [label, setLabel] = useState('');
  const workspaces = hostId === undefined ? [] : environment.workspaces(hostId);
  const workspace = workspaces.find((w) => w.id === picked) ?? workspaces[0];
  const cwd = workspace?.checkoutPath;
  const ready = hostId !== undefined && workspace !== undefined && cwd !== undefined;
  const open = () => {
    if (!ready) return;
    const tab = label.trim();
    onOpen({ hostId, workspaceId: workspace.id, cwd, ...(tab === '' ? {} : { label: tab }) });
  };
  const bar = (
    <SheetBar
      title={t('New Terminal')}
      leading={{ label: t('Cancel'), onPress: onCancel, testID: 'new-terminal-cancel' }}
      trailing={[
        { label: t('Open'), onPress: open, disabled: !ready, testID: 'new-terminal-open' },
      ]}
    />
  );
  return (
    <Screen header={bar} edges={['left', 'right', 'bottom']} keyboardAvoiding testID="new-terminal">
      <Section title={t('Host')}>
        <PickerRow
          title={t('Host')}
          value={hostId ?? NONE}
          options={[
            ...(hostId === undefined ? [{ value: NONE, label: t('Select a Host') }] : []),
            ...hosts.map((host) => ({ value: host.id, label: host.name })),
          ]}
          onChange={(value) => {
            setHostId(value === NONE ? undefined : value);
            setPicked(undefined);
          }}
          testID="new-terminal-host"
        />
      </Section>
      <Section title={t('Workspace')}>
        <PickerRow
          title={t('Workspace')}
          value={workspace?.id ?? NONE}
          options={
            workspaces.length === 0
              ? [{ value: NONE, label: t('None reported') }]
              : workspaces.map((w) => ({ value: w.id, label: w.label }))
          }
          onChange={(value) => setPicked(value === NONE ? undefined : value)}
          valueTone={workspace ? 'accent' : 'tertiary'}
          disabled={hostId === undefined}
          testID="new-terminal-workspace"
        />
      </Section>
      <Section title={t('Tab')} footer={t("Empty keeps herdr's numbered tab name.")}>
        <TextField
          inline
          label={t('Tab name (optional)')}
          value={label}
          onChangeText={setLabel}
          autoCorrect={false}
          testID="new-terminal-tab"
        />
      </Section>
    </Screen>
  );
}
