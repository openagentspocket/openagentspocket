/**
 * Bounded backoff for transient events-channel failures: capped exponential
 * delay, unlimited attempts. Action-required failures stop instead.
 */
export interface ReconnectPolicy {
  readonly initialDelayMs: number;
  readonly multiplier: number;
  readonly maxDelayMs: number;
}

export const DEFAULT_RECONNECT_POLICY: ReconnectPolicy = {
  initialDelayMs: 1_000,
  multiplier: 2,
  maxDelayMs: 30_000,
};

/**
 * The delay before reconnect attempt `attempt` (1-based): the initial delay
 * grown by `multiplier` per prior failure, clamped at `maxDelayMs`.
 */
export function reconnectDelay(policy: ReconnectPolicy, attempt: number): number {
  const factor = Math.max(policy.multiplier, 1);
  let delay = policy.initialDelayMs;
  for (let remaining = attempt - 1; remaining > 0 && delay < policy.maxDelayMs; remaining -= 1) {
    delay *= factor;
  }
  return Math.min(delay, policy.maxDelayMs);
}

/**
 * Keepalive for the events session: herdr `ping` over the ordinary RPC path,
 * which both refreshes NAT mappings and proves the whole path (SSH, the
 * forwarded socket, herdr) alive. Skipped while real traffic within the
 * interval (an RPC, an arriving event) already proved it.
 */
export interface KeepalivePolicy {
  readonly intervalMs: number;
}

export const DEFAULT_KEEPALIVE_POLICY: KeepalivePolicy = { intervalMs: 30_000 };

/**
 * Buffer bound of the event delivery path, sized for stall absorption, not
 * history: bursts are tens of events, so 256 rides out a multi-second
 * consumer stall; beyond that one snapshot resync beats a stale backlog.
 */
export const EVENTS_BUFFER_LIMIT = 256;

/** Live PTYs one Host may hold at once. */
export const TERMINAL_LIMIT = 5;
