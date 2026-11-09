import {
  agentKey,
  programInPane,
  type UndetectedProgramNotice,
  undetectedProgramNotice,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  installIntegration,
  readIntegrationStatuses,
  SshTransport,
} from '@openagentspocket/transport';
import { toast } from '@openagentspocket/ui';
import { useCallback, useEffect, useState } from 'react';
import { useAgent, useConsoleStore } from '@/console/hooks';

export interface UndetectedProgram {
  readonly notice: UndetectedProgramNotice;
  /** Installs the program's herdr integration; present for an `install` notice. */
  readonly install?: () => void;
  readonly installing: boolean;
}

/**
 * For a pane herdr detects no Agent in: the program its processes run and why it does not report,
 * from `pane.process_info` and `herdr integration status`. Null for an Agent herdr reports, a
 * shell, or a program herdr has no integration for.
 */
export function useUndetectedProgram(hostId: string, paneId: string): UndetectedProgram | null {
  const consoleStore = useConsoleStore();
  const undetected = useAgent(agentKey(hostId, paneId))?.agent.agent == null;
  const [notice, setNotice] = useState<UndetectedProgramNotice | null>(null);
  const [installing, setInstalling] = useState(false);
  const [reads, setReads] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `reads` asks for a new reading after an install.
  useEffect(() => {
    if (!undetected) return setNotice(null);
    let live = true;
    void consoleStore
      .withTransport(hostId, async (transport) => {
        if (!(transport instanceof SshTransport)) return null;
        const program = programInPane(await transport.paneProcessInfo(paneId));
        if (!program) return null;
        return undetectedProgramNotice(program, await readIntegrationStatuses(transport));
      })
      .then((next) => live && setNotice(next))
      // Nothing it can back: Chat keeps its usual empty state.
      .catch(() => live && setNotice(null));
    return () => {
      live = false;
    };
  }, [consoleStore, hostId, paneId, undetected, reads]);

  const install = useCallback(() => {
    if (notice?.kind !== 'install') return;
    const { program } = notice;
    setInstalling(true);
    void consoleStore
      .withTransport(hostId, async (transport) => {
        if (!(transport instanceof SshTransport))
          throw new Error(t('This Host cannot run scripts.'));
        await installIntegration(transport, program.id);
      })
      .then(() =>
        toast({ title: t('Installed. Restart %@ in this pane to see its Chat.', program.label) }),
      )
      .catch((error: unknown) =>
        toast({ title: error instanceof Error ? error.message : String(error) }),
      )
      .finally(() => {
        setInstalling(false);
        setReads((count) => count + 1);
      });
  }, [consoleStore, hostId, notice]);

  if (!notice) return null;
  return { notice, installing, install: notice.kind === 'install' ? install : undefined };
}
