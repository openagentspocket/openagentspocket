import type { ConsoleRow } from '@openagentspocket/core';
import { type ReactNode, useState } from 'react';
import type { AgentActions } from './agentActions';
import { RenameSheet, type RenameSubject } from './RenameSheet';

export interface RenameControl {
  /** Opens the sheet for an Agent or for its Workspace. */
  open: (row: ConsoleRow | undefined, subject?: RenameSubject) => void;
  /** Render once beside the screen. */
  sheet: ReactNode;
}

/** The Rename sheet and its save, shared by every surface that renames (the Agents list, the composer menu). */
export function useRename(
  actions: Pick<AgentActions, 'rename' | 'renameWorkspace'>,
): RenameControl {
  const [target, setTarget] = useState<{ row: ConsoleRow; subject: RenameSubject } | undefined>();
  const save = (row: ConsoleRow, name: string) => {
    const subject = target?.subject ?? 'agent';
    setTarget(undefined);
    const done =
      subject === 'workspace' ? actions.renameWorkspace(row, name) : actions.rename(row, name);
    done.catch(() => undefined);
  };
  return {
    open: (row, subject = 'agent') => setTarget(row ? { row, subject } : undefined),
    sheet: (
      <RenameSheet
        row={target?.row}
        subject={target?.subject}
        onClose={() => setTarget(undefined)}
        onSave={save}
      />
    ),
  };
}
