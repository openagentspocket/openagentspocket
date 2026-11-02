import { type FileDiffStore, lineCountsSummary } from '@openagentspocket/core';
import {
  Banner,
  Button,
  Chip,
  ChipRow,
  DiffView,
  EmptyState,
  ErrorState,
  Screen,
  SkeletonRows,
  Text,
} from '@openagentspocket/ui';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions } from 'react-native';
import { diffLines, isEmptyPatch } from './diffLines';
import { changesStoreFor } from './registry';
import { say } from './say';
import { useStoreState } from './useStoreState';

/** Side by side needs two readable columns. */
const SPLIT_MIN_WIDTH = 600;

function DiffContent({ diff, width: given }: { diff: FileDiffStore; width?: number }) {
  const [layout, setLayout] = useState<'unified' | 'split'>('unified');
  const window = useWindowDimensions();
  const width = given ?? window.width;
  const state = useStoreState(diff);
  const { phase } = state;
  useEffect(() => {
    void diff.appear();
  }, [diff]);
  const files = phase.kind === 'loaded' ? phase.patch.files : null;
  const lines = useMemo(() => (files ? diffLines(files) : []), [files]);

  if (phase.kind === 'failed') {
    return (
      <ErrorState
        summary={say("Couldn't Read Diff")}
        recovery={phase.message}
        onRetry={() => void diff.reload()}
        retryLabel={say('Try Again')}
        testID="diff-failure"
      />
    );
  }
  if (!files) return <SkeletonRows accessibilityLabel={say('Reading Diff…')} />;
  const canSplit = width >= SPLIT_MIN_WIDTH;
  return (
    <>
      {state.listChange ? (
        <Banner
          tone="warning"
          title={
            state.listChange === 'removed'
              ? say('This file is no longer in Changes.')
              : say('This file changed since this diff was read.')
          }
          actionLabel={say('Reload')}
          onAction={() => void diff.reload()}
          testID="diff-list-change"
        />
      ) : null}
      {state.refreshError ? <Banner tone="danger" title={state.refreshError} /> : null}
      {canSplit ? (
        <ChipRow>
          <Chip
            mono={false}
            label={say('Unified')}
            selected={layout === 'unified'}
            onPress={() => setLayout('unified')}
            testID="layout-unified"
          />
          <Chip
            mono={false}
            label={say('Side by Side')}
            selected={layout === 'split'}
            onPress={() => setLayout('split')}
            testID="layout-split"
          />
        </ChipRow>
      ) : null}
      {isEmptyPatch(files) ? (
        <EmptyState layout="compact" icon="success" title={say('No changes in this file.')} />
      ) : (
        <DiffView
          diff={lines}
          layout={canSplit ? layout : 'unified'}
          addedLabel={(line) => (line === undefined ? say('Added') : say('Added, line %@', line))}
          removedLabel={(line) =>
            line === undefined ? say('Removed') : say('Removed, line %@', line)
          }
          unchangedLabel={(line) =>
            line === undefined ? say('Unchanged') : say('Unchanged, line %@', line)
          }
        />
      )}
      {state.truncation === 'canLoadMore' ? (
        <>
          <Text variant="caption" tone="secondary">
            {say('Showing the first part of this diff.')}
          </Text>
          <Button kind="secondary" title={say('Load More')} onPress={() => void diff.loadMore()} />
        </>
      ) : null}
      {state.truncation === 'tooLarge' ? (
        <Text variant="caption" tone="secondary" testID="diff-too-large">
          {say('This file is too large to display in full.')}
          {state.file.lineCounts ? ` ${lineCountsSummary(state.file.lineCounts, say)}` : ''}
        </Text>
      ) : null}
    </>
  );
}

function Body({ agentId, width }: { agentId: string; width?: number }) {
  const store = changesStoreFor(agentId);
  const diff = useStoreState(store.fileDiff).current;
  useEffect(() => {
    // The diff pushed over the list keeps the status stream alive with the list.
    return store.followAgentStatus();
  }, [store]);
  if (!diff) return <EmptyState icon="file" title={say('This file is no longer in Changes.')} />;
  return <DiffContent diff={diff} width={width} />;
}

/**
 * changes.file-diff: one file's patch, unified or side by side, with Reload and Load More.
 * `width` overrides the window width the layout toggle is decided by (tests, split view).
 */
export function FileDiffScreen({ agentId, width }: { agentId: string; width?: number }) {
  return (
    <Screen edges={['left', 'right', 'bottom']} testID="file-diff-screen">
      <Body agentId={agentId} width={width} />
    </Screen>
  );
}
