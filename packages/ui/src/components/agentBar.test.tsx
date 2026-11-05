import { fireEvent, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { renderThemed } from '../test-utils';
import { ThemeProvider } from '../theme/theme';
import {
  AgentHeader,
  AgentSwitcher,
  ChangeRow,
  ChangeSection,
  ComposerCard,
  SessionDrawer,
  StatusLine,
} from './agentBar';

const rerenderThemed = (rerender: (ui: ReactElement) => Promise<void>, ui: ReactElement) =>
  rerender(<ThemeProvider themeId="indigo">{ui}</ThemeProvider>);

const agents = [
  { id: 'a', title: 'iOS App', program: 'codex', status: 'working' },
  { id: 'b', title: 'Docs', program: 'claude', status: 'idle' },
] as const;

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

describe('AgentSwitcher', () => {
  it('selects a neighbour, ignores the current one, and presses trailing toggles', async () => {
    const onSelect = jest.fn();
    const toggle = jest.fn();
    await renderThemed(
      <AgentSwitcher
        agents={agents}
        currentId="b"
        onSelect={onSelect}
        trailing={[{ key: 'kbd', icon: 'keyboard', label: 'Keyboard', onPress: toggle }]}
      />,
    );
    await fireEvent.press(screen.getByTestId('agent-switcher-b'));
    expect(onSelect).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('agent-switcher-a'));
    expect(onSelect).toHaveBeenCalledWith('a');
    await fireEvent.press(screen.getByTestId('agent-switcher-kbd'));
    expect(toggle).toHaveBeenCalled();
    expect(screen.getByTestId('agent-switcher-b').props.accessibilityState.selected).toBe(true);
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
