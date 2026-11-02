// The saved Chat entry points of one Host (Swift ChatCachedAgent, ChatAgentDirectory): which pane
// was bound to which conversation, enough to open Chat before the Host answers. A directory is only
// revived for the machine that wrote it, so another server never inherits these bindings.

import type { ConsoleRow } from '../../console/row';
import { rowDirectory } from '../../console/row';
import { type Host, hostDisplayName, jumpUsernameOn, primaryRoute } from '../../hosts/host';
import { hostTrustKey } from '../../hosts/host-key-policy';
import type { KnownHostsStore } from '../../hosts/known-hosts';
import { encodeBase64 } from '../../hosts/text';
import type { AgentSessionInfo } from '../../protocol/herdr-types.generated';
import { resolveConversation } from './conversation-reference';
import type { ChatProgram } from './types';

/** A saved entry point, not a claim that its Agent is still running. */
export interface ChatCachedAgent {
  hostID: string;
  paneID: string;
  terminalID: string;
  workspaceID: string;
  tabID: string;
  kind: string;
  name: string | null;
  title: string;
  paneTitle: string | null;
  agentSession: AgentSessionInfo | null;
  cwd: string;
  /** The Agent's directory when saved (live pane directory first). */
  directory: string | null;
  workspaceLabel: string | null;
  tabLabel: string | null;
  paneLabel: string | null;
  tabPosition: number | null;
  workspaceTabCount: number;
  snapshotOrder: number | null;
}

export function cachedAgentFromRow(row: ConsoleRow): ChatCachedAgent {
  const agent = row.agent;
  return {
    hostID: row.hostId,
    paneID: agent.pane_id,
    terminalID: agent.terminal_id,
    workspaceID: agent.workspace_id,
    tabID: agent.tab_id,
    kind: agent.agent ?? '',
    name: agent.name ?? null,
    title: agent.title ?? '',
    paneTitle: agent.terminal_title ?? null,
    agentSession: agent.agent_session ?? null,
    cwd: agent.cwd ?? '',
    directory: rowDirectory(row) ?? null,
    workspaceLabel: row.workspaceLabel ?? null,
    tabLabel: row.tabLabel ?? null,
    paneLabel: row.paneLabel ?? null,
    tabPosition: row.tabPosition ?? null,
    workspaceTabCount: row.workspaceTabCount,
    snapshotOrder: row.snapshotOrder ?? null,
  };
}

/** The Console row for a saved entry: identity and labels survive, live status does not. */
export function consoleRowFromCached(cached: ChatCachedAgent, host: Host): ConsoleRow {
  return {
    hostId: host.id,
    hostName: hostDisplayName(host),
    hostUsername: host.username,
    agent: {
      agent: cached.kind,
      agent_status: 'unknown',
      focused: false,
      pane_id: cached.paneID,
      revision: 0,
      tab_id: cached.tabID,
      terminal_id: cached.terminalID,
      workspace_id: cached.workspaceID,
      name: cached.name,
      title: cached.title,
      terminal_title: cached.paneTitle,
      agent_session: cached.agentSession,
      cwd: cached.cwd,
      foreground_cwd: cached.directory,
    },
    ...(cached.workspaceLabel !== null && { workspaceLabel: cached.workspaceLabel }),
    ...(cached.tabLabel !== null && { tabLabel: cached.tabLabel }),
    ...(cached.paneLabel !== null && { paneLabel: cached.paneLabel }),
    ...(cached.tabPosition !== null && { tabPosition: cached.tabPosition }),
    workspaceTabCount: cached.workspaceTabCount,
    tabPaneCount: 1,
    ...(cached.snapshotOrder !== null && { snapshotOrder: cached.snapshotOrder }),
  };
}

/** Whether the entry belongs to `host` and names a conversation of the program it ran. */
export function isCachedAgentValid(cached: ChatCachedAgent, host: Host): boolean {
  if (cached.hostID !== host.id || cached.paneID === '') return false;
  const resolution = resolveConversation(cached.agentSession);
  if (resolution.type !== 'bound') return false;
  const program: ChatProgram = resolution.reference.program;
  return program === cached.kind;
}

