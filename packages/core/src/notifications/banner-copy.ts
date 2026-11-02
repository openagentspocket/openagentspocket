import { agentKindLabel, nonEmpty } from '../console';
import { type Message, message } from '../errors';

/** The Agent a notification points at: the Host and the herdr pane. */
export interface AgentBannerTarget {
  readonly hostId: string;
  readonly paneId: string;
}

export const bannerTargetKey = (target: AgentBannerTarget): string =>
  `${target.hostId}\u0000${target.paneId}`;

/** The workspace leads, then the program: "Caterm · Claude". The Host is deliberately absent. */
export function bannerTitle(workspace: string | undefined, kind: string): string {
  const label = agentKindLabel(kind);
  const lead = nonEmpty(workspace?.trim());
  return lead === undefined ? label : `${lead} · ${label}`;
}

/** The push wording for a status, shared with the in-app banner so the two cannot drift. */
export function bannerBody(status: string): Message {
  switch (status) {
    case 'blocked':
      return message('Blocked — waiting for input');
    case 'done':
      return message('Done');
    default:
      // The status set is open on the wire: render an unknown value factually.
      return message('Status: %@', status);
  }
}
