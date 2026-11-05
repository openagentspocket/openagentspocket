import { useNewAgentServices } from '@/features/new-agent/services';
import { WorktreeDetailsScreen } from '@/features/new-agent/WorktreeDetailsScreen';
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
