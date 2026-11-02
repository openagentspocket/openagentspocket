import { agentKind, type StatusInboxItem } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  AgentRowMenu,
  agentRowActions,
  InboxCard,
  type InboxPresentation,
  SwipeRow,
} from '@openagentspocket/ui';
import { useState } from 'react';
import { homeLabels } from './homeLabels';
import { ageSpoken, ageText, inboxAge } from './inboxAge';

const SECTION = { needsYou: 'needsYou', working: 'working', doneRecent: 'done' } as const;

function ageOf(item: StatusInboxItem, now: number) {
  return item.since === undefined ? undefined : inboxAge(item.since, now, item.isApproximate);
}

export function presentInbox(item: StatusInboxItem, now: number): InboxPresentation {
  const age = ageOf(item, now);
  return {
    program: agentKind(item.row.agent),
    title: item.titleQualifier ? `${item.title} · ${item.titleQualifier}` : item.title,
    subtitle: item.detail || undefined,
    age: age ? ageText(age) : undefined,
    chips: item.chips.map((chip) => chip.text),
    section: SECTION[item.section as keyof typeof SECTION] ?? 'done',
  };
}

interface InboxItemProps {
  item: StatusInboxItem;
  now: number;
  pinned: boolean;
  onOpen?: (item: StatusInboxItem) => void;
  onPin: (item: StatusInboxItem) => void;
  onClose: (item: StatusInboxItem) => void;
}

/** One inbox card with its swipes (Pin leading, Close trailing) and the long-press menu. */
export function InboxItem({ item, now, pinned, onOpen, onPin, onClose }: InboxItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const presentation = presentInbox(item, now);
  const actions = agentRowActions({
    pinned,
    labels: homeLabels(),
    onPin: () => onPin(item),
    onClose: () => onClose(item),
  });
  const age = ageOf(item, now);
  const label = [
    presentation.title,
    item.detail,
    presentation.chips.length > 0 ? t('On %@', presentation.chips.join(', ')) : undefined,
    age ? ageSpoken(age, item.section) : undefined,
  ]
    .filter(Boolean)
    .join('. ');
  const card = (testID: string) => (
    <InboxCard
      presentation={presentation}
      accessibilityLabel={label}
      testID={testID}
      onPress={onOpen ? () => onOpen(item) : undefined}
      onLongPress={() => setMenuOpen(true)}
    />
  );
  return (
    <>
      <SwipeRow
        leadingActions={actions.leading}
        actions={actions.trailing}
        fullSwipe={{ leading: true }}
      >
        {card(`inbox-${item.row.agent.pane_id}`)}
      </SwipeRow>
      <AgentRowMenu
        preview={card('inbox-preview')}
        items={actions.menu}
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
    </>
  );
}
