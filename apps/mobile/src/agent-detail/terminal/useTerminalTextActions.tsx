import { type AttachLink, AttachLinkIndex } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import {
  type ActionMenuItem,
  AttachLinksSheet,
  copyToClipboard,
  openAttachLink,
  SelectTextSheet,
} from '@openagentspocket/ui';
import { useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useConversationRegistry } from '@/conversations/useConversation';
import { openLinkLabels, terminalSheetTitles } from '@/terminal/selectionLabels';

/**
 * Select Text and Attach Links for an Agent's terminal. The terminal surface cannot select across
 * rows, so both read the screen from the Host; links stay listed for the whole visit.
 */
export function useTerminalTextActions(hostId: string, paneId: string) {
  const registry = useConversationRegistry();
  const index = useRef(new AttachLinkIndex());
  const [text, setText] = useState<string | null>(null);
  const [links, setLinks] = useState<readonly AttachLink[] | null>(null);
  const titles = terminalSheetTitles();
  const read = async () =>
    (await registry?.readVisibleText(hostId, paneId).catch(() => null)) ?? '';
  const showLinks = async () => {
    index.current.receiveViewportText(await read());
    setLinks([...index.current.links]);
  };
  const open = (link: AttachLink) =>
    void openAttachLink(link.target, {
      open: (target) => Linking.openURL(target).then(() => true),
      copy: (target) => copyToClipboard(target, t('Copied')),
      labels: openLinkLabels(link.host),
    });
  const items: ActionMenuItem[] = [
    {
      key: 'select',
      title: titles.selectText,
      icon: 'copy',
      onPress: () => void read().then(setText),
    },
    { key: 'links', title: titles.attachLinks, icon: 'globe', onPress: () => void showLinks() },
  ];
  const sheets = (
    <>
      <SelectTextSheet
        text={text}
        title={titles.selectText}
        closeLabel={t('Done')}
        onClose={() => setText(null)}
      />
      <AttachLinksSheet
        visible={links !== null}
        links={links ?? []}
        title={titles.attachLinks}
        emptyTitle={t('No Links Yet')}
        closeLabel={t('Done')}
        onOpen={open}
        onClose={() => setLinks(null)}
      />
    </>
  );
  return { items, sheets };
}
