import {
  AttachmentError,
  type AttachmentStager,
  agentKey,
  type ComposerStagingStore,
  type ConsoleRow,
  rowDirectory,
} from '@openagentspocket/core';
import { attachmentStager, SshTransport } from '@openagentspocket/transport';
import type { ActionMenuItem } from '@openagentspocket/ui';
import { useRouter } from 'expo-router';
import { type ReactNode, useMemo, useState, useSyncExternalStore } from 'react';
import { useAgent, useConsoleStore } from '@/console/hooks';
import { agentActions } from '@/features/agents/agentActions';
import { closeAgent } from '@/features/agents/closeAgent';
import { useRename } from '@/features/agents/useRename';
import {
  ComposerToolsSheets,
  type ToolsSheet,
} from '@/features/composer-tools/ComposerToolsSheets';
import { composerAddItems, composerMoreItems } from '@/features/composer-tools/composerMenus';
import { attachmentActions, stagingFor } from '@/features/composer-tools/composerStaging';
import { useDictation } from '@/features/composer-tools/useDictation';
import { useImageReview } from '@/features/composer-tools/useImageReview';
import { useNewAgentServices } from '@/features/new-agent/services';
import { ExpoLocalFiles } from '@/files/expoLocalFiles';
import { pickDocument, pickPhoto } from '@/files/pickers';
import { hrefs } from '@/navigation/hrefs';
import type { Surface } from '../surface';
import { COMPOSER_MORE_ANCHOR } from './composerAnchors';
import type { AgentComposer } from './composerContext';
import { useAgentShortcuts } from './useAgentShortcuts';

const localFiles = new ExpoLocalFiles();

interface Input {
  composer: AgentComposer;
  surface: Surface;
  program: string;
  /** The Agent's launch directory: its project skills are listed in the Skills sheet. */
  projectRoot?: string;
  onToggleSurface?: () => void;
}

export interface ComposerMenus {
  addItems: ActionMenuItem[];
  /** The Agent's attachment in flight; show its status and its tile above the composer. */
  staging: ComposerStagingStore;
  moreItems: ActionMenuItem[];
  /** The program's shortcuts: keys it presses, commands it types. */
  shortcutItems: ActionMenuItem[];
  /** The sheets the menus open (Skills, Snippets, Rename Agent); render beside the composer. */
  sheets: ReactNode;
}

/**
 * The composer's "+" and "..." menus for one Agent, wired to the existing pieces: staging for
 * attachments, the Skills and Snippets sheets, the surface toggle, Changes, New Agent, a Terminal
 * in the Agent's directory, rename and close. Actions the app has no way to do stay out of the
 * menu, as Swift hides an entry whose action is absent.
 */
export function useComposerMenus({
  composer,
  surface,
  program,
  projectRoot,
  onToggleSurface,
}: Input): ComposerMenus {
  const { hostId, paneId, store } = composer;
  const router = useRouter();
  const consoleStore = useConsoleStore();
  const row = useAgent(agentKey(hostId, paneId));
  const [sheet, setSheet] = useState<ToolsSheet | null>(null);
  const shortcutItems = useAgentShortcuts(
    composer,
    program,
    surface,
    surface === 'chat' ? onToggleSurface : undefined,
  );
  const staging = useMemo(() => {
    // The upload runs on the Host's transport at the time it starts.
    const stage: AttachmentStager = (prepared, options) =>
      consoleStore.withTransport(hostId, async (transport) => {
        if (!(transport instanceof SshTransport)) throw new AttachmentError('sftpUnavailable');
        return attachmentStager(transport)(prepared, options);
      });
    return stagingFor(store, stage);
  }, [store, consoleStore, hostId]);
  // Add Image and Add File disable while an attachment is in flight or waits on Retry.
  useSyncExternalStore(
    staging.subscribe.bind(staging),
    () => staging.state,
    () => staging.state,
  );
  const images = useImageReview(localFiles);
  const dictation = useDictation((text) => store.insertIntoDraft(text));
  const actions = useMemo(() => agentActions(consoleStore), [consoleStore]);
  const rename = useRename(actions);
  // The route's own check: Worktree Details exist only for an Agent in a linked worktree.
  const services = useNewAgentServices();
  const inWorktree = services.worktreeDetail(hostId, paneId) !== undefined;

  const items = useMemo(() => {
    const directory = row ? rowDirectory(row) : undefined;
    const workspaceId = row?.agent.workspace_id;
    const attach = attachmentActions(
      staging,
      { pickPhoto, pickDocument, reviewImage: images.reviewImage },
      localFiles,
    );
    const menuActions = {
      canBegin: staging.canBegin,
      ...attach,
      dictate: dictation.toggle,
      dictating: dictation.listening,
      backToConsole: () => router.back(),
      showChat: surface === 'terminal' ? onToggleSurface : undefined,
      showAgentTerminal: surface === 'chat' ? onToggleSurface : undefined,
      openTerminal:
        workspaceId && directory
          ? () => router.push(hrefs.shell({ hostId, workspaceId, cwd: directory }))
          : undefined,
      showChanges: () => router.push(hrefs.changesForAgent(hostId, paneId)),
      newAgent: () => router.push(hrefs.newAgent({ hostId, workspaceId, cwd: directory })),
      showSkills: () => setSheet('skills'),
      manageSnippets: () => setSheet('snippets'),
      showWorktreeDetails: inWorktree
        ? () => router.push(hrefs.worktree(hostId, paneId))
        : undefined,
      renameAgent: row ? () => rename.open(row) : undefined,
      renameWorkspace: row?.workspaceLabel ? () => rename.open(row, 'workspace') : undefined,
      closeAgent: row
        ? () =>
            void closeAgent(row, actions, { anchorKey: COMPOSER_MORE_ANCHOR }).then(
              (closed) => closed && router.back(),
            )
        : undefined,
    };
    return { add: composerAddItems(menuActions), more: composerMoreItems(menuActions) };
  }, [
    row,
    staging,
    staging.canBegin,
    dictation.toggle,
    dictation.listening,
    images.reviewImage,
    router,
    surface,
    onToggleSurface,
    hostId,
    paneId,
    actions,
    rename.open,
    inWorktree,
  ]);

  const sheets = (
    <>
      {images.sheet}
      <ComposerToolsSheets
        open={sheet}
        onOpen={setSheet}
        hostId={hostId}
        program={program}
        projectRoot={projectRoot}
        onInsert={(text) => store.insertIntoDraft(text)}
      />
      {rename.sheet}
    </>
  );
  return { addItems: items.add, moreItems: items.more, shortcutItems, staging, sheets };
}
