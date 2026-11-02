import { useState } from 'react';
import { View } from 'react-native';
import { EmptyDetail } from '../../components/EmptyDetail';
import { KeyValueGroup } from '../../components/KeyValueGroup';
import { ListToolbar } from '../../components/ListToolbar';
import { QuickSheetHeader } from '../../components/QuickSheetHeader';
import { ScannerFrame } from '../../components/ScannerFrame';
import { SidebarColumn } from '../../components/SidebarColumn';
import { ListRow } from '../../primitives/ListRow';
import { MetaChip } from '../../primitives/MetaChip';
import { ProgramMark } from '../../primitives/ProgramMark';
import { Text } from '../../primitives/Text';
import type { CatalogEntry } from './types';

const noop = () => {};
const items = (keys: readonly string[]) =>
  keys.map((key, index) => ({ key, title: key, checked: index === 0, onPress: noop }));

function SidebarDemo() {
  const [search, setSearch] = useState('');
  return (
    <View style={{ height: 520, alignItems: 'center' }}>
      <SidebarColumn
        title="Agents"
        titleItems={items(['Agents', 'Terminals'])}
        onNew={noop}
        onHide={noop}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search Agents"
        footerStart={[
          { key: 'hosts', icon: 'server', label: 'Hosts', onPress: noop },
          { key: 'settings', icon: 'settings', label: 'Settings', onPress: noop },
        ]}
        footerEnd={[
          { key: 'host', icon: 'filter', label: 'Host filter', items: items(['All Hosts']) },
          { key: 'presentation', icon: 'list', label: 'Presentation', items: items(['Flat']) },
        ]}
      >
        <ListRow
          selected
          leading={<ProgramMark program="claude" status="blocked" size={18} />}
          title="Checkout"
          subtitle="/workspace/storefront"
          value="Blocked"
        />
        <ListRow
          leading={<ProgramMark program="codex" status="working" size={18} />}
          title="Payments API"
          subtitle="/workspace/payments-api"
          value="Working"
        />
        <ListRow
          leading={<ProgramMark program="claude" status="idle" size={18} />}
          title="Product Docs"
          subtitle="/workspace/product-docs"
          value="Idle"
        />
      </SidebarColumn>
    </View>
  );
}

export const navSheetsEntries: readonly CatalogEntry[] = [
  {
    name: 'ListToolbar',
    variants: [
      {
        id: 'default',
        render: () => (
          <ListToolbar
            presentation="flat"
            presentationItems={items(['Flat', 'By Host', 'By Status', 'By Workspace'])}
            hostItems={items(['All Hosts', 'Studio Mac', 'Build Server'])}
            onHome={noop}
            onNew={noop}
          />
        ),
      },
    ],
  },
  { name: 'SidebarColumn', variants: [{ id: 'default', render: () => <SidebarDemo /> }] },
  {
    name: 'EmptyDetail',
    variants: [
      {
        id: 'default',
        render: () => (
          <EmptyDetail
            title="No Agent Selected"
            message="Choose an Agent or start a new one to view its live terminal."
            action={{ label: 'New Agent', shortcut: '⌘N', onPress: noop }}
          />
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
          <View style={{ paddingHorizontal: 21 }}>
            <QuickSheetHeader title="Usage" onClose={noop} />
          </View>
        ),
      },
      {
        id: 'detail',
        render: () => (
          <View style={{ paddingHorizontal: 21 }}>
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
                  <MetaChip label="Studio Mac" />
                  <MetaChip label="agentico" />
                </>
              }
            />
          </View>
        ),
      },
    ],
  },
  {
    name: 'ScannerFrame',
    variants: [
      {
        id: 'unavailable',
        render: () => <ScannerFrame state="unavailable" onPaste={noop} onManual={noop} />,
      },
      {
        id: 'scanning',
        render: () => <ScannerFrame state="scanning" onPaste={noop} onManual={noop} />,
      },
      {
        id: 'denied',
        render: () => (
          <ScannerFrame state="denied" onPaste={noop} onManual={noop} onOpenSettings={noop} />
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
          <View style={{ paddingHorizontal: 21 }}>
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
];
