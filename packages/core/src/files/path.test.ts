import { describe, expect, it } from 'vitest';
import { sourceText } from '../errors/text';
import { formatBytes } from './errors';
import { isNameUsable, sortItems, toItem } from './item';
import { isLeftoverPart, isPartName, partName } from './parts';
import {
  keepingBoth,
  looksSecret,
  MAX_NAME_UTF8_BYTES,
  nameProblem,
  RemotePath,
  safeExtension,
} from './path';

describe('RemotePath', () => {
  it('finds parents, including of names with quotes', () => {
    expect(RemotePath.parent('/')).toBeNull();
    expect(RemotePath.parent('/home')).toBe('/');
    expect(RemotePath.parent('/home/me/it\'s "x"/')).toBe('/home/me');
    expect(RemotePath.parent('relative')).toBeNull();
    expect(RemotePath.lastComponent('/a/b/')).toBe('b');
  });

  it('treats / and the folders directly in it as system paths', () => {
    expect(RemotePath.isSystemPath('/')).toBe(true);
    expect(RemotePath.isSystemPath('/etc')).toBe(true);
    expect(RemotePath.isSystemPath('/home/me')).toBe(false);
  });

  it('accepts only absolute, clean paths', () => {
    expect(RemotePath.isAcceptable('/a/b c')).toBe(true);
    for (const bad of ['a/b', '/a/../b', '/a/./b', '/a\nb', `/${'x'.repeat(5000)}`]) {
      expect(RemotePath.isAcceptable(bad)).toBe(false);
    }
  });

  it('joins without doubling slashes', () => {
    expect(RemotePath.join('/', 'a')).toBe('/a');
    expect(RemotePath.join('/a/', 'b', 'c')).toBe('/a/b/c');
  });
});

describe('names', () => {
  it('rejects what cannot be one path component', () => {
    for (const bad of [
      '',
      '  ',
      '.',
      '..',
      'a/b',
      'a\u0000b',
      'x'.repeat(MAX_NAME_UTF8_BYTES + 1),
    ]) {
      expect(nameProblem(bad)).not.toBeNull();
    }
    for (const good of ['notes.md', '.env', 'résumé final.pdf', 'a'.repeat(MAX_NAME_UTF8_BYTES)]) {
      expect(nameProblem(good)).toBeNull();
    }
  });

  it('counts the limit in UTF-8 bytes', () => {
    expect(nameProblem('é'.repeat(128))).not.toBeNull();
  });

  it('keeps both by numbering before the extension', () => {
    expect(keepingBoth('report.pdf', new Set(['report.pdf']))).toBe('report 2.pdf');
    expect(keepingBoth('report.pdf', new Set(['report 2.pdf', 'report 3.pdf']))).toBe(
      'report 4.pdf',
    );
    expect(keepingBoth('.env', new Set())).toBe('.env 2');
    expect(keepingBoth('archive.tar.gz', new Set())).toBe('archive.tar 2.gz');
    expect(keepingBoth('trailing.', new Set())).toBe('trailing. 2');
  });

  it('flags names that look like credentials', () => {
    for (const name of [
      '.env',
      '.env.local',
      'id_ed25519',
      'Credentials.json',
      'a.PEM',
      'k.key',
      '.ssh',
      '.aws',
    ]) {
      expect(looksSecret(name)).toBe(true);
    }
    for (const name of ['readme.md', 'environment.ts', 'keys.txt', 'identity.txt']) {
      expect(looksSecret(name)).toBe(false);
    }
  });

  it('keeps only short ASCII alphanumeric extensions', () => {
    expect(safeExtension('PDF')).toBe('pdf');
    expect(safeExtension('')).toBe('');
    expect(safeExtension('a/b')).toBe('');
    expect(safeExtension('x'.repeat(17))).toBe('');
    expect(safeExtension('é')).toBe('');
  });

  it('renders its problems as catalog messages', () => {
    expect(nameProblem('a/b')).toMatchObject({ key: expect.any(String) });
    expect(sourceText('"%@" is not a usable name.', ['..'])).toContain('..');
  });
});

describe('upload parts', () => {
  it('names parts hidden and within the component limit', () => {
    const short = partName('report.pdf', 'abcd1234');
    expect(short).toBe('.report.pdf.agentico-abcd1234.part');
    expect(isPartName(short)).toBe(true);
    const long = partName('x'.repeat(250), 'abcd1234');
    expect(long).toBe('.agentico-abcd1234.part');
    expect(isPartName(long)).toBe(true);
    expect(isPartName('.agentico-ABCD1234.part')).toBe(false);
    expect(isPartName('report.part')).toBe(false);
  });

  it('calls leftovers the abandoned and the stale, never a fresh one in flight', () => {
    const now = 1_000_000;
    const entry = (modifiedAt: number | null, kind: string | null = 'file') => ({
      name: '.a.agentico-abcd1234.part',
      kind,
      modifiedAt,
    });
    const none = new Set<string>();
    expect(isLeftoverPart(entry(now - 10), '/d/p', now, none)).toBe(false);
    expect(isLeftoverPart(entry(now - 10), '/d/p', now, new Set(['/d/p']))).toBe(true);
    expect(isLeftoverPart(entry(now - 3601), '/d/p', now, none)).toBe(true);
    expect(isLeftoverPart(entry(null), '/d/p', now, none)).toBe(false);
    expect(isLeftoverPart(entry(now - 99999, 'directory'), '/d/p', now, none)).toBe(false);
  });
});

describe('items', () => {
  it('sorts folders first in natural order', () => {
    const entry = (name: string, kind: 'file' | 'directory') =>
      toItem({ name, kind, size: 1, modifiedAt: 0 }, '/d');
    const sorted = sortItems([
      entry('file10', 'file'),
      entry('file2', 'file'),
      entry('Zeta', 'directory'),
      entry('alpha', 'directory'),
    ]);
    expect(sorted.map((i) => i.name)).toEqual(['alpha', 'Zeta', 'file2', 'file10']);
  });

  it('marks names the Host sent as undecodable as unusable', () => {
    expect(isNameUsable(toItem({ name: 'bad�', kind: 'file', size: 0, modifiedAt: 0 }, '/d'))).toBe(
      false,
    );
    expect(isNameUsable(toItem({ name: 'ok', kind: 'file', size: 0, modifiedAt: 0 }, '/d'))).toBe(
      true,
    );
  });

  it('formats sizes', () => {
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(64 * 1024 * 1024)).toBe('64 MB');
  });
});
