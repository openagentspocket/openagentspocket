// Atlas entries of the console screens beyond the lists (search, menus, rename, terminals, worktree, connection). Owned by its UX family task, so parallel tasks never edit the same registry file.
import Agents from '@/app/agents';
import Index from '@/app/index';
import TerminalsRoute from '@/app/terminals';
import { WorktreeDemo } from './ConsoleDemos';
import type { AtlasEntry } from './entries';

export const consoleEntries: Readonly<Record<string, AtlasEntry>> = {
  'console.search': { render: () => <Agents initialQuery="settings" /> },
  'console.host-filter-menu': {
    script: { press: ['agents-toolbar-host'] },
    render: () => <Agents />,
  },
  'console.presentation-menu': {
    script: { press: ['agents-toolbar-presentation'] },
    render: () => <Agents />,
  },
  'console.rename-sheet': { render: () => <Agents openRename="p2" /> },
  'console.new-item-button': { render: () => <Agents /> },
  'console.agent-row': { render: () => <Agents /> },
  'console.terminals-list': { render: () => <TerminalsRoute /> },
  'console.worktree-details': { render: () => <WorktreeDemo /> },
  'console.worktree-remove-confirm': {
    script: { press: ['worktree-remove'] },
    render: () => <WorktreeDemo />,
  },
  'console.host-connection-sheet': {
    data: { console: 'offline' },
    script: { press: ['host-issue-row-Lab'] },
    render: () => <Index />,
  },
};
