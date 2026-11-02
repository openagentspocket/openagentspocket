import type * as herdr from '../protocol/herdr-types.generated';

/** The wire record of one Agent (`AgentInfo`), the source of every field below. */
export type AgentInfo = herdr.AgentInfo;

/** An empty wire string carries no value: treating it as missing keeps fallbacks from rendering blanks. */
export function nonEmpty(value: string | null | undefined): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : value;
}

/** The program herdr detected ("claude", "codex", ...); behavior stays keyed off this. */
export function agentKind(agent: AgentInfo): string {
  return agent.agent ?? 'unknown';
}

/** The card's primary label: the server-reported name when present, else the detected kind. */
export function agentDisplayName(agent: AgentInfo): string {
  return nonEmpty(agent.display_agent) ?? nonEmpty(agent.name) ?? agentKind(agent);
}

const GLYPH_PREFIX = /^[\s⠀-⣿◐-◓○-●✢✱✳✶✻✽]+/u;

/** The title without leading spinner/status glyphs and the whitespace around them. */
export function stripTitleGlyphs(title: string): string {
  return title.replace(GLYPH_PREFIX, '');
}

const SIDEBAR_GLYPHS = new Set([...'·✢✳✶✻✽◐◓◑◒']);

/** herdr 0.8.2 removes one activity glyph only when followed by whitespace or end of title. */
function strippedSidebarTitle(raw: string): string {
  const trimmed = raw.trim();
  const first = trimmed.codePointAt(0);
  if (first === undefined) return trimmed;
  const glyph = String.fromCodePoint(first);
  const isGlyph = (first >= 0x2800 && first <= 0x28ff) || SIDEBAR_GLYPHS.has(glyph);
  if (!isGlyph) return trimmed;
  const rest = trimmed.slice(glyph.length);
  return rest === '' || /^\s/u.test(rest) ? rest.trim() : trimmed;
}

/** herdr's stripped title; an explicitly empty wire value stays empty. */
export function agentTerminalTitleStripped(agent: AgentInfo): string | undefined {
  const stripped = agent.terminal_title_stripped;
  if (stripped !== undefined && stripped !== null) return stripped;
  const raw = agent.terminal_title;
  return raw === undefined || raw === null ? undefined : strippedSidebarTitle(raw);
}

/** The legacy title: terminal title with spinner glyphs stripped, empty when none. */
export function agentTitle(agent: AgentInfo): string {
  return stripTitleGlyphs(agent.terminal_title_stripped ?? agent.terminal_title ?? '');
}

const KIND_LABELS: Readonly<Record<string, string>> = {
  pi: 'Pi',
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini CLI',
  cursor: 'Cursor Agent',
  devin: 'Devin CLI',
  agy: 'Antigravity',
  cline: 'Cline',
  omp: 'OMP',
  mastracode: 'Mastra Code',
  opencode: 'OpenCode',
  copilot: 'GitHub Copilot CLI',
  kimi: 'Kimi CLI',
  kiro: 'Kiro CLI',
  droid: 'Droid',
  amp: 'Amp',
  grok: 'Grok Build',
  hermes: 'Hermes Agent',
  kilo: 'Kilo Code',
  qodercli: 'Qoder CLI',
  maki: 'Maki',
  muse: 'Muse',
  qwen: 'Qwen Code',
  letta: 'Letta Code',
};

/** The friendly program name notifications use ("Pi", "Claude"); unknown kinds keep their spelling. */
export function agentKindLabel(raw: string): string {
  const kind = raw.trim() === '' ? 'unknown' : raw;
  const lowered = kind.toLowerCase();
  if (lowered === 'unknown') return 'Unknown';
  return Object.hasOwn(KIND_LABELS, lowered) ? (KIND_LABELS[lowered] as string) : kind;
}
