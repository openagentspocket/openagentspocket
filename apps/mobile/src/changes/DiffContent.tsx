import {
  type ChangedFile,
  type DiffFile,
  type FileDiffStore,
  fileDetail,
  kindSymbol,
  lineCountsSummary,
} from '@openagentspocket/core';
import {
  AsyncContent,
  Banner,
  Button,
  Chip,
  ChipRow,
  DiffRow,
  EmptyState,
  layoutModeFor,
  makeStyles,
  Text,
  useStoreState,
} from '@openagentspocket/ui';
import { useEffect, useMemo, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import { diffHunks, isEmptyPatch, noteText, patchFileTitle } from './diffLines';
import { say } from './say';

const useStyles = makeStyles((t) => ({
  padded: { padding: t.metrics.screenInset, gap: t.spacing.sm },
  note: { paddingHorizontal: t.metrics.screenInset, paddingVertical: t.spacing.xs },
}));

const TONES = {
  modified: 'warning',
  added: 'success',
  deleted: 'danger',
  renamed: 'info',
  untracked: 'info',
  conflicted: 'danger',
} as const;

function badgeFor(file: ChangedFile, patch: DiffFile, single: boolean) {
  const counts = file.lineCounts?.kind === 'lines' ? file.lineCounts : null;
  const lines = patch.hunks.flatMap((hunk) => hunk.lines);
  return {
    letter: kindSymbol(file.kind),
    tone: TONES[file.kind],
    title: single ? fileDetail(file, say) : patchFileTitle(patch),
    added: counts ? Number(counts.added) : lines.filter((l) => l.kind === 'added').length,
    removed: counts ? Number(counts.removed) : lines.filter((l) => l.kind === 'removed').length,
  };
}

/** Side by side needs two readable columns. */

export function DiffContent({ diff, width: given }: { diff: FileDiffStore; width?: number }) {
  const styles = useStyles();
  const [layout, setLayout] = useState<'unified' | 'split'>('unified');
  const window = useWindowDimensions();
  const width = given ?? window.width;
  const state = useStoreState(diff);
  const { phase } = state;
  useEffect(() => {
    void diff.appear();
  }, [diff]);
  const files = phase.kind === 'loaded' ? phase.patch.files : null;
  const hunks = useMemo(() => (files ? files.map(diffHunks) : []), [files]);

  if (phase.kind === 'failed' || !files) {
    return (
      <AsyncContent
        loading={phase.kind !== 'failed'}
        loadingLabel={say('Reading Diff…')}
        failure={
          phase.kind === 'failed'
            ? {
                summary: say("Couldn't Read Diff"),
                recovery: phase.message,
                onRetry: () => void diff.reload(),
                retryLabel: say('Try Again'),
                testID: 'diff-failure',
              }
            : null
        }
      >
        {null}
      </AsyncContent>
    );
  }
  const canSplit = layoutModeFor(width) !== 'compact';
  return (
    <View testID="diff-content">
      <View style={styles.padded}>
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
      </View>
      {isEmptyPatch(files) ? (
        <EmptyState layout="compact" icon="success" title={say('No changes in this file.')} />
      ) : (
        files.map((patch, index) => (
          <View key={patch.id}>
            {patch.notes.map((note) => (
              <View key={note.kind} style={styles.note}>
                <Text variant="footnote" tone="secondary">
                  {noteText(note)}
                </Text>
              </View>
            ))}
            <DiffRow
              file={badgeFor(state.file, patch, files.length === 1)}
              hunks={hunks[index] ?? []}
              layout={canSplit && layout === 'split' ? 'sideBySide' : 'unified'}
            />
          </View>
        ))
      )}
      <View style={styles.padded}>
        {state.truncation === 'canLoadMore' ? (
          <>
            <Text variant="footnote" tone="secondary">
              {say('Showing the first part of this diff.')}
            </Text>
            <Button
              kind="secondary"
              title={say('Load More')}
              onPress={() => void diff.loadMore()}
            />
          </>
        ) : null}
        {state.truncation === 'tooLarge' ? (
          <Text variant="footnote" tone="secondary" testID="diff-too-large">
            {say('This file is too large to display in full.')}
            {state.file.lineCounts ? ` ${lineCountsSummary(state.file.lineCounts, say)}` : ''}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
