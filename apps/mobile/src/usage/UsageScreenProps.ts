import type { AccountFileStore, UsageSource } from '@openagentspocket/core';

/** What the Usage screen takes besides the route: a source and files for tests and the atlas. */
export interface UsageScreenProps {
  source?: UsageSource;
  files?: AccountFileStore;
  /** Atlas and tests: open a sheet on mount. */
  initial?: {
    quick?: boolean;
    accounts?: boolean;
    menu?: boolean;
    host?: string;
    day?: 'latest';
    /** Open with the device's Claude Code limits switch off. */
    limitsOff?: boolean;
    /** Open the Accounts sheet with this Account being renamed or its removal being asked. */
    rename?: string;
    remove?: string;
  };
  /** Force the wide (Host column) layout or the phone one; by default the window width decides. */
  wide?: boolean;
}
