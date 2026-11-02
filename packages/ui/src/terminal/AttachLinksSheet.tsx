import { Sheet } from '../overlay/Sheet';
import { EmptyState } from '../primitives/EmptyState';
import { Icon } from '../primitives/Icon';
import { ListRow } from '../primitives/ListRow';

/** A link as the sheet lists it (the core `AttachLink` has the same shape). */
export interface AttachLinkItem {
  target: string;
  host: string;
}

interface AttachLinksSheetProps {
  visible: boolean;
  links: readonly AttachLinkItem[];
  title: string;
  emptyTitle: string;
  closeLabel?: string;
  onOpen: (link: AttachLinkItem) => void;
  onClose: () => void;
}

/** "Attach Links": the http(s) links seen in the terminal since the detail opened, newest first. */
export function AttachLinksSheet({
  visible,
  links,
  title,
  emptyTitle,
  closeLabel,
  onOpen,
  onClose,
}: AttachLinksSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      closeLabel={closeLabel}
      testID="attach-links-sheet"
    >
      {links.length === 0 ? (
        <EmptyState layout="compact" title={emptyTitle} icon="globe" />
      ) : (
        links.map((link) => (
          <ListRow
            key={link.target}
            title={link.host}
            subtitle={link.target}
            leading={<Icon name="globe" />}
            onPress={() => onOpen(link)}
            testID={`attach-link-${link.target}`}
          />
        ))
      )}
    </Sheet>
  );
}
