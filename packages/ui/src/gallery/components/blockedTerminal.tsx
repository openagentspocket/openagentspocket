import { useState } from 'react';
import { View } from 'react-native';
import { type BackgroundWorkItem, BackgroundWorkStrip } from '../../components/BackgroundWorkStrip';
import { agentPadKeys, KeyPad } from '../../components/KeyPad';
import { NoticeBanner } from '../../components/NoticeBanner';
import { TerminalToolbar } from '../../components/TerminalToolbar';
import { ProgramMark } from '../../primitives/ProgramMark';
import { makeStyles } from '../../theme/theme';
import type { CatalogEntry } from './types';

const noop = () => {};

const useStyles = makeStyles((t) => ({
  pad: { paddingHorizontal: t.spacing.md },
  lifted: { paddingTop: 190 },
  right: { alignItems: 'flex-end' },
}));

const work: readonly BackgroundWorkItem[] = [
  {
    id: 'a',
    title: 'Find old pairing steps',
    caption: 'Explore',
    state: 'running',
    meta: '4m 13s',
  },
  {
    id: 'b',
    title: 'docs-audit',
    caption: 'Audit',
    state: 'running',
    fraction: { done: 2, total: 3 },
    meta: '4m 4s',
    monospaced: true,
  },
  { id: 'c', title: 'Check screenshots', caption: 'Subagent', state: 'completed', meta: '2m 4s' },
];

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
              items={work}
              summary={{ state: 'running', text: '1 running · Find other retry callers' }}
              onOpen={noop}
            />
          </Padded>
        ),
      },
      {
        id: 'expanded',
        render: () => (
          <Padded>
            <BackgroundWorkStrip items={work} overflow={1} onOpen={noop} />
          </Padded>
        ),
      },
    ],
  },
  {
    name: 'NoticeBanner',
    variants: [
      {
        id: 'default',
        render: () => (
          <Padded>
            <NoticeBanner
              message="Couldn't read the conversation. Connection timed out."
              action={{ label: 'Retry', onPress: noop }}
            />
          </Padded>
        ),
      },
      {
        id: 'locating',
        render: () => <NoticeBanner kind="locating" message="Looking for the conversation..." />,
      },
      {
        id: 'inapp',
        render: () => (
          <Padded>
            <NoticeBanner
              kind="inapp"
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
            <NoticeBanner
              kind="inapp"
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
