// "Ran 2 commands, Edited 2 files": what a tool group's calls did, in a fixed order (Swift
// ChatTimelineProjection.summary). Files count once per path as the rows show it, relative to where
// the call ran; a write over an existing file counts as an edit, and a write that cannot tell counts
// as written. A path changed more than once counts once, under what its first change did; reading it
// still counts as a read. A row without its own file list (a Codex patch) names all its files in one
// title, so it counts as many as its diff has.

import { type Joined, type Message, message } from '../../errors/text';
import type { ChatToolActivity, ToolKind } from '../model/types';

type FileVerb = 'edited' | 'created' | 'wrote' | 'read';

/**
 * `path` relative to `directory` when inside it. macOS firmlinks /tmp, /var and /etc to the same
 * roots under /private, so a program may record either form on each side.
 */
export function displayFilePath(path: string, directory: string | null): string {
  if (directory === null || directory === '') return path;
  const relative = (value: string, base: string): string | null => {
    const prefix = base.endsWith('/') ? base : `${base}/`;
    return value.startsWith(prefix) && value.length > prefix.length
      ? value.slice(prefix.length)
      : null;
  };
  const unaliased = (value: string): string => {
    for (const root of ['/private/tmp', '/private/var', '/private/etc']) {
      if (value === root || value.startsWith(`${root}/`)) return value.slice('/private'.length);
    }
    return value;
  };
  return relative(path, directory) ?? relative(unaliased(path), unaliased(directory)) ?? path;
}

function fileCounts(tools: readonly ChatToolActivity[]): Record<FileVerb, number> {
  const paths: Record<FileVerb, Set<string>> = {
    edited: new Set(),
    created: new Set(),
    wrote: new Set(),
    read: new Set(),
  };
  const more: Record<FileVerb, number> = { edited: 0, created: 0, wrote: 0, read: 0 };
  const titled: Record<FileVerb, Map<string, number>> = {
    edited: new Map(),
    created: new Map(),
    wrote: new Map(),
    read: new Map(),
  };
  const firstChange = new Map<string, FileVerb>();

  /** Whether `key` counts under `verb`. */
  const note = (key: string, verb: FileVerb): boolean => {
    if (verb !== 'read') {
      const first = firstChange.get(key);
      if (first !== undefined && first !== verb) return false;
      firstChange.set(key, verb);
    }
    paths[verb].add(key);
    return true;
  };

  tools.forEach((tool, index) => {
    const verb: FileVerb | null =
      tool.kind === 'fileEdit'
        ? 'edited'
        : tool.kind === 'fileWrite'
          ? 'created'
          : tool.kind === 'fileRead'
            ? 'read'
            : null;
    if (verb === null) return;
    const changes = tool.fileChanges;
    if (changes !== null && (changes.files.length > 0 || changes.moreFiles > 0)) {
      for (const file of changes.files) {
        let fileVerb: FileVerb = verb;
        if (verb === 'created') {
          fileVerb =
            file.kind === 'created' ? 'created' : file.kind === 'written' ? 'wrote' : 'edited';
        }
        note(displayFilePath(file.path, changes.directory), fileVerb);
      }
      more[verb] += changes.moreFiles;
    } else {
      const key = tool.title === '' ? `\u0000${index}` : tool.title;
      const files = tool.diff?.files ?? 0;
      if (note(key, verb) && files > 1) {
        titled[verb].set(key, Math.max(titled[verb].get(key) ?? 0, files - 1));
      }
    }
  });

  const total = (verb: FileVerb) =>
    paths[verb].size + more[verb] + [...titled[verb].values()].reduce((a, b) => a + b, 0);
  return {
    edited: total('edited'),
    created: total('created'),
    wrote: total('wrote'),
    read: total('read'),
  };
}

export function summaryOfTools(tools: readonly ChatToolActivity[]): Joined {
  const count = (kind: ToolKind) => tools.filter((tool) => tool.kind === kind).length;
  const files = fileCounts(tools);
  const parts: Message[] = [];

  const command = count('command');
  if (command > 0)
    parts.push(
      command === 1 ? message('Ran 1 command') : message('Ran %lld commands', String(command)),
    );
  if (files.edited > 0)
    parts.push(
      files.edited === 1
        ? message('Edited 1 file')
        : message('Edited %lld files', String(files.edited)),
    );
  if (files.created > 0)
    parts.push(
      files.created === 1
        ? message('Created 1 file')
        : message('Created %lld files', String(files.created)),
    );
  if (files.wrote > 0)
    parts.push(
      files.wrote === 1
        ? message('Wrote 1 file')
        : message('Wrote %lld files', String(files.wrote)),
    );
  if (files.read > 0)
    parts.push(
      files.read === 1 ? message('Read 1 file') : message('Read %lld files', String(files.read)),
    );
  const search = count('search');
  if (search > 0)
    parts.push(
      search === 1 ? message('Ran 1 search') : message('Ran %lld searches', String(search)),
    );
  const listing = count('listing');
  if (listing > 0)
    parts.push(
      listing === 1 ? message('Listed 1 folder') : message('Listed %lld folders', String(listing)),
    );

  const web = tools.filter((tool) => tool.kind === 'web').map((tool) => tool.name.toLowerCase());
  const searches = web.filter((name) => name.includes('search')).length;
  const fetches = web.filter((name) => !name.includes('search') && name.includes('fetch')).length;
  const otherWeb = web.length - searches - fetches;
  if (searches > 0)
    parts.push(
      searches === 1
        ? message('Searched the web once')
        : message('Searched the web %lld times', String(searches)),
    );
  if (fetches > 0)
    parts.push(
      fetches === 1 ? message('Fetched 1 page') : message('Fetched %lld pages', String(fetches)),
    );
  if (otherWeb > 0)
    parts.push(
      otherWeb === 1
        ? message('Used the web once')
        : message('Used the web %lld times', String(otherWeb)),
    );

  const mcp = count('mcp');
  if (mcp > 0)
    parts.push(mcp === 1 ? message('Called 1 tool') : message('Called %lld tools', String(mcp)));
  // No verb: an image row may be one the Agent viewed or generated.
  const image = count('image');
  if (image > 0)
    parts.push(image === 1 ? message('1 image') : message('%lld images', String(image)));
  if (count('todo') > 0) parts.push(message('Updated the to-do list'));
  const other = count('other');
  if (other > 0) {
    if (parts.length === 0)
      parts.push(other === 1 ? message('Used 1 tool') : message('Used %lld tools', String(other)));
    else
      parts.push(
        other === 1 ? message('1 other tool') : message('%lld other tools', String(other)),
      );
  }
  return { join: parts, separator: ', ' };
}
