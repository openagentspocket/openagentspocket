import {
  AGENT_INTEGRATIONS,
  type IntegrationStatus,
  integrationStatuses,
} from '@openagentspocket/core';
import type { SshTransport } from '../transport';
import { requirePosixHost } from './environment';
import { sessionName } from './plugin';
import { pluginStepCommand } from './plugin-step';
import { cLocale } from './shell';

const FEATURE = "herdr's agent integrations";
const TIMEOUT_MS = 60_000;

async function runHerdr(transport: SshTransport, args: readonly string[]): Promise<string> {
  requirePosixHost(transport, FEATURE);
  const command = pluginStepCommand(args, {
    session: sessionName(transport),
    endpoint: transport.settings.endpoint ?? null,
    findsNode: false,
  });
  const result = await transport.runExec(cLocale(command), TIMEOUT_MS);
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || `herdr ${args.join(' ')} exited with ${result.exitCode}`,
    );
  }
  return result.stdout;
}

/** Which of herdr's agent integrations the Host has, from `herdr integration status`. */
export async function readIntegrationStatuses(
  transport: SshTransport,
): Promise<Map<string, IntegrationStatus>> {
  return integrationStatuses(await runHerdr(transport, ['integration', 'status']));
}

/** `herdr integration install <id>`, for an id from herdr's own list only. */
export async function installIntegration(transport: SshTransport, id: string): Promise<void> {
  if (!AGENT_INTEGRATIONS.some((integration) => integration.id === id)) {
    throw new Error(`herdr has no ${id} integration`);
  }
  await runHerdr(transport, ['integration', 'install', id]);
}
