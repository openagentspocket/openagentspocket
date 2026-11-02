import { type Message, message } from '../errors/text';
import { DEFAULT_ACCOUNT_ID } from './report';

/**
 * `usage-accounts.json` in the Agentico plugin's config directory: the Claude Code Accounts the
 * user added (ADR 0030). Only the app writes it, with an atomic replace; the plugin reads it with
 * the rules in `plugin/src/usage/accounts.js`, which this module applies too. An entry the plugin
 * would skip is dropped on the next write; fields this app does not know are carried through.
 */
export const ACCOUNT_FILE_NAME = 'usage-accounts.json';
export const ACCOUNT_FILE_VERSION = 1;
/** Added Accounts a Host can have; with the Default Account, four. */
export const ACCOUNT_LIMIT = 3;

/** Ids key the plugin's plain objects, so a name every JavaScript object already has is refused. */
const RESERVED_IDS: ReadonlySet<string> = new Set([
  'default',
  'constructor',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toString',
  'toLocaleString',
  'valueOf',
]);
const ID_PATTERN = /^[A-Za-z0-9_-]{8,32}$/;

export type ClaudeAccountErrorReason =
  | { readonly kind: 'unsupportedFileVersion'; readonly version: number }
  | { readonly kind: 'limitReached' }
  | { readonly kind: 'alreadyListed' }
  | { readonly kind: 'notAbsolute' }
  | { readonly kind: 'notClaudeDirectory' }
  | { readonly kind: 'emptyName' }
  | { readonly kind: 'nameTaken'; readonly name: string }
  | { readonly kind: 'accountNotFound' }
  | { readonly kind: 'pluginRequirement'; readonly note: Message }
  | { readonly kind: 'busy' };

/** Why a Claude Code Account change was refused, in the words the Accounts sheet shows. */
export class ClaudeAccountError extends Error {
  override readonly name = 'ClaudeAccountError';
  constructor(readonly reason: ClaudeAccountErrorReason) {
    super(reason.kind);
  }

  get text(): Message {
    const r = this.reason;
    switch (r.kind) {
      case 'unsupportedFileVersion':
        return message(
          'A newer version of Agentico saved this Host’s Accounts. Update Agentico to change them.',
        );
      case 'limitReached':
        return message(
          'A Host can have up to four Claude Code Accounts. Remove one to add another.',
        );
      case 'alreadyListed':
        return message('This directory is already an Account.');
      case 'notAbsolute':
        return message('Choose a directory by its full path.');
      case 'notClaudeDirectory':
        return message(
          'This directory has no Claude Code sign-in or Transcripts. Choose one that holds .claude.json or a projects folder.',
        );
      case 'emptyName':
        return message('Enter a name for this Account.');
      case 'nameTaken':
        return message('Another Account on this Host is named %@.', r.name);
      case 'accountNotFound':
        return message('This Account was already removed. Refresh Usage to see the current list.');
      case 'pluginRequirement':
        return r.note;
      default:
        return message('The last change here is still being saved. Try again in a moment.');
    }
  }
}

const fail = (reason: ClaudeAccountErrorReason): never => {
  throw new ClaudeAccountError(reason);
};

type Fields = Readonly<Record<string, unknown>>;

export interface FileAccount {
  readonly id: string;
  /** Absolute and kept as chosen, not resolved: Claude Code keys its keychain item by the string. */
  readonly directory: string;
  readonly name: string;
  /** Fields a newer app wrote on this entry. */
  readonly extra: Fields;
}

export interface UsageAccountFile {
  /** The Default Account's name; null shows the app's own "Default". */
  readonly defaultName: string | null;
  /** The added Accounts, in the order the user added them. */
  readonly accounts: readonly FileAccount[];
  /** Suggested directories the user dismissed, and removed Accounts'. */
  readonly ignored: readonly string[];
  readonly extra: Fields;
  readonly claudeExtra: Fields;
}

export const emptyAccountFile = (): UsageAccountFile => ({
  defaultName: null,
  accounts: [],
  ignored: [],
  extra: {},
  claudeExtra: {},
});

const trimmed = (name: string) => name.trim();
const isName = (name: string) => trimmed(name) !== '';
const isAbsolute = (path: string) => path.startsWith('/');
const isObject = (value: unknown): value is Fields =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const without = (fields: Fields, keys: readonly string[]): Fields =>
  Object.fromEntries(Object.entries(fields).filter(([key]) => !keys.includes(key)));

