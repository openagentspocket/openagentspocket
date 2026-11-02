import { containsOnlySafeScalars, normalizingNewlines } from '../terminal/text-safety';
import { type AgentSkill, makeSkill, type SkillScope, skillCommand } from './agent-skill';
import { parseSkillFrontmatter, type SkillFrontmatter } from './frontmatter';
import type { SkillLayout } from './source-catalog';

// The one-round-trip skills probe: the exec command that walks a kind's source directories and
// the parser for its marker-framed output. Markers keep login-shell noise harmless.

/** File markers carry the source index: `__AGENTICO_SKILL_3__=path`. */
export const SKILL_FILE_MARKER_PREFIX = '__AGENTICO_SKILL_';
export const SKILL_END_MARKER = '__AGENTICO_SKILL_END__';
/** Frontmatter lives at the top of the file; the cap keeps big skills off the channel. */
export const SKILL_MAX_BYTES_PER_FILE = 4096;
export const SKILL_MAX_BYTES_PER_DOCUMENT = 65_536;

export function skillFileMarker(sourceIndex: number): string {
  return `${SKILL_FILE_MARKER_PREFIX}${sourceIndex}__=`;
}

/** A source resolved against a Host: scope and prefix plus the quoted absolute directory. */
export interface ResolvedSkillSource {
  readonly scope: SkillScope;
  readonly quotedDirectory: string;
  readonly layout: SkillLayout;
  readonly commandPrefix: string;
}

const glob = (layout: SkillLayout) => (layout === 'skillDirectories' ? '/*/SKILL.md' : '/*.md');

/**
 * One `/bin/sh` command covering every source. Directories are positional arguments, so no path
 * is interpolated into the script; the globs are constants. Always exits 0: a missing directory
 * is an empty pane, not an error.
 */
export function skillProbeCommand(sources: readonly ResolvedSkillSource[]): string {
  const loops = sources.map(
    (source, index) =>
      `for f in "$${index + 1}"${glob(source.layout)}; do ` +
      `[ -f "$f" ] || continue; ` +
      `printf "${skillFileMarker(index)}%s\\n" "$f"; ` +
      `head -c ${SKILL_MAX_BYTES_PER_FILE} "$f"; ` +
      `printf "\\n${SKILL_END_MARKER}\\n"; done`,
  );
  const script = `${loops.join('; ')}; exit 0`;
  const args = sources.map((source) => source.quotedDirectory).join(' ');
  return `/bin/sh -c '${script}' herdr-skills-probe ${args}`;
}

/** One skill document read in full; a missing file prints no marker, so it parses as absent. */
export function readSkillFileCommand(quotedPath: string): string {
  return (
    `/bin/sh -c '[ -f "$1" ] || exit 0; ` +
    `printf "${skillFileMarker(0)}%s\\n" "$1"; ` +
    `head -c ${SKILL_MAX_BYTES_PER_DOCUMENT} "$1"; ` +
    `printf "\\n${SKILL_END_MARKER}\\n"' herdr-skill-read ${quotedPath}`
  );
}

/** One file the probe printed: which source found it, where, and what its head contained. */
export interface ProbedSkillFile {
  readonly sourceIndex: number;
  readonly path: string;
  readonly content: string;
}

function beginEntry(line: string): { sourceIndex: number; path: string } | undefined {
  if (!line.startsWith(SKILL_FILE_MARKER_PREFIX)) return undefined;
  const rest = line.slice(SKILL_FILE_MARKER_PREFIX.length);
  const separator = rest.indexOf('__=');
  if (separator < 0) return undefined;
  const digits = rest.slice(0, separator);
  if (!/^\d+$/.test(digits)) return undefined;
  return { sourceIndex: Number(digits), path: rest.slice(separator + 3) };
}

/**
 * Splits marker-framed output into files. Lines outside a begin/end pair are noise; a begin
 * marker inside a file's content starts a fresh entry rather than corrupting the current one.
 */
export function probedSkillFiles(output: string): ProbedSkillFile[] {
  const files: ProbedSkillFile[] = [];
  let current: { sourceIndex: number; path: string; lines: string[] } | undefined;
  for (const line of normalizingNewlines(output).split('\n')) {
    const entry = beginEntry(line);
    if (entry) {
      current = { ...entry, lines: [] };
    } else if (line === SKILL_END_MARKER) {
      if (current) {
        files.push({
          sourceIndex: current.sourceIndex,
          path: current.path,
          content: current.lines.join('\n'),
        });
      }
      current = undefined;
    } else {
      current?.lines.push(line);
    }
  }
  return files;
}

/** The full document of a `readSkillFileCommand` run, or null when the file was absent. */
export function skillDocumentContent(output: string): string | null {
  return probedSkillFiles(output)[0]?.content ?? null;
}

/** A name becomes terminal input, so it must survive as one word. */
function isUsableName(name: string): boolean {
  return (
    name !== '' && [...name].length <= 100 && !/\s/u.test(name) && containsOnlySafeScalars(name)
  );
}

function skillName(file: ProbedSkillFile, frontmatter: SkillFrontmatter): string | undefined {
  if (frontmatter.name && isUsableName(frontmatter.name)) return frontmatter.name;
  const components = file.path.split('/').filter((part) => part !== '');
  const last = components[components.length - 1];
  const fallback =
    last === 'SKILL.md'
      ? components[components.length - 2]
      : last?.endsWith('.md')
        ? last.slice(0, -3)
        : last;
  return fallback !== undefined && isUsableName(fallback) ? fallback : undefined;
}

/** Descriptions are display-only: control characters drop, an empty result is "none". */
function safeDescription(description: string | undefined): string | undefined {
  if (description === undefined) return undefined;
  let cleaned = '';
  for (const char of description) {
    const code = char.codePointAt(0) ?? 0;
    const control = code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    if (char === ' ' || char === '\t' || char === '\n' || !control) cleaned += char;
  }
  const trimmed = cleaned.trim();
  return trimmed === '' ? undefined : trimmed;
}

/**
 * The full pipeline: parse, name each file by its layout, drop unusable names, shadow duplicate
 * commands in probe order (project sources run first), and sort each scope alphabetically with
 * project skills first.
 */
export function skillsFromProbeOutput(
  output: string,
  sources: readonly ResolvedSkillSource[],
): AgentSkill[] {
  const seen = new Set<string>();
  const skills: AgentSkill[] = [];
  for (const file of probedSkillFiles(output)) {
    const source = sources[file.sourceIndex];
    if (!source) continue;
    const frontmatter = parseSkillFrontmatter(file.content);
    const name = skillName(file, frontmatter);
    if (name === undefined) continue;
    const skill = makeSkill({
      scope: source.scope,
      name,
      description: safeDescription(frontmatter.description),
      commandPrefix: source.commandPrefix,
      path: file.path,
      isUserInvocable: frontmatter.isUserInvocable,
    });
    const command = skillCommand(skill);
    if (seen.has(command)) continue;
    seen.add(command);
    skills.push(skill);
  }
  const rank = (skill: AgentSkill) => (skill.scope === 'global' ? 1 : 0);
  return skills.sort(
    (a, b) => rank(a) - rank(b) || a.name.toLowerCase().localeCompare(b.name.toLowerCase(), 'en'),
  );
}
