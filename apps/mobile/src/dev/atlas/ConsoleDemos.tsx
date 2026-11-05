import { HostConnectionSheet } from '@/features/hosts/HostConnectionSheet';
import { useNewAgentServices } from '@/features/new-agent/services';
import { WorktreeDetailsScreen } from '@/features/new-agent/WorktreeDetailsScreen';
import {
  type TerminalsGroupModel,
  TerminalsListScreen,
} from '@/features/terminals/TerminalsListScreen';
import { noop } from './atlasHelpers';

/** Worktree Details for the demo Agent that runs in a linked worktree (pane p4). */
export function WorktreeDemo() {
  const options = useNewAgentServices().worktreeDetail('demo', 'p4');
  if (!options) return null;
  return (
    <WorktreeDetailsScreen
      options={{ ...options, showChanges: noop }}
      onRemoved={noop}
      onDone={noop}
    />
  );
}

const GROUPS: readonly TerminalsGroupModel[] = [
  {
    id: 'app',
    workspace: 'iOS App',
    host: 'Studio Mac',
    terminals: [
      { title: 'landing', path: '~/workspace/agentico/landing' },
      { title: '3', path: '~/workspace/agentico' },
    ],
  },
  { id: 'docs', workspace: 'Product Docs', host: 'Studio Mac', terminals: [] },
  { id: 'checkout', workspace: 'Checkout', host: 'Build Server', terminals: [] },
  {
    id: 'payments',
    workspace: 'Payments API',
    host: 'Build Server',
    terminals: [
      { title: 'logs', path: '/var/log/payments' },
      { title: '3', path: '~' },
    ],
  },
];

/** The shell terminals list with fixed groups (no RN store lists shell panes yet). */
export function TerminalsDemo() {
  return <TerminalsListScreen groups={GROUPS} onHome={noop} onNew={noop} />;
}

/** The connection sheet of an offline Host, reconnecting (opened over Home). */
export function HostConnectionDemo() {
  return (
    <HostConnectionSheet
      visible
      hostName="Staging VPS"
      attempt={1}
      routes="deploy · 2 routes"
      failure={{
        title: 'No route reached the Host',
        detail: '10.0.0.8: Connection timed out;\nstaging.demo.invalid:2222: SSH unavailable',
      }}
      onRetry={noop}
      onStop={noop}
      onEdit={noop}
      onClose={noop}
    />
  );
}
