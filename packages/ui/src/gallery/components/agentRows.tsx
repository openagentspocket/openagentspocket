import { AgentCard, type AgentCardModel } from '../../components/AgentCard';
import { AgentRowMenu, agentRowActions } from '../../components/AgentRowMenu';
import { FoldHeader } from '../../components/FoldHeader';
import { HostIssueRow } from '../../components/HostIssueRow';
import { TerminalGroup, TerminalRow, TerminalTile } from '../../components/TerminalRow';
import { WorkspaceCard } from '../../components/WorkspaceCard';
import { ActionMenu } from '../../overlay/ActionMenu';
import { Card } from '../../primitives/Card';
import type { CatalogEntry } from './types';

const noop = () => {};

const blocked: AgentCardModel = {
  title: 'Checkout',
  program: 'claude',
  status: 'blocked',
  blockedPrompt: 'Run the targeted UI test before commit?',
  subtitle: 'Checkout review',
  host: 'Build Server',
  path: '/workspace/storefront',
  diff: { added: 12, removed: 7 },
};
const working: AgentCardModel = {
  title: 'Payments API',
  program: 'codex',
  status: 'working',
  subtitle: 'Harden webhook retries',
  host: 'Build Server',
  path: '/workspace/payments-api',
  diff: { added: 5, removed: 1 },
};
const idle: AgentCardModel = {
  title: 'Product Docs',
  program: 'claude',
  status: 'idle',
  subtitle: 'Refresh the setup guide',
  host: 'Studio Mac',
  path: '/workspace/product-docs',
  diff: { added: 1, removed: 1 },
  contextLeft: '16 %',
};

const actions = agentRowActions({ onPin: noop, onDetails: noop, onClose: noop });
const cardProps = {
  menu: actions.menu,
  leadingSwipeActions: actions.leading,
  swipeActions: actions.trailing,
  onPress: noop,
};

/** Demos of the UX3 group 'agentRows' (owned by its UX3 task): one entry per component, one variant per catalog variant id. */
export const agentRowsEntries: readonly CatalogEntry[] = [
  {
    name: 'AgentCard',
    variants: [
      { id: 'default', render: () => <AgentCard agent={blocked} {...cardProps} /> },
      { id: 'working', render: () => <AgentCard agent={working} {...cardProps} /> },
      { id: 'idle-context', render: () => <AgentCard agent={idle} {...cardProps} /> },
      {
        id: 'wide',
        render: () => <AgentCard agent={working} presentation="card" selected {...cardProps} />,
      },
      {
        id: 'saved',
        render: () => (
          <AgentCard
            agent={{ ...idle, contextLeft: undefined, saved: true }}
            presentation="card"
            showProgramName
            {...cardProps}
          />
        ),
      },
    ],
  },
  {
    name: 'FoldHeader',
    variants: [
      {
        id: 'status',
        render: () => <FoldHeader kind="status" title="Needs you" count={1} onToggle={noop} />,
      },
      {
        id: 'host',
        render: () => (
          <FoldHeader kind="host" title="Studio Mac" readiness="Ready" onToggle={noop} />
        ),
      },
      {
        id: 'host-collapsed',
        render: () => (
          <FoldHeader
            kind="host"
            title="Studio Mac"
            collapsed
            onToggle={noop}
            pills={[
              { status: 'working', label: '2 working' },
              { status: 'blocked', label: '1 blocked' },
            ]}
          />
        ),
      },
      { id: 'inbox', render: () => <FoldHeader kind="inbox" title="Needs you" count={1} /> },
      {
        id: 'see-all',
        render: () => <FoldHeader kind="footer" title="1 idle" onSeeAll={noop} />,
      },
    ],
  },
  {
    name: 'WorkspaceCard',
    variants: [
      {
        id: 'default',
        render: () => (
          <WorkspaceCard
            workspace={{
              title: 'iOS App',
              subtitle: 'Studio Mac · /workspace/agentico',
              agentCount: 2,
            }}
            onToggle={noop}
          >
            <AgentCard
              presentation="plain"
              agent={{
                ...idle,
                title: 'Audit VoiceOver labels',
                status: 'done',
                contextLeft: undefined,
                subtitle: undefined,
                host: undefined,
                path: undefined,
                diff: { added: 2, removed: 2 },
              }}
            />
            <AgentCard
              presentation="plain"
              agent={{
                ...working,
                title: 'Polish the Attach experience',
                subtitle: undefined,
                host: undefined,
                path: undefined,
                diff: { added: 2, removed: 2 },
              }}
            />
          </WorkspaceCard>
        ),
      },
      {
        id: 'collapsed',
        render: () => (
          <WorkspaceCard
            workspace={{ title: 'iOS App', subtitle: 'Studio Mac', agentCount: 2, collapsed: true }}
            onToggle={noop}
          />
        ),
      },
    ],
  },
  {
    name: 'TerminalRow',
    variants: [
      {
        id: 'default',
        render: () => (
          <TerminalGroup onNewTerminal={noop}>
            <TerminalRow
              terminal={{ title: 'landing', path: '~/workspace/agentico/landing' }}
              onPress={noop}
            />
            <TerminalRow terminal={{ title: '3', path: '~/workspace/agentico' }} onPress={noop} />
          </TerminalGroup>
        ),
      },
      {
        id: 'tile',
        render: () => (
          <TerminalTile terminal={{ title: 'landing', path: '~/workspace/agentico/landing' }} />
        ),
      },
    ],
  },
  {
    name: 'AgentRowMenu',
    variants: [
      {
        id: 'default',
        render: () => (
          <AgentRowMenu
            visible
            inline
            preview={
              <Card>
                <AgentCardPreview />
              </Card>
            }
            items={actions.menu}
            onClose={noop}
          />
        ),
      },
      {
        id: 'action-menu-preview',
        render: () => (
          <ActionMenu
            visible
            inline
            preview={
              <Card>
                <AgentCardPreview />
              </Card>
            }
            items={actions.menu}
            onClose={noop}
          />
        ),
      },
    ],
  },
  {
    name: 'HostIssueRow',
    variants: [
      {
        id: 'default',
        render: () => (
          <HostIssueRow
            onOpen={noop}
            issues={[
              { hostName: 'Staging VPS', kind: 'offline' },
              { hostName: 'Raspberry Pi', kind: 'offline' },
            ]}
          />
        ),
      },
      {
        id: 'summary',
        render: () => (
          <HostIssueRow
            onOpen={noop}
            issues={[
              { hostName: 'Staging VPS', kind: 'offline' },
              { hostName: 'Raspberry Pi', kind: 'offline' },
              { hostName: 'Studio Mac', kind: 'offline' },
            ]}
          />
        ),
      },
    ],
  },
];

function AgentCardPreview() {
  return <AgentCard agent={working} presentation="plain" />;
}
