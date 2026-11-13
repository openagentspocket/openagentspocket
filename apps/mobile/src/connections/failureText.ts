import {
  presentation,
  renderText,
  type Translate,
  type TransportError,
} from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

const fromCatalog: Translate = (key, args) =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

/**
 * A Host's connection failure in the user's words: a short summary and the error's own detail with
 * its next step. It is the link's status, so a bare timeout reads as a dial nothing answered.
 */
export function failureText(error: TransportError): { summary: string; detail: string } {
  const shown = presentation(error, { connecting: true });
  const detail = [shown.detail, shown.recovery]
    .filter((text) => text !== undefined)
    .map((text) => renderText(text, fromCatalog))
    .join('\n');
  return { summary: renderText(shown.summary, fromCatalog), detail };
}
