import {
  type AgentSkill,
  type ChatCommand,
  type ProgramSendPolicy,
  type SlashPanel,
  sendPolicyForAgent,
  slashPanel,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { ComposerSkill } from '@openagentspocket/ui';
import { useMemo } from 'react';
import { cardText } from '@/blocked/text';
import type { Surface } from '../surface';
import type { AgentComposer } from './composerContext';

interface Input {
  composer: AgentComposer;
  surface: Surface;
  program: string;
  /** Chat's send policy and menu (`useChatSend`); the terminal reads the program's own policy. */
  chatPolicy: ProgramSendPolicy | null;
  chatMenu: readonly ChatCommand[];
  skills: readonly AgentSkill[];
  /** Takes the user to the other surface; absent, commands that run there are left out. */
  onToggleSurface?: () => void;
}

/** What the Composer's `/` panel shows, and what picking a row does. */
export interface SlashPanelProps {
  commands: ComposerSkill[];
  onCommand: (name: string) => void;
  skills: ComposerSkill[];
  onSkill: (name: string) => void;
}

/** The panel's rows in the user's language: a command run elsewhere names where ("Terminal"). */
export function slashRows(
  panel: SlashPanel | null,
  surface: Surface,
): { commands: ComposerSkill[]; skills: ComposerSkill[] } {
  return {
    commands: (panel?.commands ?? []).map((command) => ({
      name: command.name,
      description: command.enabled
        ? cardText(command.title)
        : t('Available once the Agent is idle'),
      hint: command.surface === surface ? undefined : t('Terminal'),
    })),
    skills: (panel?.skills ?? []).map((skill) => ({
      name: skill.name,
      description: skill.description ?? '',
    })),
  };
}

/**
 * The `/` panel for an Agent (`slashPanel`): the program's commands over the Agent's skills. A
 * pick only writes the draft: a command that runs on the other surface takes the user there with
 * it typed, as a tapped shortcut and "Run in Terminal" do; nothing is sent.
 */
export function useSlashPanel({
  composer,
  surface,
  program,
  chatPolicy,
  chatMenu,
  skills,
  onToggleSurface,
}: Input): SlashPanelProps {
  const { store, snapshot } = composer;
  const panel = useMemo(
    () =>
      slashPanel({
        draft: snapshot.draft,
        surface,
        program,
        policy: surface === 'chat' ? chatPolicy : sendPolicyForAgent(program),
        chatMenu: surface === 'chat' ? chatMenu : [],
        skills,
        terminalReachable: onToggleSurface !== undefined,
      }),
    [snapshot.draft, surface, program, chatPolicy, chatMenu, skills, onToggleSurface],
  );
  const commands = panel?.commands ?? [];
  const found = panel?.skills ?? [];
  const rows = slashRows(panel, surface);
  return {
    commands: rows.commands,
    onCommand: (name) => {
      const command = commands.find((candidate) => candidate.name === name);
      if (!command?.enabled) return;
      if (command.surface !== surface) onToggleSurface?.();
      store.replaceDraft(command.text);
    },
    skills: rows.skills,
    onSkill: (name) => {
      const skill = found.find((candidate) => candidate.name === name);
      if (skill) store.replaceDraft(skill.text);
    },
  };
}
