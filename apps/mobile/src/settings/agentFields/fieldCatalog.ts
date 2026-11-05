import { t } from '@openagentspocket/i18n';

export interface FieldDef {
  id: string;
  describe: () => string;
}

/** The fields herdr's sidebar defines. */
export const HERDR_FIELDS: readonly FieldDef[] = [
  {
    id: 'state_text',
    describe: () => t('Status text. Shown in the status column, not as a field in this row.'),
  },
  { id: 'tab', describe: () => t('Tab title') },
  { id: 'pane', describe: () => t('Pane title') },
  { id: 'agent', describe: () => t('Agent name') },
  { id: 'terminal_title', describe: () => t('Current terminal window title') },
  { id: 'terminal_title_stripped', describe: () => t('Terminal title without the Agent prefix') },
];

/** The fields only the app knows. */
export const APP_FIELDS: readonly FieldDef[] = [
  { id: 'host', describe: () => t('Host name') },
  { id: 'status', describe: () => t('Agent Status as text') },
  { id: 'directory', describe: () => t('Working directory') },
];

export interface FieldRow {
  id: string;
  fields: readonly string[];
}

/** What a Host with no saved choice shows: herdr's rows, then the app's own third row. */
export const DEFAULT_ROWS: readonly FieldRow[] = [
  { id: 'row1', fields: ['workspace'] },
  { id: 'row2', fields: ['terminal_title_stripped'] },
  { id: 'row3', fields: ['directory'] },
];
