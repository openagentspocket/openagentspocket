import { useState } from 'react';
import { View } from 'react-native';
import { BackgroundWorkStrip } from '../../components/BackgroundWorkStrip';
import { agentPadKeys, KeyPad } from '../../components/KeyPad';

import { TerminalToolbar } from '../../components/TerminalToolbar';
import { Banner } from '../../primitives/Banner';
import { EmptyState } from '../../primitives/EmptyState';
import { ProgramMark } from '../../primitives/ProgramMark';
import { makeStyles } from '../../theme/theme';
import type { CatalogEntry } from './types';

const noop = () => {};

const useStyles = makeStyles((t) => ({
  pad: { paddingHorizontal: t.spacing.md },
  lifted: { paddingTop: 190 },
  right: { alignItems: 'flex-end' },
}));

function Padded({ children, lifted }: { children: React.ReactNode; lifted?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.pad, lifted && styles.lifted]}>{children}</View>;
}

function DemoKeyPad() {
  const [page, setPage] = useState('agent');
  const [tab, setTab] = useState('keys');
  return (
    <Padded>
      <KeyPad
        pages={[
          { id: 'agent', title: 'Agent', keys: agentPadKeys },
          { id: 'terminal', title: 'Terminal', keys: agentPadKeys },
        ]}
        page={page}
        onPageChange={setPage}
        onKey={noop}
        tabs={[
          { id: 'keys', label: 'Keys', icon: 'keyboard' },
          { id: 'skills', label: 'Skills', icon: 'skills' },
          { id: 'snippets', label: 'Snippets', icon: 'snippets' },
          { id: 'appearance', label: 'Appearance', icon: 'appearance' },
        ]}
        tab={tab}
        onTabChange={setTab}
      />
    </Padded>
  );
}

function Toolbar({ agent, dpad }: { agent?: boolean; dpad?: boolean }) {
  return (
    <Padded lifted={dpad}>
      <TerminalToolbar
        leading={agent ? <ProgramMark program="codex" size={26} /> : undefined}
        onKey={noop}
        onDpad={noop}
        onToggleKeyboard={noop}
        moreItems={[
          { key: 'snippets', title: 'Snippets', onPress: noop },
          { key: 'paste', title: 'Paste', onPress: noop },
          { key: 'clear', title: 'Clear', destructive: true, onPress: noop },
        ]}
        defaultDpadOpen={dpad}
      />
    </Padded>
  );
}

/** Demos of the UX3 group 'blockedTerminal': one entry per component, one variant per catalog variant id. */
export const blockedTerminalEntries: readonly CatalogEntry[] = [
  {
    name: 'BackgroundWorkStrip',
    variants: [
      {
        id: 'default',
        render: () => (
          <Padded>
            <BackgroundWorkStrip
              line={{
                state: 'running',
                text: 'Working for 1m 56s · Thinking · 2 running · 1 done',
              }}
              onOpen={noop}
            />
          </Padded>
        ),
      },
      {
        id: 'waiting',
        render: () => (
          <Padded>
            <BackgroundWorkStrip
              line={{ state: 'waiting', text: 'Working for 4m 2s · Needs you · 1 running' }}
              onOpen={noop}
            />
          </Padded>
        ),
      },
      {
        id: 'work',
        render: () => (
          <Padded>
            <BackgroundWorkStrip
              line={{ state: 'running', text: '1 running · 2 done' }}
              onOpen={noop}
            />
          </Padded>
        ),
      },
    ],
  },
  {
    // The catalog key of Swift's notice banners (docs/ux/components/catalog.json).
    name: 'NoticeBanner',
    variants: [
      {
        id: 'default',
        render: () => (
          <Padded>
            <Banner
              look="row"
              tone="warning"
              icon="warning"
              message="Couldn't read the conversation. Connection timed out."
              actionLabel="Retry"
              onAction={noop}
            />
          </Padded>
        ),
      },
      {
        id: 'locating',
        render: () => <EmptyState busy layout="compact" title="Looking for the conversation..." />,
      },
      {
        id: 'inapp',
        render: () => (
          <Padded>
            <Banner
              look="floating"
              title="storefront-claude"
              message="Needs your approval to run a Bash command."
              icon="hand"
              tone="warning"
              onPress={noop}
              onDismiss={noop}
            />
          </Padded>
        ),
      },
      {
        id: 'inapp-question',
        render: () => (
          <Padded>
            <Banner
              look="floating"
              title="agentico · claude"
              message="Blocked"
              question={'Do you want to make this edit to AgenticoAppModel.swift?'}
              icon="hand"
              tone="warning"
              onPress={noop}
              onDismiss={noop}
            />
          </Padded>
        ),
      },
    ],
  },
  {
    name: 'TerminalToolbar',
    variants: [
      { id: 'default', render: () => <Toolbar agent /> },
      { id: 'dock', render: () => <Toolbar /> },
      { id: 'dpad', render: () => <Toolbar agent dpad /> },
    ],
  },
  { name: 'KeyPad', variants: [{ id: 'default', render: () => <DemoKeyPad /> }] },
];
