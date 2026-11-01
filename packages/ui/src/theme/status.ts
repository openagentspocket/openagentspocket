import type { ColorKey } from './tokens.generated';

/** An Agent's status as the UI draws it (an unknown status draws as idle). */
export type Status = 'blocked' | 'working' | 'done' | 'idle';

export const statusColorKey: Record<Status, ColorKey> = {
  blocked: 'statusBlocked',
  working: 'statusWorking',
  done: 'statusDone',
  idle: 'statusIdle',
};

/** Semantic tones shared by banners, toasts and buttons. */
export type Tone = 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'neutral';

export const toneColorKey: Record<Tone, ColorKey> = {
  accent: 'accent',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  neutral: 'textSecondary',
};
