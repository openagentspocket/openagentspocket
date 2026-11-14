import {
  type ChatFileChange,
  type ChatToolActivity,
  diffHunkHeader,
  diffHunkLines,
  displayFilePath,
  toolDetailText,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  DiffRow,
  type DiffRowLine,
  makeStyles,
  rounded,
  Spinner,
  Text,
} from '@openagentspocket/ui';
import { toBase64 } from 'agentico-ssh';
import { useEffect, useMemo, useState } from 'react';
import { Image, View } from 'react-native';
import { useConversationRegistry } from '@/conversations/useConversation';

const IMAGE_HEIGHT = 220;
const MIME: Record<string, string> = { gif: 'gif', jpeg: 'jpeg', jpg: 'jpeg', webp: 'webp' };

const useStyles = makeStyles((th) => ({
  stack: { gap: th.spacing.xs },
  image: { width: '100%', height: IMAGE_HEIGHT, ...rounded(th.radius.control) },
}));

const BADGES = {
  created: { letter: 'A', tone: 'success' },
  deleted: { letter: 'D', tone: 'danger' },
  updated: { letter: 'M', tone: 'warning' },
  written: { letter: 'M', tone: 'warning' },
} as const;

function FileDiff({ change, directory }: { change: ChatFileChange; directory: string | null }) {
  const hunks = useMemo(
    () =>
      change.hunks.map((hunk) => ({
        header: diffHunkHeader(hunk),
        lines: diffHunkLines(hunk) as DiffRowLine[],
      })),
    [change.hunks],
  );
  return (
    <DiffRow
      file={{
        ...BADGES[change.kind],
        title: displayFilePath(change.path, directory),
        added: change.added,
        removed: change.removed,
      }}
      hunks={hunks}
    />
  );
}

function dataUri(path: string, bytes: Uint8Array): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  return `data:image/${MIME[extension] ?? 'png'};base64,${toBase64(bytes)}`;
}

/** Reads the picture only when its row opens: it travels over the Host's SSH connection. */
function HostImage({ hostId, path }: { hostId: string; path: string }) {
  const styles = useStyles();
  const registry = useConversationRegistry();
  const [state, setState] = useState<{ uri: string } | 'loading' | 'failed'>('loading');
  useEffect(() => {
    let live = true;
    Promise.resolve(registry?.readImage(hostId, path))
      .then((bytes) => {
        if (live) setState(bytes ? { uri: dataUri(path, bytes) } : 'failed');
      })
      .catch(() => {
        if (live) setState('failed');
      });
    return () => {
      live = false;
    };
  }, [registry, hostId, path]);
  if (state === 'loading') return <Spinner size="small" />;
  if (state === 'failed') {
    return (
      <Text variant="footnote" tone="secondary">
        {t('Could not load the image.')}
      </Text>
    );
  }
  return (
    <Image
      source={state}
      style={styles.image}
      resizeMode="contain"
      accessibilityLabel={path.split('/').pop()}
      testID="chat-tool-image"
    />
  );
}

interface DetailProps {
  hostId: string;
  tool: ChatToolActivity;
  /** The command line as run, when the row's title shows something shorter. */
  command?: string | null;
}

/** What an open tool row shows: the command line it ran, the files it changed, its output, its picture. */
export function ChatToolDetail({ hostId, tool, command }: DetailProps) {
  const styles = useStyles();
  const text = toolDetailText(tool);
  const images = tool.preview?.imageCount ?? 0;
  const changes = tool.fileChanges;
  return (
    <View style={styles.stack} testID="chat-tool-detail">
      {command ? (
        <Text variant="caption" monospaced selectable testID="chat-tool-command">
          {command}
        </Text>
      ) : null}
      {changes?.files.map((change) => (
        <FileDiff key={change.path} change={change} directory={changes.directory} />
      ))}
      {changes?.moreFiles ? (
        <Text variant="footnote" tone="secondary">
          {t('%lld more files', changes.moreFiles)}
        </Text>
      ) : null}
      {text ? (
        <Text variant="caption" monospaced tone="secondary" selectable>
          {text}
        </Text>
      ) : null}
      {images > 0 && !tool.imagePath ? (
        <Text variant="footnote" tone="secondary">
          {images === 1 ? t('1 image') : t('%lld images', images)}
        </Text>
      ) : null}
      {tool.imagePath ? <HostImage hostId={hostId} path={tool.imagePath} /> : null}
    </View>
  );
}
