import { type CHAT_FONTS, GRACE_PERIODS, type TERMINAL_FONTS } from '@openagentspocket/core';
import { t } from '@openagentspocket/i18n';
import type { IconName } from '@openagentspocket/ui';
import type { SettingsContext, SettingsPage, SettingsRow } from './schema';

type Text = SettingsRow['title'];

export const REPOSITORY_URL = 'https://github.com/openagentspocket/openagentspocket';

/** Routes of screens other tasks own; set a route here when that screen lands. */
export const SETTINGS_ROUTES = {
  notifications: '/settings/notifications',
  snippets: null,
  hosts: '/hosts',
  usage: '/usage',
  setupGuide: null,
} as const satisfies Record<string, string | null>;

export const fontOptions = <T extends string>(values: readonly T[], label: (value: T) => string) =>
  values.map((value) => ({ value, label: () => label(value) }));

export const TERMINAL_FONT_TITLES: Record<(typeof TERMINAL_FONTS)[number], string> = {
  'jetbrains-mono': 'JetBrains Mono',
  'ibm-plex-mono': 'IBM Plex Mono',
  menlo: 'Menlo',
  'courier-new': 'Courier New',
};

export const CHAT_FONT_TITLES: Record<(typeof CHAT_FONTS)[number], () => string> = {
  system: () => t('System'),
  rounded: () => t('Rounded'),
  serif: () => t('Serif'),
  monospaced: () => t('Monospaced'),
};

const GRACE_TITLES: Record<(typeof GRACE_PERIODS)[number], () => string> = {
  immediately: () => t('Immediately'),
  oneMinute: () => t('After 1 Minute'),
  fiveMinutes: () => t('After 5 Minutes'),
  fifteenMinutes: () => t('After 15 Minutes'),
};

const route = (
  id: keyof typeof SETTINGS_ROUTES,
  title: Text,
  icon: IconName,
  value?: (ctx: SettingsContext) => string | undefined,
): SettingsRow => ({
  kind: 'route',
  id: `settings.${id}`,
  title,
  icon,
  route: SETTINGS_ROUTES[id],
  value,
});

export const root: SettingsPage = {
  id: 'root',
  title: () => t('Settings'),
  sections: [
    {
      id: 'appearance',
      title: () => t('Appearance'),
      rows: [
        {
          kind: 'page',
          id: 'settings.appearance.theme',
          title: () => t('Theme'),
          icon: 'appearance',
          page: 'theme',
          accessory: 'themeDots',
          value: (ctx) => ctx.themeName,
        },
        {
          kind: 'page',
          id: 'settings.appearance.fontsAndSize',
          title: () => t('Fonts & Size'),
          icon: 'fontSize',
          page: 'fonts',
          value: (ctx) =>
            `${TERMINAL_FONT_TITLES[ctx.values.terminalFont]} ${ctx.values.terminalFontSize}`,
        },
      ],
    },
    {
      id: 'agents',
      title: () => t('Agents'),
      rows: [
        route(
          'notifications',
          () => t('Notifications'),
          'bell',
          (ctx) => ctx.summary.notifications,
        ),
        {
          kind: 'page',
          id: 'settings.agents.chat',
          title: () => t('Chat'),
          subtitle: () => t('Finished turns, cache'),
          icon: 'chat',
          page: 'chat',
        },
        {
          kind: 'page',
          id: 'settings.agents.agentRows',
          title: () => t('Agent Rows'),
          subtitle: () => t('Fields, order, preview'),
          icon: 'agentRows',
          page: 'agentFields',
        },
      ],
    },
    {
      id: 'input',
      title: () => t('Input'),
      rows: [
        {
          kind: 'page',
          id: 'settings.input.toolbar',
          title: () => t('Toolbar'),
          icon: 'keyboard',
          page: 'toolbar',
        },
        route('snippets', () => t('Snippets'), 'snippets'),
      ],
    },
    {
      id: 'hosts',
      title: () => t('Hosts and Network'),
      rows: [
        route(
          'hosts',
          () => t('Hosts'),
          'server',
          (ctx) => String(ctx.summary.hostCount),
        ),
      ],
    },
    {
      id: 'security',
      title: () => t('Security'),
      footer: (ctx) =>
        ctx.authKind
          ? t(
              'With the lock on, Agentico covers its windows in the app switcher and asks for %@ at launch and when you return after the time above. With SSH keys on, it asks before a Device Key or RSA Key connects; one confirmation covers every Host for %lld seconds. Notifications, Live Activities, and Approve from a notification work as before.',
              ctx.authKind,
              KEY_REUSE_SECONDS,
            )
          : undefined,
      rows: [
        {
          kind: 'toggle',
          id: 'settings.security.requireToOpen',
          title: (ctx) => t('Require %@ to Open', ctx.authKind ?? ''),
          key: 'appLockEnabled',
          requireAuth: true,
          when: (ctx) => ctx.authKind !== null,
        },
        {
          kind: 'picker',
          id: 'settings.security.gracePeriod',
          title: () => t('Lock'),
          key: 'appLockGrace',
          options: GRACE_PERIODS.map((value) => ({ value, label: GRACE_TITLES[value] })),
          when: (ctx) => ctx.authKind !== null && ctx.values.appLockEnabled,
        },
        {
          kind: 'toggle',
          id: 'settings.security.requireForKeys',
          title: (ctx) => t('Require %@ for SSH Keys', ctx.authKind ?? ''),
          key: 'appLockForKeys',
          requireAuth: true,
          when: (ctx) => ctx.authKind !== null,
        },
      ],
    },
    {
      id: 'general',
      title: () => t('General'),
      rows: [
        route('usage', () => t('Usage'), 'clock'),
        {
          kind: 'custom',
          id: 'settings.general.demoMode',
          title: () => t('Demo Mode'),
          component: 'demoMode',
        },
      ],
    },
    {
      id: 'help',
      title: () => t('Help'),
      footer: () =>
        t('Agentico is free and open source. If it helps you, a star on GitHub means a lot.'),
      rows: [
        {
          kind: 'info',
          id: 'settings.about.version',
          title: () => t('Version'),
          icon: 'info',
          value: (ctx) => ctx.version,
        },
        route('setupGuide', () => t('Setup Guide'), 'file'),
        {
          kind: 'external',
          id: 'settings.about.starOnGitHub',
          title: () => t('Star on GitHub'),
          url: REPOSITORY_URL,
        },
        {
          kind: 'page',
          id: 'settings.about.acknowledgements',
          title: () => t('Acknowledgements'),
          page: 'acknowledgements',
        },
      ],
    },
  ],
};

/** Seconds one confirmation covers SSH key use (the Swift `KeyAccessGate.reuseWindow`). */
export const KEY_REUSE_SECONDS = 30;
