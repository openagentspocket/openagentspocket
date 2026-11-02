import { type CommitAge, commitAge } from '@openagentspocket/core';
import { getLocaleTag } from '@openagentspocket/i18n';
import { say } from './say';

/** "3 hours ago" in the app's language, or "just now"; a future timestamp reads as just now. */
export function ageText(committedAt: number, now: number): string {
  const age: CommitAge | null = commitAge(committedAt, now);
  if (age === null) return say('just now');
  try {
    return new Intl.RelativeTimeFormat(getLocaleTag(), { numeric: 'auto' }).format(
      -age.count,
      age.unit,
    );
  } catch {
    return `${age.count} ${age.unit}`;
  }
}

function timeOf(at: number): string {
  return new Date(at).toLocaleTimeString(getLocaleTag(), { hour: 'numeric', minute: '2-digit' });
}

/** "Read at 3:41 PM", or the date too when the read was on another day. */
export function readTimeText(readAt: number, now: number): string {
  const sameDay = new Date(readAt).toDateString() === new Date(now).toDateString();
  if (sameDay) return say('Read at %@', timeOf(readAt));
  const date = new Date(readAt).toLocaleDateString(getLocaleTag(), { dateStyle: 'medium' });
  return say('Read %@ at %@', date, timeOf(readAt));
}

/** A read time describes the content on screen, never a refresh attempt. */
export function freshnessText(readAt: number, now: number): string {
  return say('Possibly incomplete · %@', readTimeText(readAt, now));
}
