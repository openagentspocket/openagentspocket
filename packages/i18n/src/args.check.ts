// Type-level tests for ArgsOf and t(): tsc -b checks this file; nothing imports it.
import type { ArgsOf } from './args';
import { t } from './index';

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;

export type ArgsOfCases = [
  Expect<Equal<ArgsOf<'Needs you'>, []>>,
  Expect<Equal<ArgsOf<'%lld blocked'>, [number]>>,
  Expect<Equal<ArgsOf<'%@ session version %lld'>, [string, number]>>,
  Expect<Equal<ArgsOf<'Uploading File… %lld%%'>, [number]>>,
  Expect<Equal<ArgsOf<'git exited with status %d.'>, [number]>>,
  Expect<Equal<ArgsOf<'Under %ProgramData%\\ssh.'>, []>>,
  Expect<Equal<ArgsOf<'Open ${agent}'>, [Readonly<Record<'agent', string>>]>>,
];

export function callSites(): string[] {
  return [
    t('Needs you'),
    t('%lld blocked', 2),
    t('%@ session version %lld', 'Claude', 3),
    // biome-ignore lint/suspicious/noTemplateCurlyInString: an App Intents key, not a template
    t('Open ${agent}', { agent: 'build' }),
    // @ts-expect-error a count key needs its count
    t('%lld blocked'),
    // @ts-expect-error a string argument is not a number
    t('%lld blocked', 'two'),
    // @ts-expect-error unknown keys are rejected
    t('No such key in the catalog'),
  ];
}
