import {
  type PortsMessage,
  renderPortsMessage,
  renderText,
  type Text,
  type Translate,
} from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

/** The Ports feature's catalog lookup for core's unresolved `Text`. */
const fromCatalog: Translate = (key, args) =>
  translate(getLocale(), 'app', key, args, getLocaleTag());

export const portsText = (text: Text): string => renderText(text, fromCatalog);

export const portsMessage = (message: PortsMessage): string =>
  renderPortsMessage(message, fromCatalog);
