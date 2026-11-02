import { renderText, type Text, type Translate } from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

const fromCatalog: Translate = (key, args) =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

/** Core's unresolved `Text` as the current language's string (Snippets, Skills, Attachments). */
export const toolsText = (text: Text): string => renderText(text, fromCatalog);
