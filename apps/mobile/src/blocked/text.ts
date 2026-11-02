import { renderText, type Text, type Translate } from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

const fromCatalog: Translate = (key, args) =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

/** A core `Text` (a catalog message or the Agent's own words) in the user's language. */
export const cardText = (text: Text): string => renderText(text, fromCatalog);
