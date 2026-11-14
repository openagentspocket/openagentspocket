import { type ReactNode, useState } from 'react';
import { View } from 'react-native';
import { ConnectionSheet } from '../../components/ConnectionSheet';
import { KeyValueGroup } from '../../components/KeyValueGroup';
import { ListToolbar } from '../../components/ListToolbar';
import { PermissionPrimer } from '../../components/PermissionPrimer';
import { QuickSheetHeader } from '../../components/QuickSheetHeader';
import { SearchBar } from '../../components/SearchBar';
import { TextPromptSheet } from '../../components/TextPromptSheet';
import { Button } from '../../primitives/Button';
import { Chip } from '../../primitives/Chip';
import { ProgramMark } from '../../primitives/ProgramMark';
import { Text } from '../../primitives/Text';
import { metrics, spacing } from '../../theme/metrics';
import type { CatalogEntry } from './types';

const noop = () => {};

function SearchBarDemo() {
  const [query, setQuery] = useState('polish');
  return (
    <SearchBar
      label="Search Agents"
      value={query}
      onChangeText={setQuery}
      onClose={() => setQuery('')}
    />
  );
}

/** A sheet is a Modal: the gallery shows its opener and the sheet opens over it. */
function SheetOpener({
  title,
  children,
}: {
  title: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Button kind="secondary" title={title} onPress={() => setOpen(true)} />
      {open ? children(() => setOpen(false)) : null}
    </View>
  );
}
const items = (keys: readonly string[]) =>
  keys.map((key, index) => ({ key, title: key, checked: index === 0, onPress: noop }));

export const navSheetsEntries: readonly CatalogEntry[] = [
  {
    name: 'ListToolbar',
    variants: [
      {
        id: 'default',
        render: () => (
          // The toolbar heads a Screen's padded column and reaches past its padding.
          <View style={{ padding: metrics.screenInset }}>
            <ListToolbar
              presentation="flat"
              presentationItems={items(['Flat', 'By Host', 'By Status', 'By Workspace'])}
              hostItems={items(['All Hosts', 'Studio Mac', 'Build Server'])}
              onHome={noop}
              onNew={noop}
            />
          </View>
        ),
      },
    ],
  },
  {
    name: 'QuickSheetHeader',
    variants: [
      {
        id: 'default',
        render: () => (
          <View style={{ paddingHorizontal: spacing.md }}>
            <QuickSheetHeader title="Usage" onClose={noop} />
          </View>
        ),
      },
      {
        id: 'detail',
        render: () => (
          <View style={{ paddingHorizontal: spacing.md }}>
            <QuickSheetHeader
              title="Polish the Attach experience"
              onClose={noop}
              eyebrow={
                <>
                  <ProgramMark program="codex" status="working" size={18} />
                  <Text variant="callout" tone="secondary">
                    Codex · Working
                  </Text>
                </>
              }
              eyebrowTrailing="7m"
              chips={
                <>
                  <Chip size="small" label="Studio Mac" />
                  <Chip size="small" label="agentico" />
                </>
              }
            />
          </View>
        ),
      },
    ],
  },
  {
    name: 'KeyValueGroup',
    variants: [
      {
        id: 'default',
        render: () => (
          <View style={{ paddingHorizontal: spacing.md }}>
            <KeyValueGroup
              rows={[
                { label: 'Account', value: 'developer' },
                { label: 'Session', value: 'default' },
                { label: 'Auth', value: 'Device Key' },
                { label: 'Pane id', value: 'wB:p1', mono: true, copy: true },
                { label: 'Agentico Plugin', value: '0.10.1' },
              ]}
            />
          </View>
        ),
      },
    ],
  },
  { name: 'SearchBar', variants: [{ id: 'default', render: () => <SearchBarDemo /> }] },
  {
    name: 'TextPromptSheet',
    variants: [
      {
        id: 'default',
        render: () => (
          <SheetOpener title="Rename Agent">
            {(close) => (
              <TextPromptSheet
                visible
                title="Rename Agent"
                fieldLabel="Name"
                initialValue="ios-polish"
                hint="Leave empty to fall back to the detected kind (codex)."
                onSave={close}
                onClose={close}
              />
            )}
          </SheetOpener>
        ),
      },
    ],
  },
  {
    name: 'ConnectionSheet',
    variants: [
      {
        id: 'default',
        render: () => (
          <SheetOpener title="Staging VPS">
            {(close) => (
              <ConnectionSheet
                visible
                title="Staging VPS"
                state={{ icon: 'network', label: 'Reconnecting', note: 'Attempt 1' }}
                detail="deploy · 2 routes"
                failure={{
                  title: 'No route reached the Host',
                  detail:
                    '10.0.0.8: Connection timed out;\nstaging.demo.invalid:2222: SSH unavailable',
                }}
                primary={{ label: 'Retry Now', onPress: close }}
                secondary={{ label: 'Stop Connecting', onPress: close }}
                edit={{ label: 'Edit', onPress: close }}
                onClose={close}
              />
            )}
          </SheetOpener>
        ),
      },
    ],
  },
  {
    name: 'PermissionPrimer',
    variants: [
      {
        id: 'default',
        render: () => (
          <SheetOpener title="Turn On Notifications">
            {(close) => (
              <PermissionPrimer
                visible
                onClose={close}
                title="Know when an Agent needs you"
                reasons={[
                  {
                    icon: 'hand',
                    title: 'Get to a request in one tap',
                    message: 'Answer from the notification.',
                  },
                  {
                    icon: 'bell',
                    title: 'Know when it is done',
                    message: 'A notice when an Agent finishes.',
                  },
                  {
                    icon: 'lock',
                    title: 'Only you can read them',
                    message: 'Encrypted on your computer.',
                  },
                ]}
                primary={{ label: 'Enable Notifications', onPress: close }}
                secondary={{ label: 'Not Now', onPress: close }}
                finePrint="You can change this in Settings."
              />
            )}
          </SheetOpener>
        ),
      },
    ],
  },
];
