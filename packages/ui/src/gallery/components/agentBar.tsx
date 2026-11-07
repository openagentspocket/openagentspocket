import { useState } from 'react';
import { View } from 'react-native';
import {
  AgentHeader,
  ChangeRow,
  ChangeSection,
  ComposerCard,
  type ComposerCardProps,
  type DrawerWorkspace,
  SessionDrawer,
  StatusLine,
} from '../../components/agentBar';
import type { ActionMenuItem } from '../../overlay/ActionMenu';
import { ProgramMark } from '../../primitives/ProgramMark';
import type { CatalogEntry } from './types';

const noop = () => {};
const menu: readonly ActionMenuItem[] = [
  { key: 'terminal', title: 'Terminal', icon: 'terminal', onPress: noop },
  { key: 'changes', title: 'Changes', icon: 'branch', onPress: noop },
  { key: 'files', title: 'Files', icon: 'folder', onPress: noop },
];
const addMenu: readonly ActionMenuItem[] = [
  { key: 'file', title: 'Add File', icon: 'file', onPress: noop },
  { key: 'image', title: 'Add Image', icon: 'camera', onPress: noop },
];

const workspaces: readonly DrawerWorkspace[] = [
  {
    id: 'w1',
    title: 'iOS App',
    branch: 'attach-polish',
    items: [
      { id: 'landing', kind: 'shell', title: 'landing' },
      { id: 'three', kind: 'shell', title: '3' },
      {
        id: 'polish',
        kind: 'agent',
        program: 'codex',
        title: 'ios-polish',
        age: '7m',
        status: 'working',
      },
      {
        id: 'a11y',
        kind: 'agent',
        program: 'codex',
        title: 'accessibility',
        age: '25m',
        status: 'done',
      },
    ],
  },
  {
    id: 'w2',
    title: 'Product Docs',
    items: [{ id: 'docs', kind: 'agent', program: 'claude', title: 'docs-review', status: 'idle' }],
  },
];

const skills = [
  { name: '/code-review', description: 'Review the current diff for correctness and style.' },
  { name: '/write-tests', description: 'Add focused tests for the code you just changed.' },
  { name: '/release-notes', description: 'Draft release notes from the merged changes.' },
];

function DemoComposer({ initial, ...rest }: { initial: string } & Partial<ComposerCardProps>) {
  const [value, setValue] = useState(initial);
  return (
    <ComposerCard
      value={value}
      onChange={setValue}
      onSend={noop}
      onStop={noop}
      leading={<ProgramMark program="codex" size={22} surface="control" />}
      addMenu={addMenu}
      {...rest}
    />
  );
}

const file = (name: string) => (
  <ChangeRow
    key={name}
    file={{ name, dir: 'Sources/Attach', added: 1, removed: 1, kind: 'M' }}
    onPress={noop}
  />
);

const inset = { paddingHorizontal: 0 } as const;

/** Demos of the UX3 group 'agentBar'. */
export const agentBarEntries: readonly CatalogEntry[] = [
  {
    name: 'AgentHeader',
    variants: [
      {
        id: 'default',
        render: () => (
          <AgentHeader
            onSidebar={noop}
            menu={menu}
            eyebrow="Studio Mac · Claude Code"
            title="Checkout flow review"
            branch="checkout-review"
            diff={{ added: 12, removed: 3 }}
            onOpenChanges={noop}
            titleMenu={menu}
          />
        ),
      },
      {
        id: 'chat',
        render: () => (
          <AgentHeader
            onSidebar={noop}
            menu={menu}
            branch="checkout-review"
            diff={{ added: 12, removed: 3 }}
            onOpenChanges={noop}
            sidebarDot
          />
        ),
      },
      {
        id: 'slow-link',
        render: () => (
          <AgentHeader
            onSidebar={noop}
            menu={menu}
            eyebrow="Studio Mac · Claude Code"
            title="Checkout flow review"
            branch="checkout-review"
            note="850 ms"
          />
        ),
      },
    ],
  },
  {
    name: 'SessionDrawer',
    variants: [
      {
        id: 'default',
        render: () => (
          <SessionDrawer
            host={{ name: 'Studio Mac', summary: '3 Agents · 2 shells', status: 'done' }}
            workspaces={workspaces}
            selectedId="polish"
            onSelect={noop}
            onAdd={noop}
          />
        ),
      },
    ],
  },
  {
    name: 'ComposerCard',
    variants: [
      { id: 'default', render: () => <DemoComposer initial="" working /> },
      {
        id: 'expanded',
        render: () => <DemoComposer initial="" working expanded moreMenu={menu} />,
      },
      { id: 'skills', render: () => <DemoComposer initial="/" skills={skills} moreMenu={menu} /> },
    ],
  },
  {
    name: 'StatusLine',
    variants: [
      {
        id: 'default',
        render: () => (
          <StatusLine
            status="working"
            branch="attach-polish"
            counts={{ behind: 1, ahead: 3, conflicts: 1, staged: 2, changed: 2 }}
            diff={{ added: 2, removed: 2 }}
            latencyMs={0.4}
          />
        ),
      },
      {
        id: 'low-context',
        render: () => (
          <StatusLine
            status="idle"
            branch="attach-polish"
            counts={{ behind: 2, ahead: 1, untracked: 1, changed: 1 }}
            diff={{ added: 1, removed: 1 }}
            contextLeft={16}
            latencyMs={0.4}
          />
        ),
      },
    ],
  },
  {
    name: 'ChangeRow',
    variants: [
      {
        id: 'summary',
        render: () => (
          <View style={inset}>
            <ChangeRow
              summary={{
                repo: 'agentico',
                worktree: true,
                added: 2,
                removed: 2,
                branch: 'attach-polish',
                counts: { behind: 1, ahead: 3 },
                lastCommit: { subject: 'Name the attach controls for…', age: '3 hours ago' },
                possiblyIncompleteAt: '00:18',
              }}
            />
          </View>
        ),
      },
      {
        id: 'file',
        render: () => (
          <View style={inset}>
            <ChangeSection title="Changes" count={2}>
              {file('AttachChrome.swift')}
              {file('SpokenLabels.swift')}
            </ChangeSection>
          </View>
        ),
      },
    ],
  },
];
