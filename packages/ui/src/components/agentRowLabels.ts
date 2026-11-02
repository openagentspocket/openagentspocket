import type { Status } from '../theme/status';

/**
 * Every string the Agent list rows draw. Screens pass `t()` translations (the i18n layer owns the
 * catalogs, as for the scanner and diff labels); these are the Swift app's English keys.
 */
export interface AgentRowLabels {
  status: Record<Status, string>;
  /** The capsule on a card of a disconnected Host. */
  saved: string;
  pin: string;
  unpin: string;
  details: string;
  /** Destructive: closes the pane. */
  closePane: string;
  /** Trailing swipe action of a terminal row. */
  close: string;
  newTerminal: string;
  seeAll: string;
  hostOffline: (host: string) => string;
  /** One summary row for several Hosts. */
  hostsOffline: (count: number) => string;
  contextLow: (left: string) => string;
}

export const defaultAgentRowLabels: AgentRowLabels = {
  status: { blocked: 'Blocked', working: 'Working', done: 'Done', idle: 'Idle' },
  saved: 'Saved',
  pin: 'Pin',
  unpin: 'Unpin',
  details: 'Details',
  closePane: 'Close Pane',
  close: 'Close',
  newTerminal: 'New Terminal',
  seeAll: 'See all',
  hostOffline: (host) => `${host} is offline`,
  hostsOffline: (count) => `${count} Hosts are offline`,
  contextLow: (left) => `Low context, ${left} left`,
};
