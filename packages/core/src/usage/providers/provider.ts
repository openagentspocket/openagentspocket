import type { Message } from '../../errors/text';
import type { ProgramBrand } from '../../programs';

/**
 * One program whose Usage Limits the app can show. Adding a provider is one file exporting one of
 * these plus one line in `builtin.ts`; the report decoding, the card model and the cards are generic.
 */
export interface UsageProvider {
  /** The `program` id the plugin's usage report carries for it ("claude", "codex", "hermes"). */
  readonly id: string;
  readonly displayName: string;
  /** Its logo and the color of its bars (a brand token, never a literal). Null: neutral monogram. */
  readonly brand: ProgramBrand | null;
}

/** One limit window as a card row: "5-hour", how much of it is used, and when it resets. */
export interface ProviderLimitWindow {
  readonly id: string;
  readonly label: string;
  /** 0...1; null while unknown (expired or not reported). */
  readonly usedShare: number | null;
  readonly resetsAt: Date | null;
  /** Where an even pace would stand now, 0...1. */
  readonly elapsedShare: number | null;
}

/**
 * ok: fresh windows. stale: windows that are old or whose Host is unreachable. reading: the plugin
 * is still reading. off: the user has not enabled reading them. unavailable: nothing to show.
 */
export type ProviderUsageState = 'ok' | 'stale' | 'reading' | 'off' | 'unavailable';

/** What a provider's card shows for one Host. */
export interface ProviderUsage {
  readonly provider: UsageProvider;
  readonly hostId: string;
  readonly hostName: string;
  readonly windows: readonly ProviderLimitWindow[];
  /** When the plugin read the figures; null when it does not say. */
  readonly updatedAt: Date | null;
  readonly state: ProviderUsageState;
  /** Why there are no windows, for `off` and `unavailable`. */
  readonly note: Message | null;
}
