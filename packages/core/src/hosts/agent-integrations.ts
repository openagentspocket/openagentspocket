// herdr's built-in agent integrations (`herdr integration install <id>`, herdr 0.9.5): the hook
// that makes a program report its Agent and session, without which Chat has nothing to read.
// When herdr detects no Agent in a pane, the pane's processes still say which program runs, and
// `herdr integration status` says why it does not report.

import type * as herdr from '../protocol/herdr-types.generated';

export interface AgentIntegration {
  /** herdr's integration id. */
  readonly id: string;
  /** The program's own name, to show. */
  readonly label: string;
  /** Executable names that run it. */
  readonly binaries: readonly string[];
}

export const AGENT_INTEGRATIONS: readonly AgentIntegration[] = [
  { id: 'claude', label: 'Claude Code', binaries: ['claude'] },
  { id: 'codex', label: 'Codex', binaries: ['codex'] },
  { id: 'opencode', label: 'OpenCode', binaries: ['opencode'] },
  { id: 'hermes', label: 'Hermes Agent', binaries: ['hermes'] },
  { id: 'pi', label: 'Pi', binaries: ['pi'] },
  { id: 'omp', label: 'Oh My Pi', binaries: ['omp'] },
  { id: 'grok', label: 'Grok', binaries: ['grok'] },
  { id: 'copilot', label: 'GitHub Copilot', binaries: ['copilot'] },
  { id: 'cursor', label: 'Cursor', binaries: ['cursor-agent'] },
  { id: 'devin', label: 'Devin', binaries: ['devin'] },
  { id: 'droid', label: 'Droid', binaries: ['droid'] },
  { id: 'kimi', label: 'Kimi', binaries: ['kimi'] },
  { id: 'kilo', label: 'Kilo Code', binaries: ['kilo', 'kilocode'] },
  { id: 'qodercli', label: 'Qoder', binaries: ['qodercli'] },
  { id: 'qwen', label: 'Qwen Code', binaries: ['qwen'] },
  { id: 'mastracode', label: 'Mastra Code', binaries: ['mastracode'] },
  { id: 'antigravity-cli', label: 'Antigravity', binaries: ['antigravity'] },
  { id: 'letta', label: 'Letta', binaries: ['letta'] },
];

/** A program found in a pane; `otherUser` when it runs through sudo or su, as another account. */
export interface PaneProgram {
  readonly id: string;
  readonly label: string;
  readonly otherUser: boolean;
}

const SWITCH_USER = new Set(['sudo', 'su', 'doas', 'runuser']);
const base = (word: string) => word.replace(/^-/, '').split('/').pop() ?? word;

/** The program with an integration that a pane's foreground processes run, or null. */
export function programInPane(
  info: Pick<herdr.PaneProcessInfo, 'foreground_processes'>,
): PaneProgram | null {
  for (const process of info.foreground_processes ?? []) {
    const words = [process.argv0 ?? '', ...(process.argv ?? []), process.name].map(base);
    const integration = AGENT_INTEGRATIONS.find((candidate) =>
      words.some((word) => candidate.binaries.includes(word)),
    );
    if (!integration) continue;
    const otherUser = SWITCH_USER.has(base(process.argv?.[0] ?? process.argv0 ?? process.name));
    return { id: integration.id, label: integration.label, otherUser };
  }
  return null;
}

export type IntegrationStatus = 'installed' | 'missing' | 'outdated';

const STATUS_LINE = /^([\w-]+)(?: \([^)]*\))?: (.+?)(?: \(|$)/u;

/** `herdr integration status`, one line per integration. */
export function integrationStatuses(output: string): Map<string, IntegrationStatus> {
  const statuses = new Map<string, IntegrationStatus>();
  for (const line of output.split('\n')) {
    const match = STATUS_LINE.exec(line.trim());
    if (!match?.[1] || !match[2]) continue;
    const state = match[2].trim();
    statuses.set(
      match[1],
      state === 'not installed' ? 'missing' : state === 'current' ? 'installed' : 'outdated',
    );
  }
  return statuses;
}

/** Why a program herdr does not report has no Chat, and the way out. */
export type UndetectedProgramNotice =
  | { readonly kind: 'install'; readonly program: PaneProgram }
  | { readonly kind: 'restart'; readonly program: PaneProgram }
  | { readonly kind: 'otherUser'; readonly program: PaneProgram };

export function undetectedProgramNotice(
  program: PaneProgram | null,
  statuses: ReadonlyMap<string, IntegrationStatus> | null,
): UndetectedProgramNotice | null {
  if (!program) return null;
  // Its hooks would run as that account, which cannot reach this herdr.
  if (program.otherUser) return { kind: 'otherUser', program };
  if (!statuses) return null;
  const status = statuses.get(program.id);
  if (status === 'missing' || status === 'outdated') return { kind: 'install', program };
  return status === 'installed' ? { kind: 'restart', program } : null;
}
