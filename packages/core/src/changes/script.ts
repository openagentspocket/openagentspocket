import { type ByteString, encodeText } from './bytes';
import type { FilePatchRequest } from './types';

/**
 * Builds the POSIX shell scripts that read a Checkout on its Host. Pure: no I/O. A script travels
 * on standard input to `SHELL_INVOCATION`, so no path ever appears on the SSH command line, where
 * fish and csh login shells would re-parse it. Inside the script every path is single-quoted and
 * the whole body is one brace group reading from the null device. Each command's output sits
 * between markers carrying a per-request nonce and ends with a framed exit status; the script
 * ends with a final marker. Scripts are byte strings (see `bytes.ts`): paths are never decoded.
 */
export const SHELL_INVOCATION = '/bin/sh -s';

/** Host-side output caps, one byte over each so truncation is detectable. */
export const Cap = {
  version: 4_096,
  home: 4_096,
  discover: 65_536,
  status: 524_288,
  numstat: 262_144,
  head: 65_536,
  patch: 262_144,
  patchExtended: 1_048_576,
} as const;

export const SectionName = {
  version: 'version',
  home: 'home',
  discover: 'discover',
  status: 'status',
  numstat: 'numstat',
  head: 'head',
  patch: 'patch',
  untracked: 'untracked',
} as const;

// biome-ignore lint/suspicious/noTemplateCurlyInString: POSIX parameter expansion, evaluated by the Host's shell.
const MISE_SHIMS = '${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}/shims';
const EXTRA_PATH = `$HOME/.local/bin:${MISE_SHIMS}:$HOME/.linuxbrew/bin:$HOME/.cargo/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/home/linuxbrew/.linuxbrew/bin`;
/** The Host PATH additions every script makes so a version-manager git is found. */
export const PATH_EXPORT = `export PATH="${EXTRA_PATH}:$PATH"`;

/** Fresh per request; hex only, so it needs no quoting. */
export function makeNonce(random: () => number = Math.random): string {
  let out = '';
  for (let index = 0; index < 32; index++) out += Math.floor(random() * 16).toString(16);
  return out;
}

export function marker(nonce: string): string {
  return `__AGENTICO_GIT_${nonce}__`;
}

/** Repository-local variables that would pair another repository's index with this tree. */
export const UNSET_ENVIRONMENT = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
  'GIT_COMMON_DIR',
  'GIT_CONFIG',
  'GIT_CONFIG_PARAMETERS',
  'GIT_CONFIG_COUNT',
  'GIT_PREFIX',
  'GIT_IMPLICIT_WORK_TREE',
  'GIT_GRAFT_FILE',
  'GIT_NO_REPLACE_OBJECTS',
  'GIT_REPLACE_REF_BASE',
  'GIT_SHALLOW_FILE',
  'GIT_NAMESPACE',
  'GIT_EXTERNAL_DIFF',
  'GIT_DIFF_OPTS',
  'GIT_ATTR_SOURCE',
  'GIT_GLOB_PATHSPECS',
  'GIT_NOGLOB_PATHSPECS',
  'GIT_ICASE_PATHSPECS',
];

/**
 * Options every git invocation except the version probe carries. `core.fsmonitor` is the empty
 * value, not `false` (git 2.35.1 and older run a program named `false`), and index auto-refresh
 * is off because `git diff` rewrites the index even with optional locks disabled.
 */
export const NEUTRALIZING_OPTIONS = [
  '--no-pager',
  '--no-optional-locks',
  '--literal-pathspecs',
  '-c',
  'core.fsmonitor=',
  '-c',
  'core.hooksPath=/dev/null',
  '-c',
  'core.quotePath=false',
  '-c',
  'color.ui=false',
  '-c',
  'diff.autoRefreshIndex=false',
  '-c',
  'diff.relative=false',
  '-c',
  'diff.suppressBlankEmpty=false',
  '-c',
  'log.showSignature=false',
  '-c',
  'status.renames=true',
];

/** POSIX single quotes around arbitrary bytes: `'` becomes `'\''`, every other byte is literal. */
export function singleQuoted(bytes: ByteString): ByteString {
  return `'${bytes.replace(/'/g, "'\\''")}'`;
}

const PLAIN = /^[A-Za-z0-9\-./=_]+$/;

function shellWord(word: string): string {
  return PLAIN.test(word) ? word : singleQuoted(word);
}

