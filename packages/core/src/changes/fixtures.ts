import { marker } from './script';

/** Builders for framed script output, as a Host's `/bin/sh -s` prints it (test support). */
export const NONCE = 'F00D';

export interface SectionSpec {
  name: string;
  /** Raw command output, as a byte string. */
  body: string;
  rc?: number;
  /** Raw standard error of the command. */
  messages?: string;
}

export interface Recording {
  stdout: string;
  stderr: string;
}

export function recording(
  sections: readonly SectionSpec[],
  options: { nonce?: string; done?: boolean } = {},
): Recording {
  const m = marker(options.nonce ?? NONCE);
  let stdout = '';
  let stderr = '';
  for (const section of sections) {
    stdout += `\n${m} ${section.name} begin\n${section.body}\n${m} ${section.name} rc=${section.rc ?? 0}\n`;
    stderr += `\n${m} ${section.name} begin\n${section.messages ?? ''}\n${m} ${section.name} end\n`;
  }
  if (options.done !== false) stdout += `\n${m} done\n`;
  return { stdout, stderr };
}

export const VERSION = 'git version 2.54.0 (Apple Git-157)\n';
const OID = 'a7d75683c107bbe72aad2574b0ba0e6c47629e08';
const HASH = '5626abf0f72e58d7a153368ba57db4c673c0e171';
const MODE = '100644 100644 100644';

export const ordinary = (xy: string, path: string) =>
  `1 ${xy} N... ${MODE} ${HASH} ${HASH} ${path}\0`;
export const rename = (xy: string, path: string, original: string) =>
  `2 ${xy} N... ${MODE} ${HASH} ${HASH} R100 ${path}\0${original}\0`;
export const conflict = (path: string) =>
  `u UU N... 100644 100644 100644 100644 ${HASH} ${HASH} ${HASH} ${path}\0`;
export const headers = (extra = '') => `# branch.oid ${OID}\0# branch.head main\0${extra}`;

export interface ChangesSpec {
  version?: SectionSpec;
  home?: SectionSpec;
  discover?: SectionSpec;
  status?: string;
  statusRc?: number;
  numstat?: string;
  numstatRc?: number;
  head?: string;
  headRc?: number;
}

/** A full Changes read; each section can be overridden or failed. */
export function changesRecording(
  spec: ChangesSpec = {},
  options: { done?: boolean } = {},
): Recording {
  return recording(
    [
      spec.version ?? { name: 'version', body: VERSION },
      spec.home ?? { name: 'home', body: '/home/dev' },
      spec.discover ?? {
        name: 'discover',
        body: '/home/dev/src/app\n\n/home/dev/src/app/.git\n.git\n',
      },
      { name: 'status', body: spec.status ?? headers(), rc: spec.statusRc },
      { name: 'numstat', body: spec.numstat ?? '', rc: spec.numstatRc },
      {
        name: 'head',
        body: spec.head ?? '1790587800 Main edit to "conflict.txt"\n',
        rc: spec.headRc,
      },
    ],
    options,
  );
}
