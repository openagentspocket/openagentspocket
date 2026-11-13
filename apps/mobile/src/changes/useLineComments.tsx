import {
  type CommentedLine,
  type DiffFile,
  type KeyValueStorage,
  lineCommentText,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { type DiffRowLine, toast, useHandoverSheet } from '@openagentspocket/ui';
import { type ReactNode, useState } from 'react';
import { useComposerHandoff } from '@/agent-detail/composer/useComposerHandoff';
import { renderMessage } from '@/lib/renderText';
import { commentedLine } from './diffLines';
import { LineCommentSheet } from './LineCommentSheet';
import { parseChangesTarget } from './target';

export interface LineComments {
  /** Opens the comment sheet on a line; undefined when Changes has no Agent to hand it to. */
  onReference: ((file: DiffFile, line: DiffRowLine) => void) | undefined;
  /** Goes to the Agent's Chat, once a comment was added on this screen. */
  openChat: (() => void) | undefined;
  sheet: ReactNode;
}

/**
 * Review comments on diff lines: each one joins the Agent's draft while the user stays on the
 * diff; a toast confirms and opens the Chat, where the user sends them all together.
 */
export function useLineComments(agentId: string, storage: KeyValueStorage): LineComments {
  const target = parseChangesTarget(agentId);
  const agent = target?.kind === 'agent' ? target : undefined;
  const handoff = useComposerHandoff(storage);
  const sheet = useHandoverSheet<CommentedLine>();
  const [added, setAdded] = useState(0);
  const openChat = agent ? () => handoff.open(agent) : undefined;
  const add = (comment: string) => {
    const text = sheet.value ? lineCommentText(sheet.value, comment) : null;
    if (!agent || !text) return;
    handoff.add(agent, renderMessage(text));
    setAdded((count) => count + 1);
    sheet.closeThen(() =>
      toast({
        title: t('Added to the Composer'),
        message: t("Tap to open the Agent's Chat."),
        icon: 'chat',
        onPress: () => handoff.open(agent),
        accessibilityHint: t("Opens the Agent's Chat"),
      }),
    );
  };
  return {
    onReference: agent ? (file, line) => sheet.open(commentedLine(file, line)) : undefined,
    openChat: added > 0 ? openChat : undefined,
    sheet: agent ? (
      <LineCommentSheet
        visible={sheet.visible}
        line={sheet.value}
        onAdd={add}
        onClose={sheet.close}
        onDismissed={sheet.onDismissed}
      />
    ) : null,
  };
}
