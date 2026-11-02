import { t } from '@openagentspocket/i18n';

/** Which Status Inbox section an age is read in; it picks the spoken sentence. */
export type AgeSection = 'needsYou' | 'working' | 'doneRecent' | 'idle';

export type InboxAgeUnit =
  | { readonly kind: 'now' }
  | { readonly kind: 'minutes' | 'hours' | 'days'; readonly count: number };

export interface InboxAge {
  readonly unit: InboxAgeUnit;
  /** A first-sighting time: the real span is at least this long. */
  readonly isApproximate: boolean;
}

/** How long ago a status started, in coarse units; clock skew never goes negative. */
export function inboxAge(since: number, now: number, isApproximate: boolean): InboxAge {
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const unit: InboxAgeUnit =
    seconds < 60
      ? { kind: 'now' }
      : seconds < 3600
        ? { kind: 'minutes', count: Math.floor(seconds / 60) }
        : seconds < 86_400
          ? { kind: 'hours', count: Math.floor(seconds / 3600) }
          : { kind: 'days', count: Math.floor(seconds / 86_400) };
  return { unit, isApproximate };
}

const SUFFIX = { minutes: 'm', hours: 'h', days: 'd' } as const;

/** The compact card age: "now", "3m", "2h", "1d"; approximate ones read "≥3m". */
export function ageText({ unit, isApproximate }: InboxAge): string {
  if (unit.kind === 'now') return t('now');
  const value = `${unit.count}${SUFFIX[unit.kind]}`;
  return isApproximate ? `≥${value}` : value;
}

function duration(unit: Exclude<InboxAgeUnit, { kind: 'now' }>): string {
  switch (unit.kind) {
    case 'minutes':
      return t('%lld minutes', unit.count);
    case 'hours':
      return t('%lld hours', unit.count);
    case 'days':
      return t('%lld days', unit.count);
  }
}

/** The age as one whole sentence for a screen reader: "Waiting 3 minutes", "2 hours ago". */
export function ageSpoken(age: InboxAge, section: AgeSection): string {
  const { unit, isApproximate } = age;
  if (unit.kind === 'now') {
    return section === 'needsYou' ? t('Waiting since just now') : t('Just now');
  }
  const span = duration(unit);
  if (section === 'needsYou') {
    return isApproximate ? t('Waiting at least %@', span) : t('Waiting %@', span);
  }
  if (section === 'working') {
    return isApproximate ? t('Working for at least %@', span) : t('Working for %@', span);
  }
  return isApproximate ? t('At least %@ ago', span) : t('%@ ago', span);
}
