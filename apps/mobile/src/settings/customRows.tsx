import { AcknowledgementsList } from './AcknowledgementsList';
import { ChatCacheRows } from './ChatCacheRows';
import { ChatSample } from './ChatSample';
import { DemoModeRow } from './DemoModeRow';
import type { SettingsContext, SettingsRow } from './schema';
import { ThemeCards } from './ThemeCards';

type CustomSettingsRow = Extract<SettingsRow, { kind: 'custom' }>;

/** The bespoke blocks a schema `custom` row names. */
export function CustomRow({ row, ctx }: { row: CustomSettingsRow; ctx: SettingsContext }) {
  switch (row.component) {
    case 'themeCards':
      return <ThemeCards ctx={ctx} />;
    case 'chatSample':
      return <ChatSample ctx={ctx} />;
    case 'chatCache':
      return <ChatCacheRows />;
    case 'acknowledgements':
      return <AcknowledgementsList />;
    case 'demoMode':
      return <DemoModeRow />;
  }
}
