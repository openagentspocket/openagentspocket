/** Every string the agent bar components draw; screens pass translations (the i18n layer owns the catalogs). */
export interface AgentBarLabels {
  sidebar: string;
  more: string;
  switcher: string;
  search: string;
  searchPlaceholder: string;
  workspaces: string;
  newItem: string;
  closeSkills: string;
  skills: string;
  /** The `/` panel's heading over the program's own commands. */
  commands: string;
  messagePlaceholder: string;
  send: string;
  stop: string;
  dictate: string;
  stopDictating: string;
  add: string;
  moreOptions: string;
  shortcuts: string;
  working: string;
  idle: string;
  blocked: string;
  done: string;
  contextLeft: (percent: number) => string;
  worktree: string;
  possiblyIncomplete: (readAt: string) => string;
  changes: string;
  openChanges: string;
  dismissKeyboard: string;
  needsYou: string;
  shells: string;
  toolbar: string;
  home: string;
}

/** English defaults, the Swift app's wording. */
export const defaultAgentBarLabels: AgentBarLabels = {
  sidebar: 'Sessions',
  more: 'More',
  switcher: 'Agents',
  search: 'Search',
  searchPlaceholder: 'Workspaces, tabs, panes',
  workspaces: 'Workspaces',
  newItem: 'New',
  closeSkills: 'Close skills',
  skills: 'Skills',
  commands: 'Commands',
  messagePlaceholder: 'Message Agent',
  send: 'Send',
  stop: 'Stop',
  dictate: 'Dictate',
  stopDictating: 'Stop Dictating',
  add: 'Add',
  moreOptions: 'More options',
  shortcuts: 'Shortcuts',
  working: 'Working',
  idle: 'Idle',
  blocked: 'Blocked',
  done: 'Done',
  contextLeft: (percent) => `${percent} % context left`,
  worktree: 'Worktree',
  possiblyIncomplete: (readAt) => `Possibly incomplete · Read at ${readAt}`,
  changes: 'Changes',
  openChanges: 'Open Changes',
  dismissKeyboard: 'Dismiss keyboard',
  needsYou: 'Needs you',
  shells: 'Shells',
  toolbar: 'Toolbar',
  home: 'Home',
};
