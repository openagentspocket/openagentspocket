import { type ChangedFile, fileName } from '@openagentspocket/core';
import { EmptyState, Screen, SheetBar } from '@openagentspocket/ui';
import { useEffect } from 'react';
import { DiffContent, FileBar } from './DiffContent';
import { changesStoreFor } from './registry';
import { say } from './say';
import { useStoreState } from './useStoreState';

function Body({ agentId, width }: { agentId: string; width?: number }) {
  const store = changesStoreFor(agentId);
  const diff = useStoreState(store.fileDiff).current;
  useEffect(() => {
    // The diff pushed over the list keeps the status stream alive with the list.
    return store.followAgentStatus();
  }, [store]);
  if (!diff) return <EmptyState icon="file" title={say('This file is no longer in Changes.')} />;
  return (
    <>
      <FileBar file={diff.getState().file} />
      <DiffContent diff={diff} width={width} />
    </>
  );
}

function fileTitle(file: ChangedFile | undefined): string {
  return file ? fileName(file) : say('Changes');
}

/**
 * changes.file-diff: one file's patch, unified or side by side, with Reload and Load More.
 * `width` overrides the window width the layout toggle is decided by (tests, split view).
 */
export function FileDiffScreen({
  agentId,
  width,
  onBack,
}: {
  agentId: string;
  width?: number;
  onBack?: () => void;
}) {
  const current = useStoreState(changesStoreFor(agentId).fileDiff).current;
  const file = current?.getState().file;
  const bar = (
    <SheetBar
      title={fileTitle(file)}
      back
      leading={{ label: say('Changes'), onPress: onBack ?? (() => {}), testID: 'diff-back' }}
    />
  );
  return (
    <Screen header={bar} edges={['left', 'right', 'bottom']} testID="file-diff-screen">
      <Body agentId={agentId} width={width} />
    </Screen>
  );
}
