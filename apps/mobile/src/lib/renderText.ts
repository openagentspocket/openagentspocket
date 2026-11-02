import { renderText, type Text } from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

/** A core `Text` (a catalog key with arguments, or plain words) in the current locale. */
export function renderMessage(text: Text): string {
  return renderText(text, (key, args) => translate(getLocale(), 'app', key, args, getLocaleTag()));
}
