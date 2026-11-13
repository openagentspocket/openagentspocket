import {
  type CheckoutChanges,
  type CommitRequestKind,
  commitRequestKinds,
  commitRequestText,
  isClean,
  type KeyValueStorage,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { ActionMenuButton, type ActionMenuItem } from '@openagentspocket/ui';
import { useComposerHandoff } from '@/agent-detail/composer/useComposerHandoff';
import { renderMessage } from '@/lib/renderText';
import type { ChangesTarget } from './target';

interface AskAgentMenuProps {
  /** Changes' target; only an Agent's directory has someone to ask. */
  target: ChangesTarget | undefined;
  changes: CheckoutChanges;
  /** Where the Agent's Composer keeps its draft (the app's storage). */
  storage: KeyValueStorage;
}

const titleOf = (kind: CommitRequestKind, clean: boolean): string => {
  if (kind === 'commit') return t('Commit Changes');
  return clean ? t('Open Pull Request') : t('Commit and Open Pull Request');
};

/**
 * Asks the Agent to commit, or to commit and open a pull request: the request lands in its
 * Composer and the user sends it there. The app itself never runs git.
 */
export function AskAgentMenu({ target, changes, storage }: AskAgentMenuProps) {
  const handoff = useComposerHandoff(storage);
  if (target?.kind !== 'agent') return null;
  const clean = isClean(changes);
  const items: ActionMenuItem[] = commitRequestKinds(changes).map((kind) => ({
    key: kind,
    title: titleOf(kind, clean),
    icon: kind === 'commit' ? 'commit' : 'branch',
    onPress: () => {
      handoff.add(target, renderMessage(commitRequestText(changes, kind)));
      handoff.open(target);
    },
  }));
  return (
    <ActionMenuButton
      items={items}
      label={t('Ask Agent')}
      icon="bot"
      title={t("Writes a request in the Agent's Composer. You review it and send it.")}
      accessibilityLabel={t('Ask Agent')}
      testID="changes-ask-agent"
    />
  );
}
