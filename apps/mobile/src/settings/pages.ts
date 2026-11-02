import { acknowledgements, chat, fonts, theme, toolbar } from './pagesDetail';
import { root } from './pagesRoot';
import type { SettingsPage } from './schema';

export const SETTINGS_PAGES: Readonly<Record<string, SettingsPage>> = Object.fromEntries(
  [root, theme, fonts, chat, toolbar, acknowledgements].map((page) => [page.id, page]),
);
