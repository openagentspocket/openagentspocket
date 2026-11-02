import { useState } from 'react';
import { View } from 'react-native';
import { type BackgroundWorkItem, BackgroundWorkStrip } from '../../components/BackgroundWorkStrip';
import { BlockedCard, type BlockedPrompt } from '../../components/BlockedCard';
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

const bashPrompt: BlockedPrompt = {
  title: 'Bash command',
  description: 'Run the declined card UI test',
  code: 'swift test --filter CheckoutUITests/testDeclinedPaymentKeepsTheCart',
  options: [
    { id: 'yes', label: 'Yes', kind: 'primary' },
    {
      id: 'always',
      label: "Yes, and don't ask again for swift test commands in /workspace/storefront",
      warning: "Saves a rule, so this isn't asked again.",
    },
    { id: 'no', label: 'No', kind: 'destructive' },
  ],
};

const questionPrompt: BlockedPrompt = {
  title: 'Which database should the migration target?',
  options: [
    { id: 'staging', label: 'Staging' },
    { id: 'local', label: 'Local' },
  ],
  question: { fieldLabel: 'Something else', placeholder: 'Type an answer' },
};

const work: readonly BackgroundWorkItem[] = [
  {
    id: 'a',
    title: 'Find old pairing steps',
    kind: 'Explore',
    state: 'running',
    elapsed: '4m 13s',
  },
  {
    id: 'b',
    title: 'docs-audit',
    kind: 'Audit',
    state: 'running',
    progress: { done: 2, total: 3 },
    elapsed: '4m 4s',
    monospaced: true,
  },
  { id: 'c', title: 'Check screenshots', kind: 'general-purpose', state: 'done', elapsed: '2m 4s' },
  { id: 'd', title: 'Read the roadmap', kind: 'Explore', state: 'done', elapsed: '1m 2s' },
];

function Padded({ children, lifted }: { children: React.ReactNode; lifted?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.pad, lifted && styles.lifted]}>{children}</View>;
}

function DemoBlocked({ collapsed, prompt }: { collapsed?: boolean; prompt: BlockedPrompt }) {
  const [folded, setFolded] = useState(collapsed ?? false);
  return (
    <Padded>
      <BlockedCard
        prompt={prompt}
        collapsed={folded}
        onToggleCollapsed={() => setFolded((value) => !value)}
        onChoose={noop}
        onNote={noop}
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
      { id: 'default', render: () => <DemoBlocked prompt={bashPrompt} /> },
      { id: 'collapsed', render: () => <DemoBlocked prompt={bashPrompt} collapsed /> },
      { id: 'question', render: () => <DemoBlocked prompt={questionPrompt} /> },
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
              items={[{ ...work[0], title: 'Find other retry callers' } as BackgroundWorkItem]}
              onOpen={noop}
            />
          </Padded>
        ),
      },
      {
        id: 'expanded',
        render: () => (
          <Padded>
            <BackgroundWorkStrip items={work} expanded onOpen={noop} />
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
