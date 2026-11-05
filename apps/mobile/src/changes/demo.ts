import {
  type ChangedFile,
  type CheckoutChanges,
  type CheckoutChangesRead,
  type FilePatch,
  parsePatchFiles,
} from '@openagentspocket/core';

const file = (
  path: string,
  kind: ChangedFile['kind'],
  staging: ChangedFile['staging'],
  counts: [number, number] | null,
  originalPath: string | null = null,
): ChangedFile => ({
  path,
  originalPath,
  kind,
  staging,
  lineCounts: counts ? { kind: 'lines', added: counts[0], removed: counts[1] } : null,
});

const FILES: ChangedFile[] = [
  file('src/cart/merge.ts', 'conflicted', null, [4, 0]),
  file('src/cart/Cart.ts', 'modified', 'staged', [12, 3]),
  file('src/cart/totals.ts', 'renamed', 'staged', [2, 2], 'src/cart/sum.ts'),
  file('README.md', 'modified', 'unstaged', [1, 1]),
  file('assets/logo.png', 'modified', 'unstaged', null),
  file('src/cart/Discount.ts', 'untracked', null, null),
  file('scratch/', 'untracked', null, null),
];

const CHANGES: CheckoutChanges = {
  checkout: {
    topLevel: '/work/storefront',
    isLinkedWorktree: false,
    displayPath: '~/work/storefront',
  },
  head: {
    branch: { kind: 'named', name: 'main' },
    commit: 'a7d75683c107bbe72aad2574b0ba0e6c47629e08',
    latestCommit: { subject: 'Round totals to cents', committedAt: Date.now() - 3 * 3_600_000 },
    upstream: { name: 'origin/main', state: { kind: 'tracking', ahead: 2, behind: 0 } },
    isUnborn: false,
  },
  files: FILES,
  totals: {
    trackedFiles: 5,
    untrackedItems: 2,
    added: 19,
    removed: 6,
    linesAreComplete: true,
    linesAreAvailable: true,
  },
  isStatusTruncated: false,
  isMetadataTruncated: false,
};

export const DEMO_READ: CheckoutChangesRead = { changes: CHANGES, directoryPrefix: '' };

const PATCH = [
  'diff --git a/src/cart/Cart.ts b/src/cart/Cart.ts',
  'index 1111111..2222222 100644',
  '--- a/src/cart/Cart.ts',
  '+++ b/src/cart/Cart.ts',
  '@@ -10,7 +10,9 @@ export class Cart {',
  '   private items: Item[] = [];',
  ' ',
  '-  total(): number {',
  '-    return this.items.reduce((sum, item) => sum + item.price, 0);',
  '+  total(discount = 0): number {',
  '+    const gross = this.items.reduce((sum, item) => sum + item.price, 0);',
  '+    return Math.round(gross * (1 - discount));',
  '   }',
  ' ',
  '   count(): number {',
  '',
].join('\n');

export const DEMO_PATCH: FilePatch = { files: parsePatchFiles(PATCH, false), isTruncated: false };

/** Branch and line totals of the demo Agents' directories, as their rows and status line show them. */
const DEMO_CHECKOUTS: Readonly<Record<string, { branch: string; lines: [number, number] }>> = {
  '/work/api-server': { branch: 'migrate-db', lines: [12, 7] },
  '/work/mobile': { branch: 'settings-refactor', lines: [2, 2] },
  '/work/docs': { branch: 'install-guide', lines: [5, 1] },
  '/work/infra': { branch: 'lint-cleanup', lines: [1, 1] },
  '/work/scratch': { branch: 'scratch', lines: [2, 2] },
  '/work/render-farm': { branch: 'cache-warmup', lines: [8, 0] },
};

/** The demo read of a directory: the sample Checkout, with that directory's branch and totals. */
export function demoReadFor(directory: string): CheckoutChangesRead {
  const demo = DEMO_CHECKOUTS[directory];
  if (!demo) return DEMO_READ;
  const { changes } = DEMO_READ;
  return {
    ...DEMO_READ,
    changes: {
      ...changes,
      head: { ...changes.head, branch: { kind: 'named', name: demo.branch } },
      totals: { ...changes.totals, added: demo.lines[0], removed: demo.lines[1] },
    },
  };
}
