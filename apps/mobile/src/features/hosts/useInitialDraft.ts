import {
  duplicateHostDraft,
  emptyHostDraft,
  emptyRouteDraft,
  type Host,
  type HostDraft,
  hostDisplayName,
  hostDraftFromHost,
} from '@openagentspocket/core';
import { useEffect, useState } from 'react';
import { hostsRuntime } from './hostsRuntime';

export interface InitialDraft {
  readonly draft: HostDraft;
  /** The Host being edited; null when adding or duplicating. */
  readonly editing: Host | null;
}

/**
 * The form's starting point: a blank draft with one empty route, the Host to edit, or a
 * copy of one (with its stored password). Null while a duplicate's password loads.
 */
export function useInitialDraft(editId?: string, duplicateId?: string): InitialDraft | null {
  const [initial, setInitial] = useState<InitialDraft | null>(null);
  useEffect(() => {
    let live = true;
    const { model } = hostsRuntime();
    const source = model.find(editId ?? duplicateId ?? '');
    const finish = (next: InitialDraft) => {
      if (live) setInitial(next);
    };
    if (source && editId) {
      finish({ draft: hostDraftFromHost(source), editing: source });
    } else if (source) {
      void model.catalog.password(source).then((password) =>
        finish({
          draft: duplicateHostDraft(source, {
            password,
            existingNames: model.getSnapshot().hosts.map(hostDisplayName),
            newId: model.newId,
          }),
          editing: null,
        }),
      );
    } else {
      finish({
        draft: { ...emptyHostDraft(), routes: [emptyRouteDraft(model.newId())] },
        editing: null,
      });
    }
    return () => {
      live = false;
    };
  }, [editId, duplicateId]);
  return initial;
}
