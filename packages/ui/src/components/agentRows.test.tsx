import { act, fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { ThemeProvider } from '../theme/theme';
import {
  AgentCard,
  type AgentCardModel,
  AgentRowMenu,
  agentRowActions,
  FoldHeader,
  HostIssueRow,
  TerminalGroup,
  TerminalRow,
  WorkspaceCard,
} from './agentRows';

const agent: AgentCardModel = {
  title: 'Checkout',
  program: 'claude',
  status: 'blocked',
  blockedPrompt: 'Run the test?',
  subtitle: 'review',
  host: 'Build Server',
  path: '/w/store',
  diff: { added: 12, removed: 7 },
  contextLeft: '16 %',
};

describe('AgentCard', () => {
  it('shows the blocked prompt only when blocked, plus diff and context pill', async () => {
    await renderThemed(<AgentCard agent={agent} />);
    expect(screen.getByTestId('agent-card-prompt')).toBeTruthy();
    expect(screen.getByTestId('agent-card-diff')).toBeTruthy();
    expect(screen.getByTestId('agent-card-context')).toBeTruthy();
    expect(screen.getByTestId('status-pill-blocked')).toBeTruthy();
  });

  it('hides the prompt for a working agent and draws the orb', async () => {
    await renderThemed(<AgentCard agent={{ ...agent, status: 'working' }} />);
    expect(screen.queryByTestId('agent-card-prompt')).toBeNull();
    expect(screen.getByTestId('status-orb', { includeHiddenElements: true })).toBeTruthy();
  });

  it('presses open and exposes swipe and menu actions as accessibility actions', async () => {
    const onPress = jest.fn();
    const onPin = jest.fn();
    const onClose = jest.fn();
    const actions = agentRowActions({ onPin, onClose });
    await renderThemed(
      <AgentCard
        agent={agent}
        onPress={onPress}
        menu={actions.menu}
        leadingSwipeActions={actions.leading}
        swipeActions={actions.trailing}
      />,
    );
    const card = screen.getByRole('button');
    await fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(card.props.accessibilityActions.map((a: { name: string }) => a.name).sort()).toEqual([
      'close',
      'pin',
    ]);
    await fireEvent(card, 'accessibilityAction', { nativeEvent: { actionName: 'pin' } });
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it('long press opens the lifted menu and runs an item after it closes', async () => {
    jest.useFakeTimers();
    const onClose = jest.fn();
    const actions = agentRowActions({ onPin: jest.fn(), onClose });
    await renderThemed(<AgentCard agent={agent} menu={actions.menu} />);
    await fireEvent(screen.getByRole('button'), 'longPress');
    expect(
      screen.getByTestId('agent-row-menu-preview', { includeHiddenElements: true }),
    ).toBeTruthy();
    await fireEvent.press(
      screen.getByTestId('agent-row-menu-close', { includeHiddenElements: true }),
    );
    await act(async () => {
      jest.runAllTimers();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});

describe('agentRowActions', () => {
  it('puts the destructive action last and swaps Pin for Unpin', () => {
    const noop = () => {};
    const actions = agentRowActions({ pinned: true, onPin: noop, onDetails: noop, onClose: noop });
    expect(actions.menu.map((item) => item.key)).toEqual(['pin', 'details', 'close']);
    expect(actions.menu[2]?.destructive).toBe(true);
    expect(actions.menu[0]?.title).toBe('Unpin');
  });
});

describe('AgentRowMenu', () => {
  it('splits destructive rows below a divider (inline)', async () => {
    const actions = agentRowActions({ onPin: jest.fn(), onClose: jest.fn() });
    await renderThemed(
      <AgentRowMenu visible inline preview={null} items={actions.menu} onClose={() => {}} />,
    );
    expect(screen.getByTestId('agent-row-menu-pin')).toBeTruthy();
    expect(
      screen.getByTestId('agent-row-menu-close', { includeHiddenElements: true }),
    ).toBeTruthy();
  });
});

describe('FoldHeader', () => {
  it('toggles and reports its expanded state', async () => {
    const onToggle = jest.fn();
    await renderThemed(
      <FoldHeader kind="status" title="Needs you" count={1} onToggle={onToggle} />,
    );
    const header = screen.getByRole('header');
    expect(header.props.accessibilityState.expanded).toBe(true);
    await fireEvent.press(header);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('shows count pills only when a Host is collapsed', async () => {
    const pills = [{ status: 'working' as const, label: '2 working' }];
    const { rerender } = await renderThemed(
      <FoldHeader kind="host" title="Mac" collapsed pills={pills} onToggle={() => {}} />,
    );
    expect(screen.getByTestId('fold-pill-working')).toBeTruthy();
    await rerender(
      <ThemeProvider themeId="indigo">
        <FoldHeader kind="host" title="Mac" pills={pills} onToggle={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('fold-pill-working')).toBeNull();
  });

  it('footer fires See all', async () => {
    const onSeeAll = jest.fn();
    await renderThemed(<FoldHeader kind="footer" title="1 idle" onSeeAll={onSeeAll} />);
    await fireEvent.press(screen.getByRole('button'));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });
});

describe('WorkspaceCard', () => {
  it('hides its rows when collapsed and toggles from the chip', async () => {
    const onToggle = jest.fn();
    const ws = { title: 'iOS App', agentCount: 1 };
    const { rerender } = await renderThemed(
      <WorkspaceCard workspace={ws} onToggle={onToggle}>
        <AgentCard agent={agent} presentation="plain" />
      </WorkspaceCard>,
    );
    expect(screen.getByTestId('agent-card')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('workspace-card-fold'));
    expect(onToggle).toHaveBeenCalledTimes(1);
    await rerender(
      <ThemeProvider themeId="indigo">
        <WorkspaceCard workspace={{ ...ws, collapsed: true }} onToggle={onToggle}>
          <AgentCard agent={agent} presentation="plain" />
        </WorkspaceCard>
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('agent-card')).toBeNull();
  });
});

describe('TerminalRow', () => {
  it('opens a shell and the footer row creates a terminal', async () => {
    const onPress = jest.fn();
    const onNew = jest.fn();
    await renderThemed(
      <TerminalGroup onNewTerminal={onNew}>
        <TerminalRow terminal={{ title: 'landing', path: '~/x' }} onPress={onPress} />
      </TerminalGroup>,
    );
    await fireEvent.press(screen.getByTestId('terminal-row'));
    await fireEvent.press(screen.getByTestId('terminal-group-new'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});

describe('HostIssueRow', () => {
  const issue = (hostName: string) => ({ hostName, kind: 'offline' as const });
  it('stacks one line per Host up to two, and collapses three to a summary', async () => {
    const { rerender } = await renderThemed(<HostIssueRow issues={[issue('A'), issue('B')]} />);
    expect(screen.getByTestId('host-issue-row-A')).toBeTruthy();
    expect(screen.getByTestId('host-issue-row-B')).toBeTruthy();
    await rerender(
      <ThemeProvider themeId="indigo">
        <HostIssueRow issues={[issue('A'), issue('B'), issue('C')]} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('host-issue-row-summary')).toBeTruthy();
    expect(screen.queryByTestId('host-issue-row-A')).toBeNull();
  });

  it('renders nothing without issues and opens the Host on press', async () => {
    const onOpen = jest.fn();
    const { rerender } = await renderThemed(<HostIssueRow issues={[]} />);
    expect(screen.queryByTestId('host-issue-row')).toBeNull();
    await rerender(
      <ThemeProvider themeId="indigo">
        <HostIssueRow issues={[issue('A')]} onOpen={onOpen} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('host-issue-row-A'));
    expect(onOpen).toHaveBeenCalledWith(issue('A'));
  });
});
