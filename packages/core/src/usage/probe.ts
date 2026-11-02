import { message } from '../errors/text';
import { TransportFailure } from '../errors/transport-error';
import type { HerdrEndpoint } from '../hosts/herdr-endpoint';
import { herdrScriptCommand } from '../hosts/host-path';
import { decodeUsageReport, type UsageReport, UsageReportError } from './report';

/** The whole framed response is capped here; truncation removes the end marker. */
export const USAGE_PROBE_MAX_BYTES = 1_048_576;

const NONCE = /^[0-9A-Za-z-]+$/;
const BEGIN = (nonce: string) => `__AGENTICO_USAGE_BEGIN_${nonce}`;
const END = (nonce: string) => `__AGENTICO_USAGE_END_${nonce}`;

const malformed = (text: string) =>
  new TransportFailure({ kind: 'malformedResponse', detail: message(text) });

const singleQuoted = (text: string) => `'${text.replaceAll("'", "'\\''")}'`;

/**
 * Whether the identifier can reach the plugin's `--tz` flag: the plugin's own character grammar
 * (which keeps the single-quoted shell argument safe) and a zone the runtime can resolve.
 */
export function isQueryableTimeZone(identifier: string): boolean {
  const segments = identifier.split('/');
  const grammar = segments.every(
    (segment, index) =>
      segment.length > 0 &&
      [...segment].every((char) => {
        const code = char.charCodeAt(0);
        return (
          (code >= 65 && code <= 90) ||
          (code >= 97 && code <= 122) ||
          char === '_' ||
          char === '+' ||
          char === '-' ||
          (index > 0 && code >= 48 && code <= 57)
        );
      }),
  );
  if (!grammar) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: identifier });
    return true;
  } catch {
    return false;
  }
}

export interface UsageProbeOptions {
  /** Absolute path of the Agentico plugin's install directory. */
  readonly pluginRoot: string;
  readonly timeZone: string;
  /** Asks the plugin to read Claude Code's plan limits too. */
  readonly claudeLimits: boolean;
  readonly nonce: string;
  readonly endpoint: HerdrEndpoint | null;
}

/**
 * The shell script for one ordinary SSH exec. Transcript paths and credentials never enter this
 * protocol. The output is nonce-framed and capped, so a plausible JSON prefix can never read as a
 * successful response.
 */
export function usageProbeScript(options: UsageProbeOptions): string {
  const { pluginRoot, timeZone, claudeLimits, nonce, endpoint } = options;
  if (
    !isQueryableTimeZone(timeZone) ||
    !pluginRoot.startsWith('/') ||
    pluginRoot.includes('\0') ||
    !NONCE.test(nonce)
  ) {
    throw malformed('The Usage query arguments are invalid.');
  }
  const { environment, command } = herdrScriptCommand(endpoint, 'plugin config-dir agentico');
  const query = singleQuoted(`${pluginRoot}/src/usage-query.js`);
  const flags = claudeLimits ? ' --claude-limits' : '';
  const missing = `printf '%s' '{"version":1,"runtime":"missing"}'`;
  return `export LC_ALL=C
(
  printf '%s\\n' '${BEGIN(nonce)}'
  ${environment}
  usage_read() {
    config=$(${command}) || return $?
    case "$config" in /*) ;; *) return 1 ;; esac
    export HERDR_PLUGIN_CONFIG_DIR="$config"
    if ! IFS= read -r node < "$config/runtime-node"; then
      ${missing}
      return 0
    fi
    case "$node" in
      /*) ;;
      *) ${missing}; return 0 ;;
    esac
    "$node" ${query} --tz '${timeZone}'${flags}
    result=$?
    case "$result" in
      126|127) ${missing}; return 0 ;;
      *) return "$result" ;;
    esac
  }
  usage_read
  result=$?
  printf '\\n%s:%s\\n' '${END(nonce)}' "$result"
) | head -c ${USAGE_PROBE_MAX_BYTES}
`;
}

/** Decodes a complete nonce-framed response; anything else (truncated, wrong nonce, nonzero exit) throws. */
export function parseUsageProbe(stdout: string, nonce: string): UsageReport {
  const begin = `${BEGIN(nonce)}\n`;
  const start = stdout.indexOf(begin);
  if (start < 0) throw malformed('The Host did not finish its Usage response.');
  const bodyStart = start + begin.length;
  const endMarker = `\n${END(nonce)}:`;
  const end = stdout.indexOf(endMarker, bodyStart);
  if (end < 0) throw malformed('The Host did not finish its Usage response.');
  const statusStart = end + endMarker.length;
  const statusEnd = stdout.indexOf('\n', statusStart);
  if (statusEnd < 0 || stdout.slice(statusStart, statusEnd) !== '0') {
    throw malformed('The Host did not finish its Usage response.');
  }
  try {
    return decodeUsageReport(stdout.slice(bodyStart, end));
  } catch (error) {
    // A newer plugin's format is not a broken response: the caller asks the user to update.
    if (error instanceof UsageReportError && error.reason === 'unsupportedVersion') throw error;
    throw malformed('The Host did not finish its Usage response.');
  }
}
