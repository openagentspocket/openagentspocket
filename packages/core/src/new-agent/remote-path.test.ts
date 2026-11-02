import { describe, expect, it } from 'vitest';
import { RemoteHostPath } from './remote-path';

describe('RemoteHostPath', () => {
  it('accepts drive roots and complete UNC shares as Windows paths', () => {
    const accepted = [
      'C:\\',
      'C:\\Users\\dev',
      'C:/Users/dev',
      'd:\\with space\\项目',
      '\\\\server\\share',
      '\\\\server\\share\\project',
    ];
    for (const path of accepted) {
      expect(RemoteHostPath.isAbsolute(path)).toBe(true);
      expect(RemoteHostPath.isWindowsAbsolute(path)).toBe(true);
    }
    const refused = [
      '',
      'relative/path',
      'C:',
      'C:project',
      '\\Users\\dev',
      '\\\\server',
      '\\\\server\\',
      '\\\\?\\C:\\project',
      '\\\\.\\pipe\\herdr',
    ];
    for (const path of refused) expect(RemoteHostPath.isAbsolute(path)).toBe(false);
  });

  it('refuses quotes and control characters', () => {
    const unsafe = [
      "C:\\with'quote",
      'C:\\with"quote',
      'C:/with\0nul',
      'C:/with\nnewline',
      'C:/with\ttab',
      'C:/with\u007fdel',
      "/with'quote",
      '/with\\backslash',
      '/with\nnewline',
    ];
    for (const path of unsafe) expect(RemoteHostPath.isAbsolute(path)).toBe(false);
    for (const path of ['/', '/home/dev', '/with space', '/项目']) {
      expect(RemoteHostPath.isAbsolute(path)).toBe(true);
      expect(RemoteHostPath.isWindowsAbsolute(path)).toBe(false);
    }
  });

  it('navigates with the Host separators and stops at roots', () => {
    expect(RemoteHostPath.childPath('C:\\', 'Users')).toBe('C:\\Users');
    expect(RemoteHostPath.childPath('C:\\Users\\dev', 'src')).toBe('C:\\Users\\dev\\src');
    expect(RemoteHostPath.childPath('C:/Users/dev', 'src')).toBe('C:/Users/dev/src');
    expect(RemoteHostPath.childPath('/', 'etc')).toBe('/etc');
    expect(RemoteHostPath.childPath('/home', 'dev')).toBe('/home/dev');
    expect(RemoteHostPath.parentPath('C:\\Users\\dev\\')).toBe('C:\\Users');
    expect(RemoteHostPath.parentPath('C:\\Users')).toBe('C:\\');
    expect(RemoteHostPath.parentPath('C:/Users')).toBe('C:/');
    expect(RemoteHostPath.parentPath('C:\\')).toBeUndefined();
    expect(RemoteHostPath.parentPath('C:/')).toBeUndefined();
    expect(RemoteHostPath.parentPath('\\\\server\\share\\project')).toBe('\\\\server\\share');
    expect(RemoteHostPath.parentPath('\\\\server\\share\\')).toBeUndefined();
    expect(RemoteHostPath.parentPath('/')).toBeUndefined();
    expect(RemoteHostPath.parentPath('/home')).toBe('/');
    expect(RemoteHostPath.parentPath('/home/dev/')).toBe('/home');
    expect(RemoteHostPath.parentPath('relative')).toBeUndefined();
  });

  it('labels a folder by its last component', () => {
    expect(RemoteHostPath.lastComponent('C:\\Users\\dev\\project\\')).toBe('project');
    expect(RemoteHostPath.lastComponent('C:/Users/dev/project')).toBe('project');
    expect(RemoteHostPath.lastComponent('C:\\')).toBe('C:\\');
    expect(RemoteHostPath.lastComponent('/home/dev/project/')).toBe('project');
    expect(RemoteHostPath.lastComponent('/')).toBe('/');
  });
});
