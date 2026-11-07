import { singleQuoted } from '../changes/script';
import type { HerdrEndpoint } from '../hosts/herdr-endpoint';
import type { HostDataSource } from '../hosts/host-data';
import { herdrScriptCommand } from '../hosts/host-path';
import type { ActivityAsk } from '../live-activity/types';
import { encodeBase64Url, utf8Encode } from '../pairing/bytes';
import { type ApprovalApplyRequest, EPISODE_ID } from './approval-action';

/** How often asks are read again while an Agent stays Blocked. */
export const ASK_REFRESH_MS = 20_000;
const ASK_OPTIONS_MAX = 4;

/** The prompts a Host's plugin says its screens still show, by pane id. */
export type ApprovalAsks = ReadonlyMap<string, ActivityAsk>;

/** One read of a Host's asks: "could not read" is never the same as "gone". */
export type ApprovalAskReading =
  | {
      readonly kind: 'read';
      readonly asks: ApprovalAsks;
      /** Panes with a recorded ask whose screen could not be read this time. */
      readonly unread: readonly string[];
    }
  /** The plugin is off, missing, or its hooks never ran: it can say nothing about any pane. */
  | { readonly kind: 'pluginUnavailable' };

const text64 = (text: string) => encodeBase64Url(utf8Encode(text));

/** Runs one script of the plugin on the Host, with its own node, config dir and session socket. */
function pluginNodeScript(
  pluginRoot: string,
  file: string,
  args: string,
  endpoint: HerdrEndpoint | null,
): string {
  if (!pluginRoot.startsWith('/') || pluginRoot.includes('\0')) {
    throw new RangeError('The plugin root is not an absolute path.');
  }
  const { environment, command } = herdrScriptCommand(endpoint, 'plugin config-dir agentico');
  return `export LC_ALL=C
${environment}
config=$(${command}) || exit 1
export HERDR_PLUGIN_CONFIG_DIR="$config"
IFS= read -r node < "$config/runtime-node" || { printf '%s\\n' '{"v":1,"result":"runtime_missing"}'; exit 0; }
"$node" ${singleQuoted(`${pluginRoot}/src/${file}`)}${args}
`;
}

/**
 * Runs the plugin's Host-side apply with its own node. Every value goes as one quoted argument; the
 * script prints the apply's one JSON line, or `runtime_missing` before the hooks ever ran.
 */
export function approvalApplyScript(
  pluginRoot: string,
  request: ApprovalApplyRequest,
  endpoint: HerdrEndpoint | null,
): string {
  const args = [
    ['--pane', request.pane],
    ['--bid', request.episodeId],
    ['--ts', String(request.timestamp)],
    ['--decision', request.decision],
    ['--option', String(request.option)],
    ['--prompt', text64(request.prompt)],
    ['--label', text64(request.label)],
  ]
    .flat()
    .map((value) => singleQuoted(value))
    .join(' ');
  return pluginNodeScript(pluginRoot, 'approval-apply.js', ` ${args}`, endpoint);
}

/** The object on the output's last line; null when there is none. */
function lastLine(stdout: string): Record<string, unknown> | null {
  const line = stdout.trim().split('\n').pop() ?? '';
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The result word of the apply's output; empty when it printed nothing readable. */
export function approvalApplyResult(stdout: string): string {
  const result = lastLine(stdout)?.result;
  return typeof result === 'string' ? result : '';
}

/** Runs the plugin's `approval-asks.js`: its one JSON line, or `runtime_missing`. */
export function approvalAsksScript(pluginRoot: string, endpoint: HerdrEndpoint | null): string {
  return pluginNodeScript(pluginRoot, 'approval-asks.js', '', endpoint);
}

function askEntry(value: unknown): [string, ActivityAsk] | null {
  if (typeof value !== 'object' || value === null) return null;
  const { pane, bid, ts, act, q, opts } = value as Record<string, unknown>;
  if (typeof pane !== 'string' || pane === '') return null;
  if (typeof bid !== 'string' || !EPISODE_ID.test(bid)) return null;
  if (typeof ts !== 'number' || !Number.isInteger(ts)) return null;
  if ((act !== 1 && act !== 2) || typeof q !== 'string') return null;
  if (!Array.isArray(opts) || opts.length > ASK_OPTIONS_MAX) return null;
  if (!opts.every((label) => typeof label === 'string')) return null;
  return [
    pane,
    { episodeId: bid, denyOnly: act === 2, prompt: q, options: opts as string[], timestamp: ts },
  ];
}

/** What `approval-asks.js` printed; a malformed ask drops alone. Throws on unreadable output. */
export function parseApprovalAskReading(stdout: string): ApprovalAskReading {
  const report = lastLine(stdout);
  if (report?.v === 1 && report.result === 'runtime_missing') return { kind: 'pluginUnavailable' };
  if (report?.v !== 1 || report.result !== 'ok' || !Array.isArray(report.asks)) {
    throw new Error('The approval asks are unreadable.');
  }
  const unread = Array.isArray(report.unread) ? report.unread : [];
  return {
    kind: 'read',
    asks: new Map(report.asks.map(askEntry).filter((entry) => entry !== null)),
    unread: unread.filter((pane) => typeof pane === 'string' && pane !== ''),
  };
}

/** A Host's asks as Host data. It needs the plugin's root, so it is built once that is known. */
export function approvalAsksSource(
  pluginRoot: string,
  endpoint: HerdrEndpoint | null,
): HostDataSource<ApprovalAskReading> {
  return {
    key: 'approval-asks',
    script: approvalAsksScript(pluginRoot, endpoint),
    parse: parseApprovalAskReading,
    refreshMs: ASK_REFRESH_MS,
  };
}
