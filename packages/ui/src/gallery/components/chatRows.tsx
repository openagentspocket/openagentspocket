import { ChatDivider } from '../../components/ChatDivider';
import { ChatMessageActions } from '../../components/ChatMessageActions';
import { ChatNoticeRow } from '../../components/ChatNoticeRow';
import { ChatThoughtRow } from '../../components/ChatThoughtRow';
import { ChatToolRow } from '../../components/ChatToolRow';
import { ChatUserBubble } from '../../components/ChatUserBubble';
import { DiffRow } from '../../components/DiffRow';
import type { CatalogEntry } from './types';

const noop = () => {};

const diffHunk = {
  header: '@@ -4,3 +4,3 @@ struct AttachChrome',
  gapLabel: '3 unchanged lines',
  lines: [
    { kind: 'context', oldNumber: 4, newNumber: 4, text: '    var title: String' },
    {
      kind: 'del',
      oldNumber: 5,
      segments: [{ text: '    var ' }, { text: 'subtitle', changed: true }, { text: ': String' }],
    },
    {
      kind: 'add',
      newNumber: 5,
      segments: [
        { text: '    var ' },
        { text: 'spokenTitle', changed: true },
        { text: ': String' },
      ],
    },
    { kind: 'context', oldNumber: 6, newNumber: 6, text: '    var isLive: Bool' },
  ],
} as const;

const diffFile = {
  letter: 'M',
  tone: 'warning',
  title: 'Modified · Unstaged',
  added: 1,
  removed: 1,
} as const;

/** Demos of the UX3 group 'chatRows': one entry per component, one variant per catalog variant id. */
export const chatRowsEntries: readonly CatalogEntry[] = [
  {
    name: 'ChatUserBubble',
    variants: [
      {
        id: 'default',
        render: () => (
          <ChatUserBubble text="The Attach toolbar feels crowded on small phones. Can you tighten it up without hiding anything people use often?" />
        ),
      },
      {
        id: 'pending',
        render: () => <ChatUserBubble text="Run the tests again" pending pendingLabel="Sending" />,
      },
    ],
  },
  {
    name: 'ChatDivider',
    variants: [
      {
        id: 'turn',
        render: () => <ChatDivider kind="turn" label="Worked for 26s" onToggle={noop} />,
      },
      {
        id: 'working',
        render: () => <ChatDivider kind="working" label="Working for" elapsedSeconds={105} />,
      },
      {
        id: 'compacted',
        render: () => <ChatDivider kind="compacted" label="Context compacted" />,
      },
    ],
  },
  {
    name: 'ChatMessageActions',
    variants: [
      {
        id: 'default',
        render: () => (
          <ChatMessageActions
            items={[{ key: 'copy', title: 'Copy', icon: 'copy', onPress: noop }]}
          />
        ),
      },
    ],
  },
  {
    name: 'ChatThoughtRow',
    variants: [
      {
        id: 'default',
        render: () => <ChatThoughtRow label="Thought for 4s" expanded={false} onToggle={noop} />,
      },
    ],
  },
  {
    name: 'ChatToolRow',
    variants: [
      {
        id: 'default',
        render: () => (
          <ChatToolRow
            tool={{
              title: 'swift test --filter AttachToolbarSnapshotTests',
              monospaced: true,
              status: 'failed',
              statusLabel: 'Exit 1',
            }}
            onToggle={noop}
          />
        ),
      },
      {
        id: 'waiting',
        render: () => (
          <ChatToolRow
            tool={{
              title: 'git push origin main',
              monospaced: true,
              status: 'waiting',
              statusLabel: 'Waiting',
            }}
            onToggle={noop}
          />
        ),
      },
      {
        id: 'line',
        render: () => (
          <ChatToolRow
            tool={{
              icon: 'file',
              title: 'Sources/Attach/AttachToolbar.swift',
              status: 'done',
              added: 12,
              removed: 4,
            }}
            onToggle={noop}
          />
        ),
      },
      {
        id: 'running',
        render: () => (
          <ChatToolRow
            tool={{ title: 'Run the toolbar snapshot tests', status: 'running' }}
            onToggle={noop}
          />
        ),
      },
      {
        id: 'group',
        render: () => (
          <ChatToolRow
            tool={{
              title: 'Ran 3 commands, Edited 2 files',
              status: 'done',
              added: 18,
              removed: 6,
            }}
            onToggle={noop}
          />
        ),
      },
      {
        id: 'subagents',
        render: () => (
          <ChatToolRow
            openLabel="Open Subagent Transcript"
            subagents={[
              {
                id: 'a',
                name: 'Check link anchors',
                kind: 'Explore',
                status: 'done',
                onOpen: noop,
              },
              {
                id: 'b',
                name: 'docs-audit',
                detail: 'Check every guide page against the QR code flow',
                status: 'running',
                onOpen: noop,
              },
              {
                id: 'c',
                name: 'Check screenshots',
                kind: 'general-purpose',
                status: 'failed',
                onOpen: noop,
              },
            ]}
          />
        ),
      },
    ],
  },
  {
    name: 'ChatNoticeRow',
    variants: [
      {
        id: 'default',
        render: () => (
          <ChatNoticeRow
            title='Agent "Check link anchors" completed'
            detail="Every link to the pairing section resolves."
          />
        ),
      },
      {
        id: 'markdown',
        render: () => (
          <ChatNoticeRow
            title="/context"
            detailFormat="markdown"
            detail={
              '**Tokens:** 39k / 200k (20%)\n\n| Category | Tokens |\n|---|---|\n| Messages | 2.4k |\n| Free space | 161k |'
            }
          />
        ),
      },
    ],
  },
  {
    name: 'DiffRow',
    variants: [
      {
        id: 'default',
        render: () => <DiffRow file={diffFile} hunks={[diffHunk]} onReference={noop} />,
      },
    ],
  },
];
