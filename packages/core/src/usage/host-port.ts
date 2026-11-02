import { type Message, message } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import type { PluginInstallation } from '../hosts/plugin-installation';
import {
  formatPluginVersion,
  isPluginFeatureSupported,
  PLUGIN_FEATURE_MINIMUM,
  type PluginVersion,
  parsePluginVersion,
} from '../hosts/plugin-version';
import { type UsageReport, UsageReportError } from './report';
import type { UsageHostState } from './scope';

export interface UsageQueryArgs {
  readonly pluginRoot: string;
  readonly timeZone: string;
  readonly claudeLimits: boolean;
}

/**
 * What the Usage store needs from one connected Host. The app adapts the transport (herdr
 * `plugin.list`, the nonce-framed exec probe, SFTP for the Accounts file) behind it.
 */
export interface UsageHostPort {
  /** The Agentico plugin as herdr lists it; null when it is not installed. */
  readPlugin(): Promise<PluginInstallation | null>;
  /** One plugin query; throws `TransportFailure` or `UsageReportError`. */
  query(args: UsageQueryArgs): Promise<UsageReport>;
  /** `usage-accounts.json` of the plugin's config dir; null when it does not exist. */
  readAccountFile(): Promise<string | null>;
  /** Atomic whole-file replace. */
  replaceAccountFile(text: string): Promise<void>;
}

/** One read's outcome and the plugin release that gave it, when the read learned it. */
export interface UsageRead {
  readonly state: UsageHostState;
  readonly pluginVersion: PluginVersion | null;
}

export const USAGE_FAILURE = {
  connection: 'Could not read Usage. Check the Host connection and try again.',
  plugin:
    'The Agentico plugin on this Host could not report Usage. Try again, or update the plugin.',
  timeout: 'The Host took too long to report Usage. Try again in a moment.',
} as const;

/** The note for a plugin too old for `feature` (Usage or Claude Code Accounts). */
export function featureRequirementNote(
  feature: 'usage' | 'claudeAccounts',
  installed: PluginVersion,
): Message {
  const minimum = formatPluginVersion(PLUGIN_FEATURE_MINIMUM[feature]);
  const installedText = formatPluginVersion(installed);
  return feature === 'usage'
    ? message('Usage needs plugin %@ or newer; this Host has %@.', minimum, installedText)
    : message(
        'Claude Code Accounts need plugin %@ or newer; this Host has %@.',
        minimum,
        installedText,
      );
}

const needs = (note: Message, pluginVersion: PluginVersion | null): UsageRead => ({
  state: { kind: 'requirement', note },
  pluginVersion,
});

/** One read in Swift's order: plugin listing, gating, then the query the listing resolved. */
export async function readUsage(
  port: UsageHostPort,
  args: Omit<UsageQueryArgs, 'pluginRoot'>,
): Promise<UsageRead> {
  const plugin = await port.readPlugin();
  if (!plugin) {
    return needs(message('Usage needs the Agentico plugin 0.7.0 or newer on this Host.'), null);
  }
  const version = parsePluginVersion(plugin.version);
  if (!version) {
    return needs(
      message('Could not verify the plugin version. Usage needs plugin 0.7.0 or newer.'),
      null,
    );
  }
  if (!isPluginFeatureSupported('usage', version)) {
    return needs(featureRequirementNote('usage', version), version);
  }
  if (!plugin.isEnabled) {
    return needs(message('Enable the Agentico plugin on this Host to read Usage.'), version);
  }
  if (!plugin.pluginRoot) {
    return needs(
      message(
        'herdr did not report where the Agentico plugin is installed. Update herdr on this Host to read Usage.',
      ),
      version,
    );
  }
  const report = await port.query({ ...args, pluginRoot: plugin.pluginRoot });
  const state: UsageHostState =
    report.runtime === 'missing' ? { kind: 'runtimeMissing' } : { kind: 'available', report };
  return { state, pluginVersion: version };
}

/**
 * A failed read as a state. Link failures ask for the connection; a Host that answered with
 * something unreadable would answer the same over any link, so its words do not blame the link.
 */
export function usageFailureState(error: unknown): UsageHostState {
  if (error instanceof UsageReportError) {
    return error.reason === 'unsupportedVersion'
      ? { kind: 'updateRequired' }
      : { kind: 'failed', detail: USAGE_FAILURE.plugin };
  }
  if (error instanceof TransportFailure) {
    switch (error.error.kind) {
      case 'hostFeatureUnavailable':
        return { kind: 'unsupportedPlatform' };
      case 'hostFileTimedOut':
      case 'timedOut':
        return { kind: 'failed', detail: USAGE_FAILURE.timeout };
      case 'malformedResponse':
      case 'apiRejected':
        return { kind: 'failed', detail: USAGE_FAILURE.plugin };
      default:
        break;
    }
  }
  return { kind: 'failed', detail: USAGE_FAILURE.connection };
}
