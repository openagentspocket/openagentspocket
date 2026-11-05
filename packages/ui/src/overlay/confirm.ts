import { createQueue, hasHost } from './store';

/** alert: a centered dialog; dialog: an action sheet anchored to the bottom (iOS confirmationDialog). */
export type ConfirmPresentation = 'alert' | 'dialog';

export interface ConfirmAction<K extends string = string> {
  key: K;
  title: string;
  destructive?: boolean;
}

interface BaseOptions {
  title: string;
  message?: string;
  /** The cancel button's title; null for an informational alert with one button. Default "Cancel". */
  cancelLabel?: string | null;
  presentation?: ConfirmPresentation;
}

export interface ConfirmOptions extends BaseOptions {
  /** Default "OK". */
  confirmLabel?: string;
  destructive?: boolean;
}

export interface ChoiceOptions<K extends string> extends BaseOptions {
  actions: readonly ConfirmAction<K>[];
}

export interface PromptOptions {
  title: string;
  message?: string;
  /** The text the field starts with. */
  initial?: string;
  placeholder?: string;
  /** Default "OK". */
  confirmLabel?: string;
  /** Default "Cancel". */
  cancelLabel?: string;
  testID?: string;
}

export interface AlertRequest {
  /** A one-line text field above the buttons (prompt). */
  field?: { initial: string; placeholder?: string; testID?: string };
  title: string;
  message?: string;
  actions: readonly ConfirmAction[];
  cancelLabel: string | null;
  presentation: ConfirmPresentation;
  resolve: (key: string | null, text?: string) => void;
}

export const alertQueue = createQueue<AlertRequest>();

/** Answers the presented request: the chosen action's key, or null for cancel. */
export function answerAlert(request: AlertRequest, key: string | null, text?: string) {
  alertQueue.remove(request);
  request.resolve(key, text);
}

function presentWithText(
  request: Omit<AlertRequest, 'resolve'>,
): Promise<{ key: string | null; text?: string }> {
  if (!hasHost('alert')) {
    console.warn('confirm(): no <OverlayHost /> is mounted; answering cancel.');
    return Promise.resolve({ key: null });
  }
  return new Promise((resolve) =>
    alertQueue.push({ ...request, resolve: (key, text) => resolve({ key, text }) }),
  );
}

async function present(request: Omit<AlertRequest, 'resolve'>): Promise<string | null> {
  return (await presentWithText(request)).key;
}

/** A centered alert with one text field: resolves the entered text, or null on cancel. */
export async function prompt(options: PromptOptions): Promise<string | null> {
  const { key, text } = await presentWithText({
    title: options.title,
    message: options.message,
    field: {
      initial: options.initial ?? '',
      placeholder: options.placeholder,
      testID: options.testID,
    },
    actions: [{ key: 'confirm', title: options.confirmLabel ?? 'OK' }],
    cancelLabel: options.cancelLabel ?? 'Cancel',
    presentation: 'alert',
  });
  return key === 'confirm' ? (text ?? '') : null;
}

/**
 * The one way to ask: every alert, confirmation and destructive check goes
 * through here and is drawn by the mounted OverlayHost.
 *
 * - `confirm({ title, confirmLabel, destructive })` resolves true when confirmed.
 * - `confirm({ title, actions })` resolves the chosen action's key, or null on cancel.
 */
export function confirm(options: ConfirmOptions): Promise<boolean>;
export function confirm<K extends string>(options: ChoiceOptions<K>): Promise<K | null>;
export async function confirm<K extends string>(
  options: ConfirmOptions | ChoiceOptions<K>,
): Promise<boolean | K | null> {
  const cancelLabel = options.cancelLabel === undefined ? 'Cancel' : options.cancelLabel;
  if ('actions' in options) {
    const key = await present({
      title: options.title,
      message: options.message,
      actions: options.actions,
      cancelLabel,
      presentation: options.presentation ?? 'dialog',
    });
    return key as K | null;
  }
  const key = await present({
    title: options.title,
    message: options.message,
    actions: [
      { key: 'confirm', title: options.confirmLabel ?? 'OK', destructive: options.destructive },
    ],
    cancelLabel,
    presentation: options.presentation ?? 'alert',
  });
  return key === 'confirm';
}
