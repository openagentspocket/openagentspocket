import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { renderThemed } from '../test-utils';
import { ThemeProvider } from '../theme/theme';
import {
  AgentHeader,
  ChangeRow,
  ChangeSection,
  ComposerCard,
  SessionDrawer,
  StatusLine,
} from './agentBar';

const rerenderThemed = (rerender: (ui: ReactElement) => Promise<void>, ui: ReactElement) =>
  rerender(<ThemeProvider themeId="indigo">{ui}</ThemeProvider>);

describe('AgentHeader', () => {
  it('opens the drawer from the left circle', async () => {
    const onSidebar = jest.fn();
    await renderThemed(<AgentHeader onSidebar={onSidebar} menu={[]} />);
    await fireEvent.press(screen.getByTestId('agent-header-sidebar'));
    expect(onSidebar).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('agent-header-right')).toBeTruthy();
  });

  it('draws the mid-bar identity only when given', async () => {
    await renderThemed(
      <AgentHeader onSidebar={jest.fn()} menu={[]} eyebrow="Mac" title="Review" subtitle="web" />,
    );
    expect(screen.getByText('MAC')).toBeTruthy();
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('web')).toBeTruthy();
  });
});

describe('AgentHeader line and title', () => {
  it('opens Changes from the git line, and only from there', async () => {
    const onOpenChanges = jest.fn();
    await renderThemed(
      <AgentHeader
        onSidebar={jest.fn()}
        menu={[]}
        title="Review"
        branch="main"
        diff={{ added: 2, removed: 1 }}
        onOpenChanges={onOpenChanges}
      />,
    );
    expect(screen.getByText('main')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('agent-header-git'));
    expect(onOpenChanges).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('agent-header-title')).toBeNull();
  });

  it('draws no git line without git, and the link note on its own', async () => {
    await renderThemed(<AgentHeader onSidebar={jest.fn()} menu={[]} note="850 ms" />);
    expect(screen.queryByTestId('agent-header-git')).toBeNull();
    expect(screen.getByTestId('agent-header-note')).toBeTruthy();
  });

  it('opens the Agents menu from the title', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <AgentHeader
        onSidebar={jest.fn()}
        menu={[]}
        title="Review"
        titleMenu={[{ key: 'other', title: 'Docs', subtitle: 'Blocked', onPress }]}
      />,
    );
    expect(screen.queryByTestId('agent-header-agents-other')).toBeNull();
    await fireEvent.press(screen.getByTestId('agent-header-title'));
    await fireEvent.press(screen.getByTestId('agent-header-agents-other'));
    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
  });

  it('marks the Sessions button only when asked, and says so to a screen reader', async () => {
    const header = (dot: boolean) => (
      <AgentHeader onSidebar={jest.fn()} menu={[]} sidebarDot={dot} onHome={jest.fn()} />
    );
    const { rerender } = await renderThemed(header(false));
    expect(screen.queryByTestId('agent-header-sidebar-dot')).toBeNull();
    const quiet = screen.getByTestId('agent-header-sidebar').props.accessibilityLabel;
    await rerenderThemed(rerender, header(true));
    expect(screen.getByTestId('agent-header-sidebar-dot')).toBeTruthy();
    expect(screen.getByTestId('agent-header-sidebar').props.accessibilityLabel).not.toBe(quiet);
  });
});

