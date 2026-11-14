/**
 * Over-the-air updates, the pure part (docs/decisions/0028-over-the-air-updates.md, Rollout). The
 * update server picks a channel from the `channel` key of the request's `Expo-Extra-Params`: `beta`,
 * or `production` when the key is absent. Both channels serve the same signed bundles; beta gets
 * them a few days earlier.
 */
export type UpdateChannel = 'beta' | 'production';

/** The extra param the server reads. */
export const UPDATE_CHANNEL_PARAM = 'channel';

/** The channel the Early Updates setting asks for. */
export function updateChannel(earlyUpdates: boolean): UpdateChannel {
  return earlyUpdates ? 'beta' : 'production';
}

/** The extra param's value for a channel: `production` is the absence of the param. */
export function channelParamValue(channel: UpdateChannel): string | null {
  return channel === 'beta' ? 'beta' : null;
}

/** What the app runs: the JS inside the binary, or a downloaded update. */
export interface RunningUpdate {
  /** True when the binary's own JS runs (no update applied yet, or a rollback to it). */
  readonly embedded: boolean;
  /** The update's UUID; null when unknown. */
  readonly id: string | null;
  /** When the update was published (or the binary's JS built); null when unknown. */
  readonly createdAt: Date | null;
}

/** A running update as a bug report or Settings names it. */
export type RunningUpdateSummary =
  | { readonly kind: 'embedded' }
  | { readonly kind: 'update'; readonly shortId: string; readonly date: string | null };

/** How many characters of the update id a report keeps: enough to find it in the public log. */
export const UPDATE_SHORT_ID_LENGTH = 8;

export function summarizeRunningUpdate(update: RunningUpdate): RunningUpdateSummary {
  if (update.embedded || !update.id) return { kind: 'embedded' };
  const date =
    update.createdAt && !Number.isNaN(update.createdAt.getTime())
      ? update.createdAt.toISOString().slice(0, 10)
      : null;
  return { kind: 'update', shortId: update.id.slice(0, UPDATE_SHORT_ID_LENGTH), date };
}

/** The English line a problem report carries (reports stay in English for the maintainers). */
export function runningUpdateReportText(summary: RunningUpdateSummary): string {
  if (summary.kind === 'embedded') return 'embedded (no update applied)';
  return summary.date ? `${summary.shortId} (${summary.date})` : summary.shortId;
}