/** What names a machine: the Host's account, session and routes, plus the host keys it trusts. */
export interface CachedHostIdentity {
  id: string;
  address: string;
  port: number;
  username: string;
  sessionName: string;
  jumpAddress: string;
  jumpPort: number;
  jumpUsername: string;
  /** Base64 SHA-256 digests of the trusted host keys, sorted; null when none are trusted yet. */
  hostKeys: string[] | null;
  herdrSocketPath: string | null;
}

export function cachedHostIdentity(host: Host, hostKeys: readonly string[]): CachedHostIdentity {
  const route = primaryRoute(host);
  return {
    id: host.id,
    address: route.address,
    port: route.port,
    username: host.username,
    sessionName: host.sessionName,
    jumpAddress: route.jumpAddress,
    jumpPort: route.jumpPort,
    jumpUsername: jumpUsernameOn(host, route),
    hostKeys: hostKeys.length === 0 ? null : [...hostKeys].sort(),
    herdrSocketPath: host.herdrEndpoint?.socketPath ?? null,
  };
}

/**
 * Whether a directory saved under `saved` belongs to `current`. Routes may change freely while a
 * trusted key is shared (a Host can trust one key per algorithm and adding one keeps the others);
 * with no key on either side the primary route is compared, as before Routes.
 */
export function cachedIdentityAdmits(
  saved: CachedHostIdentity,
  current: CachedHostIdentity,
): boolean {
  if (
    saved.id !== current.id ||
    saved.username !== current.username ||
    saved.sessionName !== current.sessionName ||
    saved.herdrSocketPath !== current.herdrSocketPath
  ) {
    return false;
  }
  if (saved.hostKeys && current.hostKeys) {
    const trusted = new Set(current.hostKeys);
    return saved.hostKeys.some((key) => trusted.has(key));
  }
  return (
    saved.address === current.address &&
    saved.port === current.port &&
    saved.jumpAddress === current.jumpAddress &&
    saved.jumpPort === current.jumpPort &&
    saved.jumpUsername === current.jumpUsername
  );
}

export const AGENT_DIRECTORY_FORMAT_VERSION = 1;

export interface ChatAgentDirectory {
  formatVersion: number;
  host: CachedHostIdentity;
  agents: ChatCachedAgent[];
}

export function makeAgentDirectory(
  agents: readonly ChatCachedAgent[],
  host: Host,
  hostKeys: readonly string[],
): ChatAgentDirectory {
  return {
    formatVersion: AGENT_DIRECTORY_FORMAT_VERSION,
    host: cachedHostIdentity(host, hostKeys),
    agents: agents.filter((agent) => isCachedAgentValid(agent, host)),
  };
}

export function directoryBelongsTo(
  directory: ChatAgentDirectory,
  host: Host,
  hostKeys: readonly string[],
): boolean {
  return (
    directory.formatVersion === AGENT_DIRECTORY_FORMAT_VERSION &&
    cachedIdentityAdmits(directory.host, cachedHostIdentity(host, hostKeys))
  );
}

export function directoryEntries(
  directory: ChatAgentDirectory,
  host: Host,
  hostKeys: readonly string[],
): ChatCachedAgent[] {
  if (!directoryBelongsTo(directory, host, hostKeys)) return [];
  return directory.agents.filter((agent) => isCachedAgentValid(agent, host));
}

/** Null when the text is not a directory of this format. */
export function decodeAgentDirectory(text: string): ChatAgentDirectory | null {
  try {
    const value = JSON.parse(text) as Partial<ChatAgentDirectory> | null;
    if (!value || typeof value.host !== 'object' || value.host === null) return null;
    if (!Array.isArray(value.agents) || typeof value.formatVersion !== 'number') return null;
    return value as ChatAgentDirectory;
  } catch {
    return null;
  }
}

/** Where the device reads the keys it trusts for a Host: its own TOFU store, nothing asked of the Host. */
export type TrustedHostKeys = (hostID: string) => readonly string[] | Promise<readonly string[]>;

/** Base64 digests of every key trusted for the Host, from the device's known-hosts store. */
export function trustedHostKeysFrom(knownHosts: KnownHostsStore): TrustedHostKeys {
  return (hostID) => {
    const key = hostTrustKey(hostID);
    return knownHosts.fingerprints(key.host, key.port).map((f) => encodeBase64(f.digest));
  };
}
