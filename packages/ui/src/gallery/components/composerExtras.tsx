import {
  ClaudeSubagentTranscript,
  type SubagentRow,
} from '../../components/ClaudeSubagentTranscript';
import { ComposerAttachmentStrip } from '../../components/ComposerAttachmentStrip';
import { SkillContentSheet } from '../../components/SkillContentSheet';
import type { CatalogEntry } from './types';

const noop = () => {};

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

/** Demos of the UX3 group 'composerExtras': one entry per component, one variant per catalog variant id. */
export const composerExtrasEntries: readonly CatalogEntry[] = [
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
