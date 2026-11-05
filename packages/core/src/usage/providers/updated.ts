import { type Message, message } from '../../errors/text';
import { relativeAge } from '../format';

/** The card footer: "Updated this minute", or "Updated 10 min. ago". */
export function updatedMessage(updatedAt: Date, now: Date, locale: string): Message {
  if (now.getTime() - updatedAt.getTime() < 60_000) return message('Updated this minute');
  return message('Updated %@', relativeAge(updatedAt, now, locale));
}
