import type { Status } from '../theme/status';

/** The Agents view: what Home's inbox groups by, over this Host's items. */
export const AGENT_SECTIONS: readonly {
  key: 'needsYou' | 'working' | 'done' | 'idle' | 'shells';
  pick: (item: DrawerItem) => boolean;
}[] = [
  { key: 'needsYou', pick: (i) => i.kind === 'agent' && i.status === 'blocked' },
  { key: 'working', pick: (i) => i.kind === 'agent' && i.status === 'working' },
  { key: 'done', pick: (i) => i.kind === 'agent' && i.status === 'done' },
  {
    key: 'idle',
    pick: (i) => i.kind === 'agent' && (i.status === 'idle' || i.status === undefined),
  },
  { key: 'shells', pick: (i) => i.kind === 'shell' },
];

export interface DrawerItem {
  id: string;
  kind: 'agent' | 'shell';
  title: string;
  /** Required for an agent (draws its mark). */
  program?: string;
  /** "7m". */
  age?: string;
  status?: Status;
}

export interface DrawerWorkspace {
  id: string;
  title: string;
  branch?: string;
  items: readonly DrawerItem[];
}
