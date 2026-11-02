import {
  type AccountFileStore,
  type AddAccountOptions,
  addAccount,
  ClaudeAccountError,
  decodeAccountFile,
  encodeAccountFile,
  ignoreDirectory,
  type Message,
  message,
  removeAccount,
  renameAccount,
  type UsageAccountFile,
} from '@openagentspocket/core';
import { useCallback, useEffect, useRef, useState } from 'react';

type Edit = (file: UsageAccountFile) => UsageAccountFile;

export interface AccountFileState {
  file: UsageAccountFile | null;
  /** Why the last read or change failed, in catalog words; null while all is well. */
  failure: Message | null;
  busy: boolean;
  add: (options: Omit<AddAccountOptions, 'defaultDirectory'>) => Promise<boolean>;
  rename: (accountId: string, name: string) => Promise<boolean>;
  remove: (accountId: string) => Promise<boolean>;
  ignore: (directory: string) => Promise<boolean>;
  dismissFailure: () => void;
}

/**
 * One Host's `usage-accounts.json`: read when the sheet opens, rewritten whole after every change.
 * Changes are serialized (`busy`) so two taps never write over each other, and a newer app's file
 * is never rewritten.
 */
export function useAccountFile(
  store: AccountFileStore,
  hostId: string,
  defaultDirectory: string | null,
  active: boolean,
): AccountFileState {
  const [file, setFile] = useState<UsageAccountFile | null>(null);
  const [failure, setFailure] = useState<Message | null>(null);
  const [busy, setBusy] = useState(false);
  const working = useRef(false);

  useEffect(() => {
    if (!active) return;
    let live = true;
    store
      .read(hostId)
      .then((text) => {
        if (!live) return;
        setFile(decodeAccountFile(text));
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (!live) return;
        setFailure(
          error instanceof ClaudeAccountError
            ? error.text
            : message('Agentico could not read this Host’s Accounts. Try again.'),
        );
      });
    return () => {
      live = false;
    };
  }, [active, store, hostId]);

  const apply = useCallback(
    async (edit: Edit): Promise<boolean> => {
      if (working.current || !file) {
        if (working.current) setFailure(new ClaudeAccountError({ kind: 'busy' }).text);
        return false;
      }
      working.current = true;
      setBusy(true);
      try {
        const next = edit(file);
        await store.write(hostId, encodeAccountFile(next));
        setFile(next);
        setFailure(null);
        return true;
      } catch (error) {
        setFailure(
          error instanceof ClaudeAccountError
            ? error.text
            : message('Agentico could not save this Host’s Accounts. Try again.'),
        );
        return false;
      } finally {
        working.current = false;
        setBusy(false);
      }
    },
    [file, store, hostId],
  );

  return {
    file,
    failure,
    busy,
    add: (options) => apply((f) => addAccount(f, { ...options, defaultDirectory }).file),
    rename: (id, name) => apply((f) => renameAccount(f, id, name)),
    remove: (id) => apply((f) => removeAccount(f, id)),
    ignore: (directory) => apply((f) => ignoreDirectory(f, directory, defaultDirectory)),
    dismissFailure: () => setFailure(null),
  };
}
