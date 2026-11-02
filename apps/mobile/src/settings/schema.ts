import type { SettingKey, SettingsValues } from '@openagentspocket/core';
import type { IconName } from '@openagentspocket/ui';

/** What a row may read to show a value or decide to appear. */
export interface SettingsContext {
  values: Readonly<SettingsValues>;
  /** "Face ID", "Touch ID" or "Passcode" when the device can authenticate; null otherwise. */
  authKind: string | null;
  version: string;
  themeName: string;
}

type Text = (ctx: SettingsContext) => string;
type BoolKey = { [K in SettingKey]: SettingsValues[K] extends boolean ? K : never }[SettingKey];
type NumberKey = { [K in SettingKey]: SettingsValues[K] extends number ? K : never }[SettingKey];
type ChoiceKey = { [K in SettingKey]: SettingsValues[K] extends string ? K : never }[SettingKey];

interface RowBase {
  id: string;
  title: Text;
  subtitle?: Text;
  icon?: IconName;
  /** Hides the row (and an emptied section) when false. */
  when?: (ctx: SettingsContext) => boolean;
}

export type SettingsRow =
  | (RowBase & { kind: 'page'; page: string; value?: (ctx: SettingsContext) => string | undefined })
  /** Opens another screen of the app. `route` stays null until that screen exists. */
  | (RowBase & { kind: 'route'; route: string | null })
  | (RowBase & { kind: 'external'; url: string })
  | (RowBase & { kind: 'info'; value: (ctx: SettingsContext) => string })
  | (RowBase & { kind: 'toggle'; key: BoolKey; requireAuth?: boolean })
  | (RowBase & {
      kind: 'picker';
      key: ChoiceKey;
      options: readonly { value: string; label: Text }[];
    })
  | (RowBase & {
      kind: 'stepper';
      key: NumberKey;
      min: number;
      max: number;
      format?: (value: number) => string;
    })
  | (RowBase & { kind: 'reset'; keys: readonly SettingKey[] })
  /** A bespoke block (theme cards, cache size, licenses) the renderer looks up by name. */
  | (RowBase & { kind: 'custom'; component: CustomComponent });

export type CustomComponent =
  | 'themeCards'
  | 'chatSample'
  | 'chatCache'
  | 'acknowledgements'
  | 'demoMode';

export interface SettingsSection {
  id: string;
  title?: Text;
  footer?: (ctx: SettingsContext) => string | undefined;
  rows: readonly SettingsRow[];
}

export interface SettingsPage {
  id: string;
  title: Text;
  sections: readonly SettingsSection[];
}

export { SETTINGS_PAGES } from './pages';
