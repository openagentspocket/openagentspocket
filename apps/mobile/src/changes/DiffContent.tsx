import {
  type ChangedFile,
  type FileDiffStore,
  fileDetail,
  kindSymbol,
  lineCountsSummary,
} from '@openagentspocket/core';
import {
  Badge,
  Banner,
  Button,
  Chip,
  ChipRow,
  DiffView,
  EmptyState,
  ErrorState,
  makeStyles,
  SkeletonRows,
  Text,
} from '@openagentspocket/ui';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { diffLines, isEmptyPatch } from './diffLines';
import { say } from './say';
import { useStoreState } from './useStoreState';

const useStyles = makeStyles((t) => ({
  fileBar: { flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs },
  grow: { flex: 1 },
  counts: { flexDirection: 'row', gap: t.spacing.xxs },
}));

/** The file's status line under the bar: change letter, "Modified · Unstaged" and +N -N. */
export function FileBar({ file }: { file: ChangedFile }) {
  const styles = useStyles();
  const counts = file.lineCounts?.kind === 'lines' ? file.lineCounts : null;
  return (
    <View style={styles.fileBar} testID="diff-file-bar">
      <Badge label={kindSymbol(file.kind)} kind="control" />
      <Text variant="subheadline" tone="secondary" style={styles.grow} numberOfLines={1}>
        {fileDetail(file, say)}
      </Text>
      {counts ? (
        <View style={styles.counts}>
          <Text variant="footnote" monospaced semibold tone="success">{`+${counts.added}`}</Text>
          <Text variant="footnote" monospaced semibold tone="danger">{`−${counts.removed}`}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Side by side needs two readable columns. */
const SPLIT_MIN_WIDTH = 600;

export function DiffContent({ diff, width: given }: { diff: FileDiffStore; width?: number }) {
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
          <Text variant="footnote" tone="secondary">
            {say('Showing the first part of this diff.')}
          </Text>
          <Button kind="secondary" title={say('Load More')} onPress={() => void diff.loadMore()} />
        </>
      ) : null}
      {state.truncation === 'tooLarge' ? (
        <Text variant="footnote" tone="secondary" testID="diff-too-large">
          {say('This file is too large to display in full.')}
          {state.file.lineCounts ? ` ${lineCountsSummary(state.file.lineCounts, say)}` : ''}
        </Text>
      ) : null}
    </>
  );
}