/** Everything a script runs before its own commands. */
export function preamble(nonce: string): string {
  const git = ['git', ...NEUTRALIZING_OPTIONS.map(shellWord)].join(' ');
  return [
    `N=${singleQuoted(marker(nonce))}`,
    `unset ${UNSET_ENVIRONMENT.join(' ')}`,
    'LC_ALL=C GIT_PAGER=cat PAGER=cat GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0 GIT_NO_LAZY_FETCH=1',
    'export LC_ALL GIT_PAGER PAGER GIT_TERMINAL_PROMPT GIT_OPTIONAL_LOCKS GIT_NO_LAZY_FETCH',
    PATH_EXPORT,
    `g() { ${git} "$@"; }`,
    'sec() {',
    '  cap=$1 name=$2; shift 2',
    `  printf '\\n%s %s begin\\n' "$N" "$name"`,
    `  printf '\\n%s %s begin\\n' "$N" "$name" >&2`,
    '  rc=$( { { "$@"; echo "$?" >&4; } | head -c "$((cap + 1))" >&3; } 4>&1 )',
    `  printf '\\n%s %s rc=%s\\n' "$N" "$name" "$rc"`,
    `  printf '\\n%s %s end\\n' "$N" "$name" >&2`,
    '}',
    'base() {',
    '  g -C "$1" rev-parse -q --verify HEAD 2>/dev/null ||',
    '    g -C "$1" hash-object -t tree /dev/null',
    '}',
    'latest() {',
    '  h=$(g -C "$1" rev-parse -q --verify HEAD 2>/dev/null) || return 0',
    `  g -C "$1" -c i18n.logOutputEncoding=UTF-8 log -1 --no-color '--format=%ct %s' "$h" --`,
    '}',
    '',
  ].join('\n');
}

/** A complete script: the shared preamble, `body`, and the final marker, in one brace group. */
export function script(nonce: string, body: ByteString): ByteString {
  return `{\n${preamble(nonce)}${body}printf '\\n%s done\\n' "$N"\n} </dev/null 3>&1\n`;
}

/**
 * The Changes read: version, home, discovery, status, counts against HEAD (or the empty tree
 * while HEAD is unborn) and the latest commit. The directory is the only path, single-quoted.
 */
export function changesScript(directory: string, nonce: string): ByteString {
  const dir = encodeText(directory);
  const body = [
    `sec ${Cap.version} ${SectionName.version} git --version`,
    `sec ${Cap.home} ${SectionName.home} printf '%s' "$HOME"`,
    `dir=${singleQuoted(dir)}`,
    `sec ${Cap.discover} ${SectionName.discover} g -C "$dir" rev-parse --show-toplevel --show-prefix --absolute-git-dir --git-common-dir`,
    'top=$(g -C "$dir" rev-parse --show-toplevel 2>/dev/null)',
    'if [ -n "$top" ]; then',
    `  sec ${Cap.status} ${SectionName.status} g -C "$top" status --porcelain=v2 -z --branch --untracked-files=normal`,
    '  b=$(base "$top")',
    `  sec ${Cap.numstat} ${SectionName.numstat} g -C "$top" diff "$b" --numstat -z --no-ext-diff --no-textconv --find-renames --submodule=short --`,
    `  sec ${Cap.head} ${SectionName.head} latest "$top"`,
    'fi',
    '',
  ].join('\n');
  return script(nonce, `${body}`);
}

export function patchByteLimit(limit: FilePatchRequest['limit']): number {
  return limit === 'initial' ? Cap.patch : Cap.patchExtended;
}

/**
 * One file's diff. Raw status paths are quoted without a decode round trip; a tracked rename
 * supplies both paths; untracked files compare with the null device.
 */
export function patchScript(request: FilePatchRequest, nonce: string): ByteString {
  const base = request.isUntracked ? '--no-index' : '"$b"';
  const options = request.isUntracked ? ' -- /dev/null ' : ' --find-renames --submodule=short -- ';
  let body = `top=${singleQuoted(request.topLevel)}\n`;
  if (!request.isUntracked) body += 'b=$(base "$top")\n';
  body += `sec ${patchByteLimit(request.limit)} ${SectionName.patch} g -C "$top" diff ${base} --no-color --no-ext-diff --no-textconv --src-prefix=a/ --dst-prefix=b/ -U3${options}`;
  body += singleQuoted(request.path);
  if (!request.isUntracked && request.originalPath !== null) {
    body += ` ${singleQuoted(request.originalPath)}`;
  }
  body += '\n';
  return script(nonce, body);
}

/** Lists one untracked directory; the pathspec is `directory` exactly as status printed it. */
export function untrackedDirectoryScript(
  topLevel: ByteString,
  directory: ByteString,
  nonce: string,
): ByteString {
  const body =
    `top=${singleQuoted(topLevel)}\n` +
    `sec ${Cap.status} ${SectionName.untracked} g -C "$top" status --porcelain=v2 -z --untracked-files=all -- ` +
    `${singleQuoted(directory)}\n`;
  return script(nonce, body);
}
