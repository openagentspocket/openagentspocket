import { t } from '@openagentspocket/i18n';
import type { ActionMenuItem, IconName } from '@openagentspocket/ui';

/**
 * What a composer surface can do beyond typing (Swift `AgentComposerActions`). An absent handler
 * hides its menu item, as Swift hides an optional entry whose action is absent; the attachment
 * items stay and are disabled while an attachment is in flight (`canBegin`).
 */
export interface ComposerMenuActions {
  /** False while an attachment is being picked, prepared or uploaded. */
  canBegin?: boolean;
  addImage?: () => void;
  addFile?: () => void;
  backToConsole?: () => void;
  showChat?: () => void;
  showAgentTerminal?: () => void;
  openTerminal?: () => void;
  /** Disables Open Terminal while one is opening. */
  isOpeningTerminal?: boolean;
  showChanges?: () => void;
  newAgent?: () => void;
  showSkills?: () => void;
  manageSnippets?: () => void;
  showWorktreeDetails?: () => void;
  renameAgent?: () => void;
  renameWorkspace?: () => void;
  closeAgent?: () => void;
}

type Entry = [
  key: string,
  title: string,
  icon: IconName,
  handler: (() => void) | undefined,
  options?: { destructive?: boolean; disabled?: boolean },
];

/** Entries with a handler become items. */
function items(entries: readonly Entry[]): ActionMenuItem[] {
  return entries.flatMap(([key, title, icon, onPress, options]) =>
    onPress === undefined ? [] : [{ key, title, icon, onPress, ...options }],
  );
}

/** The "+" menu: attachments for the draft. */
export function composerAddItems(actions: ComposerMenuActions): ActionMenuItem[] {
  const disabled = actions.canBegin === false;
  return items([
    ['add-image', t('Add Image'), 'camera', actions.addImage, { disabled }],
    ['add-file', t('Add File'), 'file', actions.addFile, { disabled }],
  ]);
}

/**
 * The "..." menu in Swift's three sections: leaving the Agent, the session tools, then the Agent's
 * lifecycle. A later section starts with an untitled `section` marker, which the menu draws as a gap.
 */
export function composerMoreItems(actions: ComposerMenuActions): ActionMenuItem[] {
  const sections: Entry[][] = [
    [['back', t('Back to Console'), 'chevronLeft', actions.backToConsole]],
    [
      ['show-chat', t('Show Chat'), 'chat', actions.showChat],
      ['show-terminal', t('Show Agent Terminal'), 'terminal', actions.showAgentTerminal],
      [
        'open-terminal',
        t('Open Terminal'),
        'terminal',
        actions.openTerminal,
        { disabled: actions.isOpeningTerminal === true },
      ],
      ['changes', t('Changes'), 'file', actions.showChanges],
      ['new-agent', t('New Agent'), 'add', actions.newAgent],
      ['skills', t('Skills'), 'skills', actions.showSkills],
      ['snippets', t('Snippets'), 'snippets', actions.manageSnippets],
    ],
    [
      ['worktree', t('Worktree Details'), 'info', actions.showWorktreeDetails],
      ['rename-agent', t('Rename Agent'), 'edit', actions.renameAgent],
      ['rename-workspace', t('Rename Workspace'), 'edit', actions.renameWorkspace],
      ['close', t('Close Agent'), 'trash', actions.closeAgent, { destructive: true }],
    ],
  ];
  return sections.flatMap((section, index) =>
    items(section).map((item, at) => (at === 0 && index > 0 ? { ...item, section: '' } : item)),
  );
}