/** 8 to 32 characters of `[A-Za-z0-9_-]`, never a reserved name. */
export const isValidAccountId = (id: string): boolean =>
  ID_PATTERN.test(id) && !RESERVED_IDS.has(id);

/** Two spellings of one directory compare equal without trailing slashes; the stored string stays. */
export function comparablePath(path: string): string {
  let result = path;
  while (result.length > 1 && result.endsWith('/')) result = result.slice(0, -1);
  return result;
}

/** The new Account's name for `directory`: its base name without leading dots (`~/.claude-2` gives `claude-2`). */
export function accountBaseName(directory: string): string {
  const last = comparablePath(directory).split('/').filter(Boolean).pop() ?? '';
  const name = last.replace(/^\.+/, '');
  return name === '' ? 'Account' : name;
}

/**
 * The file a Host holds. A missing, unreadable or unversioned file reads as empty, as the plugin
 * reads it; another `version` is a newer app's file, which this one must not rewrite.
 */
export function decodeAccountFile(text: string | null): UsageAccountFile {
  let parsed: unknown;
  try {
    parsed = text === null ? null : JSON.parse(text);
  } catch {
    return emptyAccountFile();
  }
  if (!isObject(parsed) || typeof parsed.version !== 'number') return emptyAccountFile();
  if (parsed.version !== ACCOUNT_FILE_VERSION) {
    throw new ClaudeAccountError({ kind: 'unsupportedFileVersion', version: parsed.version });
  }
  const extra = without(parsed, ['version', 'claude']);
  if (!isObject(parsed.claude)) return { ...emptyAccountFile(), extra };
  const claude = parsed.claude;
  const defaultName =
    typeof claude.defaultName === 'string' && isName(claude.defaultName)
      ? claude.defaultName
      : null;
  const ids = new Set<string>();
  const names = new Set<string>(defaultName === null ? [] : [defaultName]);
  const accounts: FileAccount[] = [];
  for (const entry of Array.isArray(claude.accounts) ? claude.accounts : []) {
    if (!isObject(entry)) continue;
    const { id, directory, name } = entry;
    if (
      typeof id !== 'string' ||
      !isValidAccountId(id) ||
      ids.has(id) ||
      typeof directory !== 'string' ||
      !isAbsolute(directory) ||
      typeof name !== 'string' ||
      !isName(name) ||
      names.has(name)
    ) {
      continue;
    }
    ids.add(id);
    names.add(name);
    accounts.push({ id, directory, name, extra: without(entry, ['id', 'directory', 'name']) });
  }
  const ignored = (Array.isArray(claude.ignored) ? claude.ignored : []).filter(
    (path): path is string => typeof path === 'string' && isAbsolute(path),
  );
  return {
    defaultName,
    accounts,
    ignored,
    extra,
    claudeExtra: without(claude, ['defaultName', 'accounts', 'ignored']),
  };
}

