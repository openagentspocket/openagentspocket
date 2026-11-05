import { ChangesStore, RowChanges, type RowChangesTarget } from '@openagentspocket/core';
import { systemClock } from '@openagentspocket/transport';
import { demoReadFor } from './demo';
import { say } from './say';

export type RowChangesFactory = (target: RowChangesTarget) => ChangesStore | null;

/** Demo data until the composition lands the live factory: every directory reads its sample Checkout. */
const demoFactory: RowChangesFactory = (target) =>
  new ChangesStore({
    directory: () => target.directory,
    read: async (request) => demoReadFor(request.directory),
    clock: systemClock,
    say,
  });

let factory: RowChangesFactory = demoFactory;
let registry: RowChanges | undefined;

/** The live factory from the composition root; undefined puts the demo one back. */
export function setRowChangesFactory(next: RowChangesFactory | undefined): void {
  factory = next ?? demoFactory;
  registry = undefined;
}

/** The one registry of git reads that rows, the status line and the Board share. */
export function rowChanges(): RowChanges {
  registry ??= new RowChanges({ make: (target) => factory(target), clock: systemClock });
  return registry;
}
