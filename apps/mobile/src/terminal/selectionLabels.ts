import type { PasteReview } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { OpenAttachLinkOptions, ReviewPasteLabels } from '@openagentspocket/ui';

/** Copy for the Review Paste sheet, from the Swift catalog keys. */
export function reviewPasteLabels(
  review: Pick<PasteReview, 'lineCount' | 'characterCount'>,
): ReviewPasteLabels {
  return {
    title: t('Review Paste'),
    summary: t('%lld lines, %lld characters', review.lineCount, review.characterCount),
    paste: t('Paste'),
    cancel: t('Cancel'),
    close: t('Done'),
  };
}

/** Copy for the "Couldn't Open Link" alert; `host` names the link in the message. */
export function openLinkLabels(host: string): OpenAttachLinkOptions['labels'] {
  return {
    failedTitle: t("Couldn't Open Link"),
    failedMessage: host
      ? t("The link to %@ couldn't be opened. You can copy it instead.", host)
      : t("This link couldn't be opened."),
    copy: t('Copy Link'),
    cancel: t('Cancel'),
  };
}

/** Titles of the terminal's sheets and the paste-blocked alert. */
export const terminalSheetTitles = () => ({
  selectText: t('Select Text'),
  attachLinks: t('Attach Links'),
  pasteBlocked: t('Paste Blocked'),
  pasteBlockedMessage: t('The clipboard contains unsafe terminal control characters.'),
});
