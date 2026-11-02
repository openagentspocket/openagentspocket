import {
  type BrowserError,
  presentationMessage,
  renderText,
  type Text,
  type Translate,
} from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

/** The New Agent flow's catalog lookup for core's unresolved `Text`. */
const fromCatalog: Translate = (key, args) =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

export const newAgentText = (text: Text): string => renderText(text, fromCatalog);

/** A directory-browser failure in the user's words. */
export const browserErrorText = (error: BrowserError): string =>
  error.kind === 'transport'
    ? presentationMessage(error.presentation, fromCatalog)
    : newAgentText(error.message);
