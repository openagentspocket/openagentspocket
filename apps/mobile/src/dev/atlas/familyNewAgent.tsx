// Atlas entries of New Agent and New Terminal (console.start-agent and its sheets). Owned by its UX family task, so parallel tasks never edit the same registry file.
import NewAgentRoute from '@/app/new-agent';
import NewTerminalRoute from '@/app/new-terminal';
import type { AtlasEntry } from './entries';
import { DirectoryBrowserDemo } from './NewAgentDemos';

export const newAgentEntries: Readonly<Record<string, AtlasEntry>> = {
  'console.start-agent': { data: { newAgent: 'hostless' }, render: () => <NewAgentRoute /> },
  'console.workspace-picker': {
    data: { newAgent: 'hostless' },
    script: { press: ['new-agent-workspace'] },
    render: () => <NewAgentRoute />,
  },
  'console.new-terminal': { data: { newAgent: 'hostless' }, render: () => <NewTerminalRoute /> },
  'console.directory-browser': { render: () => <DirectoryBrowserDemo /> },
};
