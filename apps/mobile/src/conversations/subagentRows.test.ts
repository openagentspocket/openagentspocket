import { emptyTranscript, toolActivity, userMessage } from '@openagentspocket/core';
import { subagentRows } from './subagentRows';

describe('subagentRows', () => {
  it('keeps messages, answers and tool calls in order and drops the rest', () => {
    const rows = subagentRows({
      ...emptyTranscript(),
      entries: [
        { id: 'a', sourceOffset: 0, content: { type: 'user', value: userMessage('Check it') } },
        {
          id: 'b',
          sourceOffset: 1,
          content: {
            type: 'tool',
            value: toolActivity({
              kind: 'search',
              name: 'Grep',
              title: 'Grep',
              subtitle: 'Searched for x',
              status: 'succeeded',
            }),
          },
        },
        { id: 'c', sourceOffset: 2, content: { type: 'assistant', value: { text: 'Done.' } } },
      ],
    });
    expect(rows).toEqual([
      { id: 'a', kind: 'user', text: 'Check it' },
      { id: 'b', kind: 'tool', summary: 'Searched for x' },
      { id: 'c', kind: 'assistant', text: 'Done.' },
    ]);
  });
});
