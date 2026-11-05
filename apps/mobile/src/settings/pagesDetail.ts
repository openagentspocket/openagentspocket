import {
  CHAT_FONTS,
  CHAT_TEXT_OFFSET_RANGE,
  TERMINAL_FONT_SIZE_RANGE,
  TERMINAL_FONTS,
} from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import { CHAT_FONT_TITLES, fontOptions, TERMINAL_FONT_TITLES } from './pagesRoot';
import type { SettingsPage } from './schema';
import { terminalThemeName } from './terminalPalettes';

export const theme: SettingsPage = {
  id: 'theme',
  title: () => t('Theme'),
  sections: [
    {
      id: 'preview',
      title: () => t('Preview'),
      loose: true,
      rows: [
        {
          kind: 'custom',
          id: 'settings.theme.preview',
          title: () => t('Preview'),
          component: 'themePreview',
        },
      ],
    },
    {
      id: 'automatic',
      title: () => t('Automatic'),
      rows: [
        {
          kind: 'toggle',
          id: 'settings.theme.followSystem',
          title: () => t('Follow System'),
          key: 'followSystem',
        },
      ],
    },
    {
      id: 'terminal',
      rows: [
        {
          kind: 'page',
          id: 'settings.theme.terminalPalette',
          title: () => t('Terminal Palette'),
          icon: 'terminal',
          page: 'terminalTheme',
          value: (ctx) => terminalThemeName(ctx.values.terminalTheme),
        },
      ],
    },
    {
      id: 'themes',
      loose: true,
      rows: [
        {
          kind: 'custom',
          id: 'settings.theme.cards',
          title: () => t('Theme'),
          component: 'themeCards',
        },
      ],
    },
  ],
};

export const terminalTheme: SettingsPage = {
  id: 'terminalTheme',
  title: () => t('Terminal Palette'),
  sections: [
    {
      id: 'palettes',
      loose: true,
      rows: [
        {
          kind: 'custom',
          id: 'settings.terminalTheme.picker',
          title: () => t('Terminal Palette'),
          component: 'terminalPalette',
        },
      ],
    },
  ],
};

export const fonts: SettingsPage = {
  id: 'fonts',
  title: () => t('Fonts & Size'),
  sections: [
    {
      id: 'terminal',
      title: () => t('Terminal'),
      footer: () => t('Pinching a terminal to zoom changes its text size too, and it sticks.'),
      rows: [
        {
          kind: 'picker',
          id: 'settings.terminal.font',
          title: () => t('Font'),
          key: 'terminalFont',
          options: fontOptions(TERMINAL_FONTS, (font) => TERMINAL_FONT_TITLES[font]),
        },
        {
          kind: 'stepper',
          id: 'settings.terminal.textSize',
          title: () => t('Text Size'),
          key: 'terminalFontSize',
          ...TERMINAL_FONT_SIZE_RANGE,
          format: (value) => t('%lld pt', value),
        },
      ],
    },
    {
      id: 'chat',
      title: () => t('Chat'),
      footer: () => t("Code stays monospaced, and the text size follows the system's from there."),
      rows: [
        {
          kind: 'picker',
          id: 'settings.chat.font',
          title: () => t('Font'),
          key: 'chatFont',
          options: CHAT_FONTS.map((value) => ({ value, label: CHAT_FONT_TITLES[value] })),
        },
        {
          kind: 'stepper',
          id: 'settings.chat.textSize',
          title: () => t('Text Size'),
          key: 'chatTextOffset',
          ...CHAT_TEXT_OFFSET_RANGE,
          format: (value) => (value > 0 ? `+${value}` : String(value)),
        },
        {
          kind: 'custom',
          id: 'settings.chat.textSample',
          title: () => '',
          component: 'chatSample',
        },
      ],
    },
  ],
};

export const chat: SettingsPage = {
  id: 'chat',
  title: () => t('Chat'),
  sections: [
    {
      id: 'turns',
      footer: () =>
        t(
          "A finished turn's steps fold behind one line above its answer; a turn stays open while it runs or while its background work does.",
        ),
      rows: [
        {
          kind: 'toggle',
          id: 'settings.chat.foldFinishedTurns',
          title: () => t('Fold Finished Turns'),
          key: 'foldFinishedTurns',
        },
      ],
    },
    {
      id: 'cache',
      title: () => t('Cache'),
      footer: () =>
        t(
          'Recent Chat messages stay on this device for up to 30 days, within 300 MB. Removing a Host deletes its messages.',
        ),
      rows: [
        {
          kind: 'custom',
          id: 'settings.chat.cache',
          title: () => t('Cache'),
          component: 'chatCache',
        },
      ],
    },
  ],
};

export const toolbar: SettingsPage = {
  id: 'toolbar',
  title: () => t('Toolbar'),
  sections: [
    {
      id: 'preview',
      title: () => t('Preview'),
      loose: true,
      rows: [
        {
          kind: 'custom',
          id: 'settings.toolbar.previewBar',
          title: () => t('Preview'),
          component: 'toolbarPreview',
        },
      ],
    },
    {
      id: 'keys',
      title: () => t('Keys'),
      footer: () =>
        t(
          'Ctrl, the keyboard key and More always show. A key you hide stays one menu away, in More › Commands.',
        ),
      rows: [
        {
          kind: 'toggle',
          id: 'settings.toolbar.escape',
          title: () => t('Escape'),
          key: 'toolbarEscape',
        },
        { kind: 'toggle', id: 'settings.toolbar.tab', title: () => t('Tab'), key: 'toolbarTab' },
        {
          kind: 'toggle',
          id: 'settings.toolbar.dpad',
          title: () => t('D-pad'),
          subtitle: () => t('Arrows and Enter in one control'),
          key: 'toolbarDPad',
        },
      ],
    },
    {
      id: 'behavior',
      title: () => t('Behavior'),
      footer: () =>
        t(
          'Tap Ctrl to apply it to the next key. Touch and hold it to keep it on until you tap it again.',
        ),
      rows: [
        {
          kind: 'toggle',
          id: 'settings.toolbar.haptics',
          title: () => t('Haptics'),
          key: 'toolbarHaptics',
        },
      ],
    },
    {
      id: 'reset',
      rows: [
        {
          kind: 'reset',
          id: 'settings.toolbar.reset',
          title: () => t('Reset Toolbar'),
          keys: ['toolbarEscape', 'toolbarTab', 'toolbarDPad', 'toolbarHaptics'],
        },
      ],
    },
  ],
};

export const acknowledgements: SettingsPage = {
  id: 'acknowledgements',
  title: () => t('Acknowledgements'),
  sections: [
    {
      id: 'components',
      rows: [
        {
          kind: 'custom',
          id: 'settings.acknowledgements.list',
          title: () => t('Acknowledgements'),
          component: 'acknowledgements',
        },
      ],
    },
  ],
};
