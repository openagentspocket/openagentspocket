import { t } from '@openagentspocket/i18n';
import type { AgentBarLabels } from '@openagentspocket/ui';

/** The agent bar's words in the current locale (the UI components only carry English defaults). */
export function agentBarLabels(): AgentBarLabels {
  return {
    sidebar: t('Sessions'),
    more: t('More'),
    switcher: t('Agents'),
    switchTo: t('Switch to'),
    search: t('Search'),
    searchPlaceholder: t('Workspaces, tabs, panes'),
    workspaces: t('Workspaces'),
    newItem: t('New'),
    closeSkills: t('Close Skills'),
    skills: t('Skills'),
    messagePlaceholder: t('Message Agent'),
    send: t('Send'),
    stop: t('Stop'),
    add: t('Add'),
    moreOptions: t('More Options'),
    working: t('Working'),
    idle: t('Idle'),
    blocked: t('Blocked'),
    done: t('Done'),
    contextLeft: (percent) => t('%@ context left', `${percent} %`),
    worktree: t('Worktree'),
    possiblyIncomplete: (readAt) => t('Possibly incomplete · %@', t('Read at %@', readAt)),
    changes: t('Changes'),
    openChanges: t('Open Changes'),
    dismissKeyboard: t('Dismiss keyboard'),
    needsYou: t('Needs you'),
    shells: t('Shells'),
    toolbar: t('Toolbar'),
  };
}
