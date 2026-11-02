/** Plaintext counts over the full eligible inventory (Live Activity wire contract v1). */
export interface ActivityCounts {
  readonly working: number;
  readonly blocked: number;
  readonly done: number;
}

/** The cleartext `{v,kid,n,ct}` frame carried inside the content state. */
export interface ActivityEnvelope {
  readonly v: number;
  readonly kid: string;
  readonly n: string;
  readonly ct: string;
}

/**
 * The dynamic Live Activity content. Every field is a primitive so ActivityKit's default decoder
 * (and an APNs `content-state`) can read it; an absent envelope degrades to counts only.
 */
export interface ActivityContentState {
  readonly counts: ActivityCounts;
  readonly envelope?: ActivityEnvelope;
}

/** What a tap on Approve or Deny came to (`res`). Readers drop unknown values. */
export const ACTIVITY_RESULTS = [
  'sending',
  'sent',
  'not_waiting',
  'answered',
  'prompt_changed',
  'expired',
  'opted_out',
  'unreachable',
  'host_key_changed',
  'overlay_only',
  'update_plugin',
  'approve_in_app',
  'unlock_to_approve',
  'unconfirmed',
  'may_have_sent',
  'timed_out',
] as const;
export type ActivityResult = (typeof ACTIVITY_RESULTS)[number];

/** A Blocked Agent's prompt on the activity (`ask`): episode, prompt, labels and transition second. */
export interface ActivityAsk {
  /** `bid` */
  readonly episodeId: string;
  /** `act` 2 */
  readonly denyOnly: boolean;
  /** `q` */
  readonly prompt: string;
  /** `opts` */
  readonly options: readonly string[];
  /** `ts`: unix seconds */
  readonly timestamp: number;
  /** `res`: set only by this device's own local update. */
  readonly result?: ActivityResult;
}

export interface ActivityAgentDetail {
  readonly paneId: string;
  readonly kind: string;
  readonly name?: string;
  readonly workspace?: string;
  readonly status: string;
  readonly title?: string;
  readonly ask?: ActivityAsk;
}

export interface ActivityDetails {
  readonly hostName: string;
  readonly agents: readonly ActivityAgentDetail[];
}

/** Comparable desired content for one Host, before sealing. */
export interface ActivityDesire extends ActivityDetails {
  readonly counts: ActivityCounts;
}
