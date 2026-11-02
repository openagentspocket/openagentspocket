import type { Say } from '@openagentspocket/core';
import { getLocale, getLocaleTag, translate } from '@openagentspocket/i18n';

/** The Changes feature's strings, from the current locale's catalog. */
export const say: Say = (key, ...args) => translate(getLocale(), 'app', key, args, getLocaleTag());
