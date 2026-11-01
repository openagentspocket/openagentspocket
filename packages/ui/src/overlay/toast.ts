import type { ReactNode } from 'react';
import type { IconName } from '../primitives/Icon';
import type { Tone } from '../theme/status';
import { createQueue } from './store';

export const TOAST_DEFAULT_MS = 4000;

export interface ToastOptions {
  title: string;
  message?: string;
  tone?: Tone;
  icon?: IconName;
  /** A leading mark in place of the icon, such as an Agent's ProgramMark (in-app notification banner). */
  leading?: ReactNode;
  /** Tapping the toast runs this, then dismisses it (open the Agent that needs you). */
  onPress?: () => void;
  /** What the tap does, for screen readers ("Opens the Agent"). */
  accessibilityHint?: string;
  /** 0 keeps it until dismissed. */
  durationMs?: number;
}

export interface ToastRequest extends ToastOptions {
  id: number;
}

export const toastQueue = createQueue<ToastRequest>();
let nextId = 1;

/**
 * Shows a transient banner over the app (an in-app notification, "Copied",
 * a failed send) and returns a function that dismisses it early.
 */
export function toast(options: ToastOptions): () => void {
  const request: ToastRequest = { ...options, id: nextId++ };
  toastQueue.push(request);
  return () => toastQueue.remove(request);
}
