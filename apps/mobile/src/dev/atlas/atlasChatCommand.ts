import { type ChatEntry, notice } from '@openagentspocket/core';

/** A local command run from Chat (Claude Code `/context`): its output, recorded as markdown. */
export const COMMAND_OUTPUT: ChatEntry = {
  id: 'n-context',
  sourceOffset: 20,
  content: {
    type: 'notice',
    value: notice('command', '/context', {
      detailFormat: 'markdown',
      detail: [
        '## Context Usage',
        '',
        '**Model:** example-model  ',
        '**Tokens:** 39k / 200k (20%)',
        '',
        '### Estimated usage by category',
        '',
        '| Category | Tokens | Percentage |',
        '|----------|--------|------------|',
        '| System prompt | 5.6k | 2.8% |',
        '| System tools | 4.4k | 2.2% |',
        '| Skills | 9.9k | 5.0% |',
        '| Messages | 2.4k | 1.2% |',
        '| Free space | 161k | 80.5% |',
      ].join('\n'),
    }),
  },
};
