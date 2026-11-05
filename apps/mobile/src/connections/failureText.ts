import {
  presentation,
  renderText,
  type Translate,
  type TransportError,
} from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

const fromCatalog: Translate = (key, args) =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

/** A transport failure in the user's words: a short summary and the error's own detail with its next step. */
export function failureText(error: TransportError): { summary: string; detail: string } {
  const shown = presentation(error);
  const detail = [shown.detail, shown.recovery]
    .filter((text) => text !== undefined)
    .map((text) => renderText(text, fromCatalog))
    .join('\n');
  return { summary: renderText(shown.summary, fromCatalog), detail };
}
