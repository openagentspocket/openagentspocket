import {
  type ApprovalApplyRequest,
  approvalApplyResult,
  approvalApplyScript,
  type HerdrEndpoint,
} from '@openagentspocket/core';
import type { SshTransport } from '../transport';
import { runHostDataScript } from './host-data';
import { readPlugin } from './plugin';

/** Asks the Host's plugin to answer: it re-reads the screen and presses the digit only on a match. */
export async function applyApproval(
  transport: SshTransport,
  request: ApprovalApplyRequest,
  endpoint: HerdrEndpoint | null,
): Promise<string> {
  const plugin = await readPlugin(transport);
  if (!plugin?.isEnabled || !plugin.pluginRoot) return 'plugin_unavailable';
  const script = approvalApplyScript(plugin.pluginRoot, request, endpoint);
  return approvalApplyResult(await runHostDataScript(transport, 'approval', script));
}
