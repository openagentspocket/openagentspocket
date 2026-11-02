import { describe, expect, it } from 'vitest';
import { agentDisplayName, agentKindLabel, agentTitle, stripTitleGlyphs } from './agent-fields';
import {
  type ConsoleRow,
  displayPath,
  matchesAgentSearch,
  rowDirectory,
  showsTabLabel,
  withPaneDirectory,
  workspaceContext,
} from './row';
import { agentInfo } from './testing';

const base = (over: Partial<ConsoleRow> = {}): ConsoleRow => ({
  hostId: 'h',
  hostName: 'devbox',
  hostUsername: 'root',
  agent: agentInfo('w1:p1', 'working', { cwd: '/root/proj' }),
  workspaceTabCount: 1,
  tabPaneCount: 1,
  ...over,
});

describe('agent fields', () => {
  it('strips leading spinner glyphs and the whitespace around them', () => {
    expect(stripTitleGlyphs('⠋ Thinking')).toBe('Thinking');
    expect(stripTitleGlyphs('✻  ◐ Task')).toBe('Task');
    expect(stripTitleGlyphs('Plain')).toBe('Plain');
    expect(stripTitleGlyphs('⠋')).toBe('');
  });

  it('names an Agent by display name, then name, then kind', () => {
    expect(agentDisplayName(agentInfo('p', 'idle', { display_agent: 'Fancy', name: 'n' }))).toBe(
      'Fancy',
    );
    expect(agentDisplayName(agentInfo('p', 'idle', { display_agent: '', name: 'n' }))).toBe('n');
    expect(agentDisplayName(agentInfo('p', 'idle', { agent: undefined }))).toBe('unknown');
  });

  it('reads the legacy title from the stripped, else the raw terminal title', () => {
    expect(
      agentTitle(
        agentInfo('p', 'idle', { terminal_title_stripped: undefined, terminal_title: '◑ Task' }),
      ),
    ).toBe('Task');
  });

  it('labels programs as notifications do and leaves unknown kinds alone', () => {
    expect(agentKindLabel('claude')).toBe('Claude');
    expect(agentKindLabel('GEMINI')).toBe('Gemini CLI');
    expect(agentKindLabel('brand-new')).toBe('brand-new');
    expect(agentKindLabel('')).toBe('Unknown');
  });
});

describe('row helpers', () => {
  it('hides a tab label that only repeats the tab position in a single-tab workspace', () => {
    expect(showsTabLabel(base({ tabLabel: '1', tabPosition: 1 }))).toBe(false);
    expect(showsTabLabel(base({ tabLabel: '2', tabPosition: 1 }))).toBe(true);
    expect(showsTabLabel(base({ tabLabel: '1', tabPosition: 1, workspaceTabCount: 2 }))).toBe(true);
    expect(showsTabLabel(base({}))).toBe(false);
  });

  it('prefers the live pane directory, then foreground cwd, cwd, checkout', () => {
    expect(rowDirectory(base({ paneDirectory: '/live' }))).toBe('/live');
    const agent = agentInfo('p', 'idle', { foreground_cwd: '/fg', cwd: '/cwd' });
    expect(rowDirectory(base({ agent }))).toBe('/fg');
    const bare = agentInfo('p', 'idle', { cwd: '' });
    const checkout = {
      repoKey: 'k',
      repoName: 'r',
      repoRoot: '/r',
      checkoutPath: '/r/c',
      isLinkedWorktree: true,
    };
    expect(rowDirectory(base({ agent: bare, checkout }))).toBe('/r/c');
  });

  it('adopts a pane directory only for the pane that is this Agent', () => {
    const row = base();
    const pane = {
      agent_status: 'working' as const,
      focused: false,
      pane_id: 'w1:p1',
      revision: 1,
      tab_id: row.agent.tab_id,
      terminal_id: row.agent.terminal_id,
      workspace_id: row.agent.workspace_id,
      cwd: '/new',
    };
    expect(withPaneDirectory(row, pane).paneDirectory).toBe('/new');
    expect(withPaneDirectory(row, { ...pane, terminal_id: 'other' })).toBe(row);
  });

  it('joins workspace and repo, collapsing equal names', () => {
    const checkout = {
      repoKey: 'k',
      repoName: 'proj',
      repoRoot: '/r',
      checkoutPath: '/r',
      isLinkedWorktree: false,
    };
    expect(workspaceContext(base())).toBeUndefined();
    expect(workspaceContext(base({ workspaceLabel: 'Api' }))).toBe('Api');
    expect(workspaceContext(base({ checkout }))).toBe('proj');
    expect(workspaceContext(base({ workspaceLabel: 'Api', checkout }))).toBe('Api · proj');
    expect(workspaceContext(base({ workspaceLabel: 'proj', checkout }))).toBe('proj');
  });

  it('folds the Host user home to ~', () => {
    expect(displayPath(base(), '/root')).toBe('~');
    expect(displayPath(base(), '/root/x/y')).toBe('~/x/y');
    expect(displayPath(base(), '/rooty')).toBe('/rooty');
    expect(displayPath(base({ hostUsername: 'ana' }), '/Users/ana/code')).toBe('~/code');
    expect(displayPath(base({ hostUsername: 'ana' }), '/home/ana')).toBe('~');
    expect(displayPath(base({ hostUsername: undefined }), '/root/x')).toBe('/root/x');
  });

  it('matches a search case-insensitively over the shown fields and blank matches all', () => {
    const row = base({ workspaceLabel: 'Billing API', tabLabel: 'Shell' });
    expect(matchesAgentSearch(row, '  billing ')).toBe(true);
    expect(matchesAgentSearch(row, 'DEVBOX')).toBe(true);
    expect(matchesAgentSearch(row, '/root/proj')).toBe(true);
    expect(matchesAgentSearch(row, 'nothing here')).toBe(false);
    expect(matchesAgentSearch(row, '   ')).toBe(true);
  });
});
