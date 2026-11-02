import {
  failures,
  failWith,
  HERDR_PATH_EXPORT,
  isValidHerdrSessionName,
  PROGRAM_KINDS,
} from '@openagentspocket/core';
import { withDeadline } from '../deadline';
import type { SshTransport } from '../transport';
import { modelContextWindow, modelProbeCommand } from './agent-model-probe';
import { hostPlatform, requirePosixHost } from './environment';
import { cLocale, launcherCommand, missingBinaryError, preview, wrappingBareHerdr } from './shell';

export const SESSION_LIST_COMMAND = 'herdr session list --json';
export const AGENT_AVAILABILITY_MARKER = '__AGENTICO_AGENT_KIND__=';

export interface HerdrSession {
  readonly name: string;
  readonly isDefault: boolean;
  readonly isRunning: boolean;
}

/** `command -v` for each catalog executable, printing a marker line per kind found. */
export function agentDiscoveryCommand(): string {
  const checks = PROGRAM_KINDS.map(
    (info) =>
      `command -v ${info.executable ?? info.kind} >/dev/null 2>&1` +
      ` && printf "${AGENT_AVAILABILITY_MARKER}%s\\n" "${info.kind}"`,
  );
  return `/bin/sh -c '${HERDR_PATH_EXPORT}; ${checks.join('; ')}; exit 0'`;
}

/**
 * Kinds reported by the discovery probe. Only marker-prefixed lines count, unknown labels are
 * dropped, and the result keeps catalog order so the picker stays stable across noisy stdout.
 */
export function discoveredAgentKinds(output: string): string[] {
  const found = new Set<string>();
  for (const line of output.split(/\r?\n|\r/)) {
    if (line.startsWith(AGENT_AVAILABILITY_MARKER)) {
      found.add(line.slice(AGENT_AVAILABILITY_MARKER.length));
    }
  }
  return PROGRAM_KINDS.map((info) => info.kind).filter((kind) => found.has(kind));
}

/** Parses `herdr session list --json`; every name must be a valid herdr session name. */
export function parseSessionList(output: string): HerdrSession[] {
  let sessions: HerdrSession[];
  try {
    const parsed = JSON.parse(output) as { sessions?: unknown };
    if (!Array.isArray(parsed.sessions)) throw new TypeError('sessions');
    sessions = parsed.sessions.map((raw: unknown) => {
      const entry = raw as { name?: unknown; default?: unknown; running?: unknown };
      if (typeof entry.name !== 'string') throw new TypeError('name');
      return {
        name: entry.name,
        isDefault: entry.default === true,
        isRunning: entry.running === true,
      };
    });
  } catch {
    throw failWith(
      failures.malformedResponse(`herdr session list returned invalid JSON: ${preview(output)}`),
    );
  }
  if (!sessions.every((session) => isValidHerdrSessionName(session.name))) {
    throw failWith(
      failures.malformedResponse('herdr session list returned an invalid session name'),
    );
  }
  return sessions;
}

/**
 * One offline Host command (session list, Agent discovery) under the request budget. Only the
 * command that runs herdr can hit the endpoint's launcher (`runsHerdr`).
 */
async function runHostCommand(
  transport: SshTransport,
  command: string,
  runsHerdr: boolean,
): Promise<string> {
  requirePosixHost(transport, 'This Host command is unavailable on native Windows');
  return withDeadline(transport.settings.clock, transport.requestBudgetMs, async () => {
    const result = await transport.runExec(cLocale(wrappingBareHerdr(command)));
    const missing = missingBinaryError(
      result.exitCode,
      command,
      runsHerdr ? (transport.settings.endpoint ?? null) : null,
    );
    if (missing) throw failWith(missing);
    return result.stdout;
  });
}

/** The named herdr sessions on the Host, through the endpoint's launcher when the Host has one. */
export async function listSessions(transport: SshTransport): Promise<HerdrSession[]> {
  const endpoint = transport.settings.endpoint ?? null;
  const command =
    (endpoint && launcherCommand(endpoint, 'session list --json')) || SESSION_LIST_COMMAND;
  return parseSessionList(await runHostCommand(transport, command, true));
}

/** The catalog kinds whose executable the Host finds. */
export async function availableAgentKinds(transport: SshTransport): Promise<string[]> {
  return discoveredAgentKinds(await runHostCommand(transport, agentDiscoveryCommand(), false));
}

/**
 * Asks omp for the model's window. An omp missing from the Host (exit 127) or any failed probe is
 * an answer of "unknown", not a failure; only a timeout or cancellation propagates.
 */
export async function agentModelContextWindow(
  transport: SshTransport,
  selector: string,
): Promise<number | null> {
  if (hostPlatform(transport) === 'nativeWindows') return null;
  const command = modelProbeCommand(selector);
  if (!command) return null;
  const result = await withDeadline(transport.settings.clock, transport.requestBudgetMs, () =>
    transport.runExec(cLocale(command)),
  );
  return result.exitCode === 0 ? modelContextWindow(result.stdout, selector) : null;
}
