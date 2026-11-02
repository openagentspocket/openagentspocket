import {
  EVENTS_DROPPED,
  type EventSubscription,
  type GlobalEventKind,
  type HerdrEventKind,
} from '../wire';

/** Membership and naming events: each one means the snapshot may be out of date. */
export const SNAPSHOT_CHANGE_KINDS: readonly GlobalEventKind[] = [
  'pane.agent_detected',
  'pane.created',
  'pane.closed',
  'pane.exited',
  'workspace.created',
  'workspace.renamed',
  'workspace.metadata_updated',
  'workspace.closed',
  'workspace.moved',
  'workspace.reordered',
  'tab.created',
  'tab.closed',
  'tab.renamed',
  'tab.moved',
  'pane.moved',
];

const RESYNC_KINDS: ReadonlySet<string> = new Set<string>([
  ...SNAPSHOT_CHANGE_KINDS,
  EVENTS_DROPPED,
]);

/** Whether an event kind obliges a fresh snapshot (the drop marker included). */
export function isResyncEvent(kind: HerdrEventKind): boolean {
  return RESYNC_KINDS.has(kind);
}

/**
 * The subscriptions a Host's Console wants: membership kinds, live pane directories, and one
 * status subscription per pane. `workspace.reordered` exists from protocol 19, so it is only
 * requested after a snapshot on this connection reports it.
 */
export function consoleSubscriptions(
  paneIds: Iterable<string>,
  protocolVersion?: number,
): EventSubscription[] {
  const global: EventSubscription[] = SNAPSHOT_CHANGE_KINDS.filter(
    (kind) => kind !== 'workspace.reordered' || (protocolVersion ?? 0) >= 19,
  ).map((kind) => ({ kind }));
  global.push({ kind: 'pane.updated' });
  const panes = [...paneIds]
    .sort()
    .map((paneId): EventSubscription => ({ kind: 'pane.agent_status_changed', paneId }));
  return [...global, ...panes];
}
