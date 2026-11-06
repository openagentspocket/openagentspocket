import { singleQuoted } from '../changes/script';
import type { HerdrEndpoint } from '../hosts/herdr-endpoint';
import { herdrScriptCommand } from '../hosts/host-path';
import { encodeBase64Url, utf8Encode } from '../pairing/bytes';
import type { ApprovalApplyRequest } from './approval-action';

const text64 = (text: string) => encodeBase64Url(utf8Encode(text));

/**
 * Runs the plugin's Host-side apply with its own node. Every value goes as one quoted argument; the
 * script prints the apply's one JSON line, or `runtime_missing` before the hooks ever ran.
 */
export function approvalApplyScript(
  pluginRoot: string,
  request: ApprovalApplyRequest,
  endpoint: HerdrEndpoint | null,
): string {
  if (!pluginRoot.startsWith('/') || pluginRoot.includes('\0')) {
    throw new RangeError('The plugin root is not an absolute path.');
  }
  const { environment, command } = herdrScriptCommand(endpoint, 'plugin config-dir agentico');
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
  return `export LC_ALL=C
${environment}
config=$(${command}) || exit 1
export HERDR_PLUGIN_CONFIG_DIR="$config"
IFS= read -r node < "$config/runtime-node" || { printf '%s\\n' '{"v":1,"result":"runtime_missing"}'; exit 0; }
"$node" ${singleQuoted(`${pluginRoot}/src/approval-apply.js`)} ${args}
`;
}

/** The result word of the apply's output; empty when it printed nothing readable. */
export function approvalApplyResult(stdout: string): string {
  const line = stdout.trim().split('\n').pop() ?? '';
  try {
    const { result } = JSON.parse(line) as { result?: unknown };
    return typeof result === 'string' ? result : '';
  } catch {
    return '';
  }
}
