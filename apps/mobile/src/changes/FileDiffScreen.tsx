import {
  type ChangedFile,
  type DiffFile,
  type FileDiffStore,
  fileDirectory,
  fileName,
  type KeyValueStorage,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  type DiffRowLine,
  EmptyState,
  makeStyles,
  type ScreenHeader,
  Text,
  useStoreState,
} from '@openagentspocket/ui';
import { useEffect } from 'react';
import { ScrollView, View } from 'react-native';
import { AppScreen } from '@/navigation/AppScreen';
import { DiffContent } from './DiffContent';
import { readTimeText } from './format';
import { changesStoreFor } from './registry';
import { say } from './say';
import { useLineComments } from './useLineComments';

const useStyles = makeStyles((t) => ({
  scroll: { flex: 1 },
  footer: {
    backgroundColor: t.colors.surface,
    paddingHorizontal: t.metrics.screenInset,
    paddingVertical: t.spacing.md,
  },
}));

type OnReference = ((file: DiffFile, line: DiffRowLine) => void) | undefined;

function Body({
  agentId,
  width,
  onReference,
}: {
  agentId: string;
  width?: number;
  onReference: OnReference;
}) {
  const styles = useStyles();
  const store = changesStoreFor(agentId);
  const diff = useStoreState(store.fileDiff).current;
  useEffect(() => {
    // The diff pushed over the list keeps the status stream alive with the list.
    return store.followAgentStatus();
  }, [store]);
  if (!diff) return <EmptyState icon="file" title={say('This file is no longer in Changes.')} />;
  return (
    <DiffBody diff={diff} width={width} scrollStyle={styles.scroll} onReference={onReference} />
  );
}

function DiffBody({
  diff,
  width,
  scrollStyle,
  onReference,
}: {
  diff: FileDiffStore;
  width?: number;
  scrollStyle: object;
  onReference: OnReference;
}) {
  const styles = useStyles();
  const { readAt } = useStoreState(diff);
  return (
    <>
      <ScrollView style={scrollStyle}>
        <DiffContent diff={diff} width={width} onReference={onReference} />
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
  storage,
  width,
  onBack,
}: {
  agentId: string;
  /** The app's storage, where the Agent's Composer keeps the draft line comments join. */
  storage: KeyValueStorage;
  width?: number;
  onBack?: () => void;
}) {
  const current = useStoreState(changesStoreFor(agentId).fileDiff).current;
  const comments = useLineComments(agentId, storage);
  const file = current?.getState().file;
  const bar: ScreenHeader = {
    variant: 'sheet',
    title: fileTitle(file),
    subtitle: file ? fileDirectory(file) || undefined : undefined,
    back: true,
    leading: { label: say('Changes'), onPress: onBack ?? (() => {}), testID: 'diff-back' },
    trailing: comments.openChat
      ? [
          {
            label: t('Open Chat'),
            icon: 'chat',
            onPress: comments.openChat,
            testID: 'diff-open-chat',
          },
        ]
      : undefined,
  };
  return (
    <AppScreen scroll={false} bare header={bar} testID="file-diff-screen">
      <Body agentId={agentId} width={width} onReference={comments.onReference} />
      {comments.sheet}
    </AppScreen>
  );
}
