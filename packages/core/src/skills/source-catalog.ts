import type { SkillScope } from './agent-skill';

export type SkillRoot = 'home' | 'project';
/** `<dir>/<name>/SKILL.md` or `<dir>/<name>.md`. */
export type SkillLayout = 'skillDirectories' | 'markdownFiles';

/** Where one Agent kind keeps skills on a Host. `relativePath` is constant, never user input. */
export interface SkillSource {
  readonly root: SkillRoot;
  /** Relative to the root, without a leading slash. */
  readonly relativePath: string;
  readonly layout: SkillLayout;
  readonly commandPrefix: string;
}

export function skillSourceScope(source: SkillSource): SkillScope {
  return source.root === 'project' ? 'project' : 'global';
}

type Entry = readonly [SkillRoot, string, SkillLayout?];

function sources(prefix: string, entries: readonly Entry[]): readonly SkillSource[] {
  return entries.map(([root, relativePath, layout]) => ({
    root,
    relativePath,
    layout: layout ?? 'skillDirectories',
    commandPrefix: prefix,
  }));
}

const P = 'project';
const H = 'home';
const MD = 'markdownFiles';

/**
 * The per-kind source table (Swift `SkillSourceCatalog`, paths verified 2026-08). Project sources
 * come first: dedupe runs in source order and a project skill shadows a global one. Discovery is
 * one directory level deep. Kinds without an entry get no Skills pane; gemini and amp are absent
 * on purpose (no typed prefix), mastracode and maki document no on-disk discovery.
 */
const CATALOG: Readonly<Record<string, readonly SkillSource[]>> = {
  claude: sources('/', [
    [P, '.claude/skills'],
    [H, '.claude/skills'],
  ]),
  // Skills only: `~/.codex/prompts` custom prompts were removed in Codex 0.117.0. `$` mentions.
  codex: sources('$', [
    [P, '.codex/skills'],
    [P, '.agents/skills'],
    [H, '.agents/skills'],
    [H, '.codex/skills'],
  ]),
  agy: sources('/', [
    [P, '.agents/skills'],
    [P, '.agents/skills', MD],
    [H, '.gemini/antigravity-cli/skills'],
    [H, '.gemini/config/skills'],
  ]),
  cline: sources('/', [
    [P, '.cline/skills'],
    [P, '.clinerules/skills'],
    [H, '.cline/skills'],
  ]),
  copilot: sources('/', [
    [P, '.github/skills'],
    [P, '.agents/skills'],
    [H, '.copilot/skills'],
    [H, '.agents/skills'],
  ]),
  cursor: sources('/', [
    [P, '.cursor/skills'],
    [P, '.agents/skills'],
    [H, '.cursor/skills'],
    [H, '.agents/skills'],
  ]),
  devin: sources('/', [
    [P, '.devin/skills'],
    [P, '.windsurf/skills'],
    [P, '.agents/skills'],
    [H, '.config/devin/skills'],
    [H, '.agents/skills'],
  ]),
  // Commands probe before skills: on a clash Droid gives the command the slash name.
  droid: sources('/', [
    [P, '.factory/commands', MD],
    [P, '.factory/skills'],
    [P, '.agents/skills'],
    [H, '.factory/commands', MD],
    [H, '.factory/skills'],
    [H, '.agents/skills'],
  ]),
  grok: sources('/', [
    [P, '.grok/skills'],
    [H, '.grok/skills'],
    [H, '.agents/skills'],
  ]),
  hermes: sources('/', [
    [P, '.hermes/skills'],
    [P, '.agents/skills'],
    [H, '.hermes/skills'],
  ]),
  // Commands/workflows only; Kilo skill directories are not documented for the CLI.
  kilo: sources('/', [
    [P, '.kilo/commands', MD],
    [P, '.kilocode/workflows', MD],
    [H, '.config/kilo/commands', MD],
    [H, '.kilocode/workflows', MD],
  ]),
  kimi: sources('/skill:', [
    [P, '.kimi/skills'],
    [P, '.kimi/skills', MD],
    [P, '.agents/skills'],
    [H, '.kimi/skills'],
    [H, '.kimi/skills', MD],
    [H, '.config/agents/skills'],
    [H, '.agents/skills'],
  ]),
  kiro: sources('/', [
    [P, '.kiro/skills'],
    [H, '.kiro/skills'],
  ]),
  omp: sources('/skill:', [
    [P, '.omp/skills'],
    [P, '.agents/skills'],
    [P, '.agent/skills'],
    [P, '.github/skills'],
    [H, '.omp/agent/skills'],
    [H, '.agents/skills'],
    [H, '.agent/skills'],
    [H, '.omp/agent/managed-skills'],
  ]),
  // Commands only: stable OpenCode skills are model-invoked, not slash-callable.
  opencode: sources('/', [
    [P, '.opencode/commands', MD],
    [P, '.opencode/command', MD],
    [H, '.config/opencode/commands', MD],
    [H, '.config/opencode/command', MD],
  ]),
  // Pi has two mechanisms: skills (`/skill:<name>`) and prompt templates (plain `/name`).
  pi: [
    ...sources('/skill:', [
      [P, '.pi/skills'],
      [P, '.pi/skills', MD],
      [P, '.agents/skills'],
    ]),
    ...sources('/', [[P, '.pi/prompts', MD]]),
    ...sources('/skill:', [
      [H, '.pi/agent/skills'],
      [H, '.pi/agent/skills', MD],
      [H, '.agents/skills'],
    ]),
    ...sources('/', [[H, '.pi/agent/prompts', MD]]),
  ],
  qodercli: sources('/', [
    [P, '.qoder/commands', MD],
    [P, '.qoder/commands'],
    [H, '.qoder/commands', MD],
    [H, '.qoder/commands'],
  ]),
  qwen: sources('/', [
    [P, '.qwen/skills'],
    [P, '.qwen/commands', MD],
    [H, '.qwen/skills'],
    [H, '.qwen/commands', MD],
  ]),
};

/** The skill sources for a canonical Agent kind (`PROGRAM_KINDS`); empty when it has none. */
export function skillSources(kind: string): readonly SkillSource[] {
  return CATALOG[kind] ?? [];
}

export function supportsSkills(kind: string): boolean {
  return skillSources(kind).length > 0;
}
