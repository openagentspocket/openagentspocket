// Atlas entries of New Agent and New Terminal (console.start-agent and its sheets). Owned by its UX family task, so parallel tasks never edit the same registry file.
import { t } from '@openagentspocket/i18n';
import NewAgentRoute from '@/app/new-agent';
import { titled } from './atlasHelpers';
import type { AtlasEntry } from './entries';

export const newAgentEntries: Readonly<Record<string, AtlasEntry>> = {
  'console.start-agent': { render: () => titled(t('New Agent'), <NewAgentRoute />) },
};
