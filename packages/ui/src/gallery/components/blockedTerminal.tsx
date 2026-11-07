import { useState } from 'react';
import { View } from 'react-native';
import { type BackgroundWorkItem, BackgroundWorkStrip } from '../../components/BackgroundWorkStrip';
import { type BlockedBody, BlockedCard } from '../../components/BlockedCard';
import { JumpControl } from '../../components/JumpControl';
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

const bashBody: BlockedBody = {
  kind: 'prompt',
  description: 'Run the declined card UI test',
  code: 'swift test --filter CheckoutUITests/testDeclinedPaymentKeepsTheCart',
  options: [
    { id: 'yes', label: 'Yes', kind: 'primary', onPress: noop },
    {
      id: 'always',
      label: "Yes, and don't ask again for swift test commands in /workspace/storefront",
      warning: "Saves a rule, so this isn't asked again.",
      onPress: noop,
    },
    { id: 'no', label: 'No', kind: 'destructive', onPress: noop },
  ],
  onNote: noop,
};

const questionBody: BlockedBody = {
  kind: 'prompt',
  options: [
    { id: 'staging', label: 'Staging', onPress: noop },
    { id: 'local', label: 'Local', onPress: noop },
  ],
  question: { fieldLabel: 'Something else', placeholder: 'Type an answer', onSubmit: noop },
};

const genericBody: BlockedBody = {
  kind: 'excerpt',
  text: 'The build cache is out of date.\n\n  1. Rebuild it\n  2. Keep going',
  options: [
    { id: '1', label: '1. Rebuild it', onPress: noop },
    { id: '2', label: '2. Keep going', onPress: noop },
  ],
};

const unreadableBody: BlockedBody = {
  kind: 'keys',
  message: "The Agent is waiting on something Agentico can't read.",
  keys: [
    { id: 'up', label: '↑', onPress: noop },
    { id: 'down', label: '↓', onPress: noop },
    { id: 'enter', label: 'Enter', onPress: noop },
    { id: 'esc', label: 'Escape', onPress: noop },
  ],
};

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

function DemoBlocked({
  title = 'Bash command',
  collapsed,
  body,
}: {
  title?: string;
  collapsed?: boolean;
  body: BlockedBody;
}) {
  const [folded, setFolded] = useState(collapsed ?? false);
  return (
    <Padded>
      <BlockedCard
        title={title}
        body={body}
        collapsed={folded}
        onToggleCollapsed={() => setFolded((value) => !value)}
      />
    </Padded>
  );
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
    name: 'BlockedCard',
    variants: [
      { id: 'default', render: () => <DemoBlocked body={bashBody} /> },
      { id: 'collapsed', render: () => <DemoBlocked body={bashBody} collapsed /> },
      {
        id: 'question',
        render: () => (
          <DemoBlocked title="Which database should the migration target?" body={questionBody} />
        ),
      },
      { id: 'generic', render: () => <DemoBlocked title="Question" body={genericBody} /> },
      { id: 'unreadable', render: () => <DemoBlocked title="Keys" body={unreadableBody} /> },
    ],
  },
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
    name: 'JumpControl',
    variants: [
      {
        id: 'default',
        render: () => (
          <Padded>
            <JumpControl visible onJumpLatest={noop} onPrevious={noop} onNext={noop} />
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
