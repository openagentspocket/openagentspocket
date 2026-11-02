import { normalizingNewlines } from '../terminal/text-safety';

/**
 * The YAML-subset frontmatter of a skill file. Lenient on purpose (remote-authored input):
 * unknown keys are skipped, malformed lines ignored, and a file without frontmatter parses to
 * empty fields rather than failing the probe.
 */
export interface SkillFrontmatter {
  name?: string;
  description?: string;
  /** False only for an explicit `user-invocable: false`. */
  isUserInvocable: boolean;
}

type BlockStyle = 'literal' | 'folded';

function blockStyleOf(indicator: string): BlockStyle | undefined {
  if (indicator.length > 2) return undefined;
  if (indicator.startsWith('|')) return 'literal';
  if (indicator.startsWith('>')) return 'folded';
  return undefined;
}

const KEY_CHARACTERS = /^[\p{L}\p{N}_-]+$/u;

function topLevelField(line: string): [string, string] | undefined {
  const colon = line.indexOf(':');
  if (colon <= 0) return undefined;
  const key = line.slice(0, colon);
  if (!KEY_CHARACTERS.test(key)) return undefined;
  return [key, line.slice(colon + 1).trim()];
}

function unquote(value: string): string {
  if (value.length < 2) return value;
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1).replaceAll('\\"', '"');
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Parses the lines between the leading `---` fence and the next `---` or `...` fence. */
export function parseSkillFrontmatter(content: string): SkillFrontmatter {
  let lines = normalizingNewlines(content).split('\n');
  if (lines[0]?.startsWith('﻿')) lines[0] = lines[0].slice(1);
  while (lines.length > 0 && (lines[0] ?? '').trim() === '') lines = lines.slice(1);
  if (lines[0]?.trim() !== '---') return { isUserInvocable: true };
  lines = lines.slice(1);

  const fields = new Map<string, string>();
  let currentKey: string | undefined;
  let blockLines: string[] = [];
  let blockStyle: BlockStyle | undefined;

  const finalizeCurrent = () => {
    if (currentKey !== undefined && blockStyle !== undefined) {
      fields.set(currentKey, blockLines.join(blockStyle === 'literal' ? '\n' : ' ').trim());
    }
    currentKey = undefined;
    blockLines = [];
    blockStyle = undefined;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '---' || trimmed === '...') break;

    const field = topLevelField(line);
    if (field) {
      finalizeCurrent();
      const [key, rest] = field;
      currentKey = key;
      blockStyle = blockStyleOf(rest);
      if (blockStyle === undefined) fields.set(key, unquote(rest));
      continue;
    }

    // Indented lines continue the current field; otherwise they are noise.
    if (currentKey === undefined || !/^\s/.test(line)) continue;
    if (blockStyle !== undefined) {
      blockLines.push(trimmed);
    } else if (trimmed !== '') {
      const existing = fields.get(currentKey) ?? '';
      fields.set(currentKey, existing === '' ? trimmed : `${existing} ${trimmed}`);
    }
  }
  finalizeCurrent();

  return {
    name: nonEmpty(fields.get('name')),
    description: nonEmpty(fields.get('description')),
    isUserInvocable: nonEmpty(fields.get('user-invocable'))?.toLowerCase() !== 'false',
  };
}