describe('SessionDrawer', () => {
  const workspaces = [
    {
      id: 'w1',
      title: 'iOS App',
      branch: 'polish',
      items: [
        { id: 'x', kind: 'shell', title: 'landing' },
        {
          id: 'y',
          kind: 'agent',
          program: 'codex',
          title: 'ios-polish',
          age: '7m',
          status: 'working',
        },
      ],
    },
    { id: 'w2', title: 'Docs', items: [{ id: 'z', kind: 'shell', title: 'notes' }] },
  ] as const;
  const host = { name: 'Mac', summary: '1 Agent' };

  it('switches on tap, folds a workspace and filters by search', async () => {
    const onSelect = jest.fn();
    await renderThemed(
      <SessionDrawer host={host} workspaces={workspaces} selectedId="y" onSelect={onSelect} />,
    );
    await fireEvent.press(screen.getByTestId('session-drawer-row-x'));
    expect(onSelect).toHaveBeenCalledWith('x');
    expect(screen.getByTestId('session-drawer-row-y').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('session-drawer-fold-w1'));
    expect(screen.queryByTestId('session-drawer-row-x')).toBeNull();
    await fireEvent.press(screen.getByTestId('session-drawer-fold-w1'));
    await fireEvent.changeText(screen.getByTestId('session-drawer-search'), 'notes');
    expect(screen.queryByTestId('session-drawer-fold-w1')).toBeNull();
    expect(screen.getByTestId('session-drawer-row-z')).toBeTruthy();
  });

  it('closes from the scrim when modal', async () => {
    const onClose = jest.fn();
    await renderThemed(
      <SessionDrawer host={host} workspaces={workspaces} onSelect={jest.fn()} onClose={onClose} />,
    );
    await fireEvent.press(screen.getByTestId('session-drawer-scrim'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('ComposerCard', () => {
  it('sends with an empty input when an attachment stands, in place of Stop', async () => {
    const onSend = jest.fn();
    await renderThemed(
      <ComposerCard
        value=""
        working
        hasAttachments
        onChange={jest.fn()}
        onSend={onSend}
        onStop={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('composer-card-stop')).toBeNull();
    await fireEvent.press(screen.getByTestId('composer-card-send'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables send when empty, sends a draft and stops while working', async () => {
    const onSend = jest.fn();
    const onStop = jest.fn();
    const { rerender } = await renderThemed(
      <ComposerCard value="" onChange={jest.fn()} onSend={onSend} />,
    );
    expect(screen.getByTestId('composer-card-send').props.accessibilityState.disabled).toBe(true);
    await rerenderThemed(
      rerender,
      <ComposerCard value="hi" onChange={jest.fn()} onSend={onSend} />,
    );
    await fireEvent.press(screen.getByTestId('composer-card-send'));
    expect(onSend).toHaveBeenCalledTimes(1);
    await rerenderThemed(
      rerender,
      <ComposerCard value="" working onChange={jest.fn()} onSend={onSend} onStop={onStop} />,
    );
    await fireEvent.press(screen.getByTestId('composer-card-stop'));
    expect(onStop).toHaveBeenCalled();
  });

  it('stacks into a button row with more, and shows skills for a slash', async () => {
    const onSkill = jest.fn();
    await renderThemed(
      <ComposerCard
        value="/"
        onChange={jest.fn()}
        onSend={jest.fn()}
        moreMenu={[{ key: 'p', title: 'Paste', onPress: jest.fn() }]}
        skills={[{ name: '/code-review', description: 'Review' }]}
        onSkill={onSkill}
      />,
    );
    expect(screen.getByTestId('composer-card-more')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('composer-card-skill-/code-review'));
    expect(onSkill).toHaveBeenCalledWith('/code-review');
    await fireEvent.press(screen.getByTestId('composer-card-skills-close'));
    expect(screen.queryByTestId('composer-card-skills')).toBeNull();
  });
});

describe('ComposerCard layouts', () => {
  it('keeps the same input from one line to stacked, so the keyboard stays up', async () => {
    const { rerender } = await renderThemed(
      <ComposerCard value="" onChange={jest.fn()} onSend={jest.fn()} />,
    );
    const input = screen.getByTestId('composer-card-input');
    await rerenderThemed(
      rerender,
      <ComposerCard value="" expanded onChange={jest.fn()} onSend={jest.fn()} />,
    );
    expect(screen.getByTestId('composer-card-input')).toBe(input);
  });

  it('stays stacked under an open "..." menu, so losing focus cannot take the menu away', async () => {
    const onPress = jest.fn();
    const card = (expanded?: boolean) => (
      <ComposerCard
        value=""
        onChange={jest.fn()}
        onSend={jest.fn()}
        moreMenu={[{ key: 'p', title: 'Paste', onPress }]}
        expanded={expanded}
      />
    );
    const { rerender } = await renderThemed(card(true));
    await fireEvent.press(screen.getByTestId('composer-card-more'));
    await waitFor(() => expect(screen.getByTestId('action-menu-p')).toBeTruthy());
    // The menu's Modal takes the first responder: the input blurs and the caller stops expanding.
    await rerenderThemed(rerender, card(undefined));
    expect(screen.getByTestId('action-menu-p')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('action-menu-p'));
    await waitFor(() => expect(onPress).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId('composer-card-more')).toBeNull());
  });

  it('shows the toolbar toggle and "..." only once stacked', async () => {
    const more = [{ key: 'p', title: 'Paste', onPress: jest.fn() }];
    const barToggle = { visible: false, onToggle: jest.fn(), label: 'Toolbar' };
    const card = (expanded?: boolean) => (
      <ComposerCard
        value=""
        onChange={jest.fn()}
        onSend={jest.fn()}
        moreMenu={more}
        barToggle={barToggle}
        expanded={expanded}
      />
    );
    const { rerender } = await renderThemed(card());
    expect(screen.queryByTestId('composer-card-more')).toBeNull();
    expect(screen.queryByTestId('composer-card-bar-toggle')).toBeNull();
    await rerenderThemed(rerender, card(true));
    expect(screen.getByTestId('composer-card-more')).toBeTruthy();
    expect(screen.getByTestId('composer-card-bar-toggle')).toBeTruthy();
  });
});

describe('StatusLine', () => {
  it('is hidden with no data and opens Changes on tap', async () => {
    const { rerender } = await renderThemed(<StatusLine />);
    expect(screen.queryByTestId('status-line')).toBeNull();
    const onOpen = jest.fn();
    await rerenderThemed(
      rerender,
      <StatusLine
        status="working"
        branch="main"
        diff={{ added: 2, removed: 1 }}
        onOpenChanges={onOpen}
      />,
    );
    await fireEvent.press(screen.getByTestId('status-line'));
    expect(onOpen).toHaveBeenCalled();
  });

  it('counts behind, ahead, conflicted, staged, modified and untracked in Tide order', async () => {
    await renderThemed(
      <StatusLine
        branch="main"
        counts={{ behind: 1, ahead: 3, conflicts: 1, staged: 2, changed: 4, untracked: 5 }}
      />,
    );
    expect(screen.getByText('↓1 ↑3 ~1 +2 !4 ?5')).toBeTruthy();
  });

  it('shows the context pill only when low', async () => {
    const { rerender } = await renderThemed(<StatusLine status="idle" contextLeft={16} />);
    expect(screen.getByText(/16/)).toBeTruthy();
    await rerenderThemed(rerender, <StatusLine status="idle" contextLeft={60} />);
    expect(screen.queryByText(/60/)).toBeNull();
  });
});

describe('ChangeRow', () => {
  it('presses a file row and a summary card, counting rows in a section', async () => {
    const onFile = jest.fn();
    const onSummary = jest.fn();
    await renderThemed(
      <>
        <ChangeRow
          summary={{
            repo: 'repo',
            worktree: true,
            added: 1,
            removed: 0,
            possiblyIncompleteAt: '00:18',
          }}
          onPress={onSummary}
          testID="sum"
        />
        <ChangeSection title="Changes" count={1}>
          <ChangeRow
            file={{ name: 'a.swift', added: 1, removed: 1, kind: 'M' }}
            onPress={onFile}
            testID="f"
          />
        </ChangeSection>
      </>,
    );
    await fireEvent.press(screen.getByTestId('f'));
    await fireEvent.press(screen.getByTestId('sum'));
    expect(onFile).toHaveBeenCalled();
    expect(onSummary).toHaveBeenCalled();
    expect(screen.getByText('CHANGES')).toBeTruthy();
  });
});
