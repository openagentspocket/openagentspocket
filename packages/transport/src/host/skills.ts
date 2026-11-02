import {
  type AgentSkill,
  failWith,
  message,
  quotedAbsolutePath,
  type ResolvedSkillSource,
  readSkillFileCommand,
  skillDocumentContent,
  skillProbeCommand,
  skillSourceScope,
  skillSources,
  skillsFromProbeOutput,
} from '@openagentspocket/core';
import type { SshTransport } from '../transport';
import { requirePosixHost } from './environment';
import { cLocale } from './shell';

export interface SkillListQuery {
  /** The canonical Agent kind (`PROGRAM_KINDS`). */
  readonly kind: string;
  /** The Agent's launch directory; project sources are skipped without one. */
  readonly projectRoot?: string;
}

/**
 * The skills and custom slash commands installed for a kind: sources under the Host's home plus
 * project sources under `projectRoot`, per the core catalog. Kinds without a catalog entry list
 * nothing. One exec; a missing directory is an empty list, not an error.
 */
export async function listSkills(
  transport: SshTransport,
  query: SkillListQuery,
): Promise<AgentSkill[]> {
  requirePosixHost(transport, 'Skills');
  const sources = skillSources(query.kind);
  if (sources.length === 0) return [];
  const home = await transport.homeDirectory();
  const resolved: ResolvedSkillSource[] = [];
  for (const source of sources) {
    const root = source.root === 'home' ? home : query.projectRoot;
    if (!root) continue;
    const trimmed = root.endsWith('/') ? root.slice(0, -1) : root;
    const quoted = quotedAbsolutePath(`${trimmed}/${source.relativePath}`);
    if (!quoted) continue;
    resolved.push({
      scope: skillSourceScope(source),
      quotedDirectory: quoted,
      layout: source.layout,
      commandPrefix: source.commandPrefix,
    });
  }
  if (resolved.length === 0) return [];
  const result = await transport.runExec(cLocale(skillProbeCommand(resolved)));
  return skillsFromProbeOutput(result.stdout, resolved);
}

/** One skill document in full (capped); `path` is what `listSkills` reported. */
export async function readSkillFile(transport: SshTransport, path: string): Promise<string> {
  requirePosixHost(transport, 'Skills');
  const quoted = quotedAbsolutePath(path);
  if (!quoted) throw failWith({ kind: 'channelFailed', detail: 'skill path is not quotable' });
  const result = await transport.runExec(cLocale(readSkillFileCommand(quoted)));
  const content = skillDocumentContent(result.stdout);
  if (content === null) {
    throw failWith({
      kind: 'malformedResponse',
      detail: message('The skill file is gone or unreadable on the Host.'),
    });
  }
  return content;
}
