import { confirm } from '../overlay/confirm';

export interface OpenAttachLinkOptions {
  /** The system URL opener; rejects (or resolves false) when the system refuses the link. */
  open: (target: string) => Promise<boolean | undefined>;
  copy: (target: string) => unknown;
  labels: {
    /** "Couldn't Open Link". */
    failedTitle: string;
    /** "The link to example.com couldn't be opened. You can copy it instead." */
    failedMessage: string;
    /** "Copy Link". */
    copy: string;
    cancel: string;
  };
}

/**
 * Opens a collected link; when the system refuses, offers "Copy Link" instead of failing silently.
 * Resolves true when the link opened.
 */
export async function openAttachLink(
  target: string,
  { open, copy, labels }: OpenAttachLinkOptions,
): Promise<boolean> {
  let opened = false;
  try {
    opened = (await open(target)) !== false;
  } catch {
    opened = false;
  }
  if (opened) return true;
  const wantsCopy = await confirm({
    title: labels.failedTitle,
    message: labels.failedMessage,
    confirmLabel: labels.copy,
    cancelLabel: labels.cancel,
  });
  if (wantsCopy) await copy(target);
  return false;
}
