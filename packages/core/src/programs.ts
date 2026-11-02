/**
 * Which program an Agent runs, as every surface shows it: the product name, the brand whose logo
 * stands for it, or none. Ported from Swift's AgentProgramIdentity / SupportedAgentKind. The one
 * place that maps herdr's program ("claude") to what the app draws.
 */

/** The programs with a logo (all from Lobe Icons, MIT). Never draw a look-alike for the rest. */
export const PROGRAM_BRANDS = [
  'claude',
  'openai',
  'gemini',
  'cursor',
  'cline',
  'copilot',
  'kimi',
  'opencode',
  'qwen',
  'pi',
  'devin',
  'antigravity',
  'mastra',
  'kiro',
  'amp',
  'grok',
  'hermes',
  'kilo',
  'qoder',
] as const;
export type ProgramBrand = (typeof PROGRAM_BRANDS)[number];

interface ProgramKindInfo {
  /** The canonical `agent.start.kind`. */
  kind: string;
  displayName: string;
  /** The executable herdr launches when it differs from the kind. */
  executable?: string;
  brand?: ProgramBrand;
}

/** Every kind herdr can start (Swift's SupportedAgentKind). */
export const PROGRAM_KINDS: readonly ProgramKindInfo[] = [
  { kind: 'pi', displayName: 'Pi', brand: 'pi' },
  { kind: 'claude', displayName: 'Claude Code', brand: 'claude' },
  { kind: 'codex', displayName: 'Codex', brand: 'openai' },
  { kind: 'gemini', displayName: 'Gemini CLI', brand: 'gemini' },
  { kind: 'cursor', displayName: 'Cursor Agent', executable: 'cursor-agent', brand: 'cursor' },
  { kind: 'devin', displayName: 'Devin CLI', brand: 'devin' },
  { kind: 'agy', displayName: 'Antigravity', brand: 'antigravity' },
  { kind: 'cline', displayName: 'Cline', brand: 'cline' },
  { kind: 'omp', displayName: 'OMP' },
  { kind: 'mastracode', displayName: 'Mastra Code', brand: 'mastra' },
  { kind: 'opencode', displayName: 'OpenCode', brand: 'opencode' },
  { kind: 'copilot', displayName: 'GitHub Copilot CLI', brand: 'copilot' },
  { kind: 'kimi', displayName: 'Kimi CLI', brand: 'kimi' },
  { kind: 'kiro', displayName: 'Kiro CLI', executable: 'kiro-cli', brand: 'kiro' },
  { kind: 'droid', displayName: 'Droid' },
  { kind: 'amp', displayName: 'Amp', brand: 'amp' },
  { kind: 'grok', displayName: 'Grok Build', brand: 'grok' },
  { kind: 'hermes', displayName: 'Hermes Agent', brand: 'hermes' },
  { kind: 'kilo', displayName: 'Kilo Code', brand: 'kilo' },
  { kind: 'qodercli', displayName: 'Qoder CLI', brand: 'qoder' },
  { kind: 'maki', displayName: 'Maki' },
  { kind: 'muse', displayName: 'Muse' },
  { kind: 'qwen', displayName: 'Qwen Code', brand: 'qwen' },
  { kind: 'letta', displayName: 'Letta Code' },
];

/** Other spellings plugins, launch commands and herdr versions use (keys are normalized). */
const ALIASES: Record<string, string> = {
  'claude-code': 'claude',
  claudecode: 'claude',
  'gemini-cli': 'gemini',
  antigravity: 'agy',
  'github-copilot': 'copilot',
  'copilot-cli': 'copilot',
  'kimi-cli': 'kimi',
  'devin-cli': 'devin',
  mastra: 'mastracode',
  'mastra-code': 'mastracode',
  kilocode: 'kilo',
  'kilo-code': 'kilo',
  qoder: 'qodercli',
  'qwen-code': 'qwen',
  'letta-code': 'letta',
  'hermes-agent': 'hermes',
  'factory-droid': 'droid',
};

export interface ProgramIdentity {
  /** The program as herdr reported it, trimmed. */
  program: string;
  /** The catalog kind it resolves to; undefined when unknown. */
  kind?: string;
  /** "Claude Code"; the reported program when unknown, "Agent" when blank. */
  displayName: string;
  /** Undefined draws the neutral monogram. */
  brand?: ProgramBrand;
}

function normalize(program: string): string {
  return program.toLowerCase().replace(/[ _]/g, '-');
}

function findKind(program: string): ProgramKindInfo | undefined {
  const key = normalize(program);
  if (!key) return undefined;
  const byKind = (kind: string) => PROGRAM_KINDS.find((info) => info.kind === kind);
  return (
    byKind(key) ??
    PROGRAM_KINDS.find((info) => (info.executable ?? info.kind) === key) ??
    (ALIASES[key] ? byKind(ALIASES[key]) : undefined) ??
    // A product name ("Claude Code", "Gemini CLI").
    PROGRAM_KINDS.find((info) => info.displayName.toLowerCase() === program.toLowerCase())
  );
}

/** Resolves a reported program (case-insensitive; spaces and underscores read as hyphens). */
export function programIdentity(reported: string): ProgramIdentity {
  const program = reported.trim();
  const info = findKind(program);
  return {
    program,
    kind: info?.kind,
    displayName: info?.displayName ?? (program || 'Agent'),
    brand: info?.brand,
  };
}