function sortedJson(value: unknown, indent: string): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = `${indent}  `;
    return `[\n${value.map((v) => inner + sortedJson(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) return '{}';
    const inner = `${indent}  `;
    const body = keys.map((k) => `${inner}${JSON.stringify(k)} : ${sortedJson(value[k], inner)}`);
    return `{\n${body.join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** The file's text for an atomic whole-file replace, readable by hand. */
export function encodeAccountFile(file: UsageAccountFile): string {
  const claude = {
    ...file.claudeExtra,
    defaultName: file.defaultName,
    accounts: file.accounts.map((a) => ({
      ...a.extra,
      id: a.id,
      directory: a.directory,
      name: a.name,
    })),
    ignored: file.ignored,
  };
  return `${sortedJson({ ...file.extra, version: ACCOUNT_FILE_VERSION, claude }, '')}\n`;
}

/** The Default Account's name as every surface shows it (the caller words a null `defaultName`). */
export const defaultDisplayName = (file: UsageAccountFile): string => file.defaultName ?? 'Default';

/** Whether `name` (trimmed) already names an Account other than `accountId`'s, Default included. */
export function isNameTaken(file: UsageAccountFile, name: string, otherThan?: string): boolean {
  const candidate = trimmed(name);
  if (otherThan !== DEFAULT_ACCOUNT_ID && candidate === defaultDisplayName(file)) return true;
  return file.accounts.some((a) => a.id !== otherThan && a.name === candidate);
}

function availableName(file: UsageAccountFile, name: string): string {
  const base = isName(name) ? trimmed(name) : 'Account';
  if (!isNameTaken(file, base)) return base;
  let suffix = 2;
  while (isNameTaken(file, `${base} ${suffix}`)) suffix += 1;
  return `${base} ${suffix}`;
}

const randomId = (random: () => number) =>
  Math.floor(random() * 2 ** 32)
    .toString(16)
    .padStart(8, '0');

export interface AddAccountOptions {
  readonly directory: string;
  /** A suggestion's name; defaults to the directory's base name. */
  readonly name?: string;
  /** The Default Account's directory, which cannot be added again. */
  readonly defaultDirectory: string | null;
  readonly random?: () => number;
}

/**
 * Adds `directory` as the last Account. A taken name gets " 2", " 3" and so on. Refuses what the
 * plugin would not count: a relative path, a directory already listed, a fifth Account.
 */
export function addAccount(
  file: UsageAccountFile,
  options: AddAccountOptions,
): { file: UsageAccountFile; account: FileAccount } {
  const { directory, name, defaultDirectory, random = Math.random } = options;
  if (!isAbsolute(directory)) fail({ kind: 'notAbsolute' });
  const key = comparablePath(directory);
  if (
    file.accounts.some((a) => comparablePath(a.directory) === key) ||
    (defaultDirectory !== null && comparablePath(defaultDirectory) === key)
  ) {
    fail({ kind: 'alreadyListed' });
  }
  if (file.accounts.length >= ACCOUNT_LIMIT) fail({ kind: 'limitReached' });
  let id = randomId(random);
  while (file.accounts.some((a) => a.id === id)) id = randomId(random);
  const account: FileAccount = {
    id,
    directory,
    name: availableName(file, name ?? accountBaseName(directory)),
    extra: {},
  };
  return {
    account,
    file: {
      ...file,
      accounts: [...file.accounts, account],
      ignored: file.ignored.filter((path) => comparablePath(path) !== key),
    },
  };
}

/** Renames the Default Account or an added one. An empty name gives the Default Account its "Default" back. */
export function renameAccount(
  file: UsageAccountFile,
  accountId: string,
  newName: string,
): UsageAccountFile {
  const name = trimmed(newName);
  if (accountId === DEFAULT_ACCOUNT_ID) {
    const shown = name === '' ? 'Default' : name;
    if (file.accounts.some((a) => a.name === shown)) fail({ kind: 'nameTaken', name: shown });
    return { ...file, defaultName: name === '' ? null : name };
  }
  const index = file.accounts.findIndex((a) => a.id === accountId);
  if (index < 0) fail({ kind: 'accountNotFound' });
  if (name === '') fail({ kind: 'emptyName' });
  if (isNameTaken(file, name, accountId)) fail({ kind: 'nameTaken', name });
  return {
    ...file,
    accounts: file.accounts.map((a, i) => (i === index ? { ...a, name } : a)),
  };
}

/** Removes an added Account (one already gone is not an error); its directory joins `ignored`. */
export function removeAccount(file: UsageAccountFile, accountId: string): UsageAccountFile {
  const removed = file.accounts.find((a) => a.id === accountId);
  if (!removed) return file;
  const key = comparablePath(removed.directory);
  const ignored = file.ignored.some((p) => comparablePath(p) === key)
    ? file.ignored
    : [...file.ignored, removed.directory];
  return { ...file, accounts: file.accounts.filter((a) => a.id !== accountId), ignored };
}

/**
 * Dismisses a suggested directory so the plugin stops offering it. A directory that already
 * counts (an added Account's or the Default Account's) stays as it is.
 */
export function ignoreDirectory(
  file: UsageAccountFile,
  directory: string,
  defaultDirectory: string | null,
): UsageAccountFile {
  if (!isAbsolute(directory)) fail({ kind: 'notAbsolute' });
  const key = comparablePath(directory);
  if (
    file.accounts.some((a) => comparablePath(a.directory) === key) ||
    (defaultDirectory !== null && comparablePath(defaultDirectory) === key) ||
    file.ignored.some((p) => comparablePath(p) === key)
  ) {
    return file;
  }
  return { ...file, ignored: [...file.ignored, directory] };
}
