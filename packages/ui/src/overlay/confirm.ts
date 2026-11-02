import { createQueue, hasHost } from './store';

/**
 * alert: a centered dialog; dialog: an action sheet anchored to the bottom (iOS confirmationDialog);
 * popover: a card with an arrow above the bottom toolbar, dismissed by tapping outside (no Cancel).
 */
export type ConfirmPresentation = 'alert' | 'dialog' | 'popover';

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
  /** A popover's arrow: under its control at the trailing edge (`end`) or centered. Default center. */
  anchor?: 'center' | 'end';
}

export interface ConfirmOptions extends BaseOptions {
  /** Default "OK". */
  confirmLabel?: string;
  destructive?: boolean;
}

export interface ChoiceOptions<K extends string> extends BaseOptions {
  actions: readonly ConfirmAction<K>[];
}

export interface AlertRequest {
  title: string;
  message?: string;
  actions: readonly ConfirmAction[];
  cancelLabel: string | null;
  presentation: ConfirmPresentation;
  anchor?: 'center' | 'end';
  resolve: (key: string | null) => void;
}

export const alertQueue = createQueue<AlertRequest>();

/** Answers the presented request: the chosen action's key, or null for cancel. */
export function answerAlert(request: AlertRequest, key: string | null) {
  alertQueue.remove(request);
  request.resolve(key);
}

function present(request: Omit<AlertRequest, 'resolve'>): Promise<string | null> {
  if (!hasHost('alert')) {
    console.warn('confirm(): no <OverlayHost /> is mounted; answering cancel.');
    return Promise.resolve(null);
  }
  return new Promise((resolve) => alertQueue.push({ ...request, resolve }));
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
      anchor: options.anchor,
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
    anchor: options.anchor,
  });
  return key === 'confirm';
}
