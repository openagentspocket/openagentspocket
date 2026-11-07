import {
  type ApprovalApplyRequest,
  type ApprovalAskReading,
  approvalApplyResult,
  approvalApplyScript,
  approvalAsksSource,
  type HerdrEndpoint,
  type HostDataSource,
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

/** The Host's asks as a `HostDataSource`; null when its plugin cannot answer. */
export async function approvalAsksSourceOf(
  transport: SshTransport,
  endpoint: HerdrEndpoint | null,
): Promise<HostDataSource<ApprovalAskReading> | null> {
  const plugin = await readPlugin(transport);
  if (!plugin?.isEnabled || !plugin.pluginRoot) return null;
  return approvalAsksSource(plugin.pluginRoot, endpoint);
}

/** The prompts the Host's screens show right now, or that its plugin cannot answer. */
export async function readApprovalAsks(
  transport: SshTransport,
  endpoint: HerdrEndpoint | null,
): Promise<ApprovalAskReading> {
  const source = await approvalAsksSourceOf(transport, endpoint);
  if (!source) return { kind: 'pluginUnavailable' };
  return source.parse(await runHostDataScript(transport, source.key, source.script));
}
