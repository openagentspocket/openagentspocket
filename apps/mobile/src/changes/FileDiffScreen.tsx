import {
  type ChangedFile,
  type FileDiffStore,
  fileDirectory,
  fileName,
} from '@openagentspocket/core';
import { EmptyState, makeStyles, Screen, SheetBar, Text } from '@openagentspocket/ui';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { DiffContent } from './DiffContent';
import { readTimeText } from './format';
import { changesStoreFor } from './registry';
import { say } from './say';
import { useStoreState } from './useStoreState';

const useStyles = makeStyles((t) => ({
  scroll: { flex: 1 },
  footer: {
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.md,
  },
}));

function Body({ agentId, width }: { agentId: string; width?: number }) {
  const styles = useStyles();
  const store = changesStoreFor(agentId);
  const diff = useStoreState(store.fileDiff).current;
  useEffect(() => {
    // The diff pushed over the list keeps the status stream alive with the list.
    return store.followAgentStatus();
  }, [store]);
  if (!diff) return <EmptyState icon="file" title={say('This file is no longer in Changes.')} />;
  return <DiffBody diff={diff} width={width} scrollStyle={styles.scroll} />;
}

function DiffBody({
  diff,
  width,
  scrollStyle,
}: {
  diff: FileDiffStore;
  width?: number;
  scrollStyle: object;
}) {
  const styles = useStyles();
  const { readAt } = useStoreState(diff);
  return (
    <>
      <ScrollView style={scrollStyle}>
        <DiffContent diff={diff} width={width} />
      </ScrollView>
      {readAt !== null ? (
        <View style={styles.footer} testID="diff-read-at">
          <Text variant="footnote" tone="secondary">
            {readTimeText(readAt, Date.now())}
          </Text>
        </View>
      ) : null}
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
      subtitle={file ? fileDirectory(file) || undefined : undefined}
      back
      leading={{ label: say('Changes'), onPress: onBack ?? (() => {}), testID: 'diff-back' }}
    />
  );
  return (
    <Screen
      scroll={false}
      bare
      header={bar}
      edges={['left', 'right', 'bottom']}
      testID="file-diff-screen"
    >
      <Body agentId={agentId} width={width} />
    </Screen>
  );
}
