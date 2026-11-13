// The tool calls of the atlas conversation's running turn.

import { type ChatEntry, toolActivity } from '@openagentspocket/core';

const call = (
  id: string,
  sourceOffset: number,
  tool: Parameters<typeof toolActivity>[0],
): ChatEntry => ({ id, sourceOffset, content: { type: 'tool', value: toolActivity(tool) } });

/** Five calls in a row: Chat folds them into one quiet line ("Ran 1 command, Edited 2 files, ..."). */
export const FOLDED_CALLS: ChatEntry[] = [
  call('t3', 7, {
    kind: 'search',
    name: 'Grep',
    title: 'moreMenu',
    subtitle: 'Sources/Attach',
    status: 'succeeded',
  }),
  call('t4', 8, {
    kind: 'fileRead',
    name: 'Read',
    title: 'Sources/Attach/AttachToolbar.swift',
    status: 'succeeded',
  }),
  call('t5', 9, {
    kind: 'fileEdit',
    name: 'Edit',
    title: 'Sources/Attach/AttachToolbar.swift',
    status: 'succeeded',
    diff: { added: 12, removed: 4, files: 1 },
  }),
  call('t6', 10, {
    kind: 'fileEdit',
    name: 'Edit',
    title: 'Sources/Attach/AttachMoreMenu.swift',
    status: 'succeeded',
    diff: { added: 6, removed: 2, files: 1 },
  }),
  call('t7', 11, {
    kind: 'command',
    name: 'Bash',
    title: 'swift build --package-path . --configuration debug 2>&1 | tail -n 20',
    status: 'succeeded',
  }),
];
