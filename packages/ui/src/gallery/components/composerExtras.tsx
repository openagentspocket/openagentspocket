import {
  ClaudeSubagentTranscript,
  type SubagentRow,
} from '../../components/ClaudeSubagentTranscript';
import { ComposerAttachmentStrip } from '../../components/ComposerAttachmentStrip';
import { ComposerStagingStatusBar } from '../../components/ComposerStagingStatusBar';
import { SkillContentSheet } from '../../components/SkillContentSheet';
import {
  type PaneSwitcherItem,
  type SkillItem,
  SkillsKeyboardPane,
} from '../../components/SkillsKeyboardPane';
import type { CatalogEntry } from './types';

const noop = () => {};

const PANES: readonly PaneSwitcherItem[] = [
  { key: 'keys', icon: 'grid', label: 'Keys' },
  { key: 'skills', icon: 'sparkles', label: 'Skills' },
  { key: 'snippets', icon: 'quote', label: 'Snippets' },
  { key: 'themes', icon: 'palette', label: 'Themes' },
];

const SKILLS: readonly SkillItem[] = [
  {
    id: 'review',
    command: '/review',
    name: 'Review',
    description: 'Review the pending changes for bugs and style',
    scope: 'project',
  },
  {
    id: 'deploy',
    command: '/deploy-preview',
    name: 'Deploy preview',
    description: 'Build and publish a preview of this branch',
    scope: 'project',
  },
  {
    id: 'init',
    command: '/init',
    name: 'Init',
    description: 'Write a CLAUDE.md for this repository',
    scope: 'global',
  },
];

const ROWS: readonly SubagentRow[] = [
  { id: 'u1', kind: 'user', text: 'Check that every link to the pairing section still resolves.' },
  {
    id: 'a1',
    kind: 'assistant',
    text: "I'll search the guide for links to the pairing page, then check each anchor.",
  },
  {
    id: 't1',
    kind: 'tool',
    summary: 'Ran 2 searches',
    detail: 'grep "#pairing" docs/\ngrep "pairing.md" docs/',
  },
  {
    id: 'a2',
    kind: 'assistant',
    text: 'Every link to the pairing section resolves: all three point at **Scan the code**, which exists.',
  },
];

function pane(extra: Partial<Parameters<typeof SkillsKeyboardPane>[0]> = {}) {
  return (
    <SkillsKeyboardPane
      skills={[]}
      onPick={noop}
      onRefresh={noop}
      onOpen={noop}
      panes={PANES}
      selectedPane="skills"
      {...extra}
    />
  );
}

/** Demos of the UX3 group 'composerExtras': one entry per component, one variant per catalog variant id. */
export const composerExtrasEntries: readonly CatalogEntry[] = [
  {
    name: 'SkillsKeyboardPane',
    variants: [
      { id: 'default', render: () => pane() },
      { id: 'list', render: () => pane({ skills: SKILLS, height: 360 }) },
      { id: 'loading', render: () => pane({ phase: 'loading' }) },
      {
        id: 'failed',
        render: () => pane({ phase: 'failed', errorMessage: 'The Host did not answer in time.' }),
      },
    ],
  },
  {
    name: 'SkillContentSheet',
    variants: [
      {
        id: 'default',
        render: () => (
          <SkillContentSheet
            visible
            name="/review"
            state="loaded"
            content={'# Review\n\nRead the diff, flag bugs, suggest fixes.'}
            onClose={noop}
          />
        ),
      },
      {
        id: 'loading',
        render: () => <SkillContentSheet visible name="/review" state="loading" onClose={noop} />,
      },
      {
        id: 'failed',
        render: () => (
          <SkillContentSheet
            visible
            name="/review"
            state="failed"
            message="The Host is not connected."
            onClose={noop}
            onRetry={noop}
          />
        ),
      },
    ],
  },
  {
    name: 'ComposerAttachmentStrip',
    variants: [
      {
        id: 'default',
        render: () => (
          <ComposerAttachmentStrip
            items={[
              { id: 'notes', name: 'notes.md' },
              { id: 'log', name: 'build.log', state: 'uploading' },
              { id: 'report', name: 'report.pdf', state: 'failed' },
            ]}
            onRemove={noop}
            removeLabel={(name) => `Remove ${name}`}
          />
        ),
      },
    ],
  },
  {
    name: 'ComposerStagingStatusBar',
    variants: [
      {
        id: 'default',
        render: () => (
          <ComposerStagingStatusBar
            state="staging"
            label="Uploading photo.png…"
            commands={['cancel']}
          />
        ),
      },
      {
        id: 'failed',
        render: () => (
          <ComposerStagingStatusBar
            state="failed"
            label="Couldn't send photo.png to the Host."
            commands={['retry', 'dismiss']}
          />
        ),
      },
      {
        id: 'done',
        render: () => (
          <ComposerStagingStatusBar
            state="done"
            label="Saved photo.png on the Host."
            commands={['copyPath', 'dismiss']}
          />
        ),
      },
    ],
  },
  {
    name: 'ClaudeSubagentTranscript',
    variants: [
      {
        id: 'default',
        render: () => (
          <ClaudeSubagentTranscript
            title="Check link anchors"
            kind="Explore"
            rows={ROWS}
            onBack={noop}
          />
        ),
      },
      {
        id: 'empty',
        render: () => (
          <ClaudeSubagentTranscript
            title="Check link anchors"
            kind="Explore"
            phase="empty"
            rows={[]}
            onBack={noop}
          />
        ),
      },
      {
        id: 'failed',
        render: () => (
          <ClaudeSubagentTranscript
            title="Check link anchors"
            kind="Explore"
            phase="failed"
            failureMessage="The Host did not answer in time."
            rows={[]}
            onBack={noop}
            onRetry={noop}
          />
        ),
      },
    ],
  },
];
