import type { DirectoryLister } from '@openagentspocket/core';
import { setLocale, translate } from '@openagentspocket/i18n';
import { OverlayHost, ThemeProvider } from '@openagentspocket/ui';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { DirectoryBrowserSheet } from './DirectoryBrowserSheet';
import { createDemoServices } from './demo';
import { NewAgentScreen } from './NewAgentScreen';
import { NewTerminalScreen } from './NewTerminalScreen';
import { type NewAgentServices, NewAgentServicesProvider } from './services';
import { WorktreeDetailsScreen } from './WorktreeDetailsScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

const label = (key: string) => translate('en', 'app', key);

function renderApp(ui: ReactElement, services?: NewAgentServices) {
  const tree = (
    <ThemeProvider themeId="indigo">
      <OverlayHost />
      {ui}
    </ThemeProvider>
  );
  return render(
    services ? (
      <NewAgentServicesProvider services={services}>{tree}</NewAgentServicesProvider>
    ) : (
      tree
    ),
  );
}

afterEach(async () => {
  await cleanup();
  setLocale('en');
});

describe('NewAgentScreen', () => {
  it('detects the Agents, starts the picked one and reports the Agent it started', async () => {
    const services = createDemoServices();
    const onStarted = jest.fn();
    await renderApp(<NewAgentScreen onStarted={onStarted} onCancel={jest.fn()} />, services);
    await waitFor(() => expect(screen.getByTestId('new-agent-kind-claude')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('new-agent-kind-codex'));
    await waitFor(() =>
      expect(screen.getByTestId('new-agent-start').props.accessibilityState?.disabled).toBeFalsy(),
    );
    await fireEvent.press(screen.getByTestId('new-agent-start'));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('demo', 'p9'));
    expect(
      services.environment instanceof Object && 'starts' in services.environment
        ? services.environment.starts
        : [],
    ).toMatchObject([{ request: { kind: 'codex' }, destination: { kind: 'existingWorkspace' } }]);
  });

  it('keeps Start off while the branch of a new worktree breaks a rule', async () => {
    await renderApp(<NewAgentScreen onStarted={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('new-agent-kind-claude')).toBeTruthy());
    await fireEvent(screen.getByTestId('new-agent-worktree'), 'valueChange', true);
    await fireEvent.changeText(await screen.findByTestId('new-agent-branch'), 'a..b');
    expect(screen.getByTestId('new-agent-start').props.accessibilityState?.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('new-agent-branch'), 'feat/ok');
    expect(screen.getByTestId('new-agent-start').props.accessibilityState?.disabled).toBeFalsy();
  });

  it('an unparseable argument string explains itself and blocks Start', async () => {
    await renderApp(<NewAgentScreen onStarted={jest.fn()} onCancel={jest.fn()} />);
    await waitFor(() => expect(screen.getByTestId('new-agent-kind-claude')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('new-agent-arguments'), '"open');
    expect(screen.getByText(label('Arguments contain an unclosed double quote.'))).toBeTruthy();
    expect(screen.getByTestId('new-agent-start').props.accessibilityState?.disabled).toBe(true);
  });

  it('offers a recent directory and fills the New Workspace draft', async () => {
    await renderApp(<NewAgentScreen onStarted={jest.fn()} onCancel={jest.fn()} />);
    await fireEvent.press(await screen.findByTestId('new-agent-workspace'));
    await fireEvent.press(
      await screen.findByTestId('new-agent-workspace-menu-recent:/home/demo/projects/api-server'),
    );
    expect(await screen.findByTestId('new-agent-workspace-label')).toBeTruthy();
    expect(screen.getByText('/home/demo/projects/api-server')).toBeTruthy();
  });

  it('from an Agent it shows the inherited directory and no Host or workspace choice', async () => {
    await renderApp(
      <NewAgentScreen
        origin={{ hostId: 'demo', workspaceId: 'w0', cwd: '/home/demo/projects/api-server' }}
        onStarted={jest.fn()}
        onCancel={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('new-agent-origin')).toBeTruthy();
    expect(screen.queryByTestId('new-agent-workspace')).toBeNull();
    expect(screen.queryByTestId('new-agent-worktree')).toBeNull();
  });
});

describe('DirectoryBrowserSheet', () => {
  const lister: DirectoryLister = {
    resolveHome: async () => '/home/you',
    list: async (path) => ({
      directories: path === '/home/you' ? ['alpha', 'beta'] : ['inner'],
      symbolicLinks: new Set(path === '/home/you' ? ['beta'] : []),
      truncated: false,
    }),
  };

  it('lists the home folders, filters, enters one and selects it', async () => {
    const onSelect = jest.fn();
    await renderApp(
      <DirectoryBrowserSheet visible lister={lister} onSelect={onSelect} onClose={jest.fn()} />,
    );
    await waitFor(() => expect(screen.getByTestId('directory-alpha')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('directory-filter'), 'bet');
    expect(screen.queryByTestId('directory-alpha')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('directory-filter'), '');
    await fireEvent.press(screen.getByTestId('directory-alpha'));
    await waitFor(() => expect(screen.getByTestId('directory-inner')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('directory-select'));
    expect(onSelect).toHaveBeenCalledWith('/home/you/alpha');
  });

  it('shows a failed listing with a way to try again', async () => {
    let fail = true;
    const flaky: DirectoryLister = {
      resolveHome: async () => '/home/you',
      list: async () => {
        if (fail) throw new Error('down');
        return { directories: ['ok'], symbolicLinks: new Set(), truncated: false };
      },
    };
    await renderApp(
      <DirectoryBrowserSheet visible lister={flaky} onSelect={jest.fn()} onClose={jest.fn()} />,
    );
    expect(await screen.findByTestId('directory-error')).toBeTruthy();
    fail = false;
    await fireEvent.press(screen.getByText(label('Try Again')));
    await waitFor(() => expect(screen.getByTestId('directory-ok')).toBeTruthy());
  });
});

describe('WorktreeDetailsScreen', () => {
  it('confirms before removing and reports the removal', async () => {
    const options = createDemoServices().worktreeDetail('demo', 'p4');
    if (!options) throw new Error('no demo worktree');
    const onRemoved = jest.fn();
    await renderApp(
      <WorktreeDetailsScreen options={options} onRemoved={onRemoved} onDone={jest.fn()} />,
    );
    await waitFor(() => expect(screen.getByText('worktree/settings')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('worktree-remove'));
    await fireEvent.press(await screen.findByTestId('alert-action-confirm'));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
  });

  it('cancelling the confirmation removes nothing', async () => {
    const options = createDemoServices().worktreeDetail('demo', 'p4');
    if (!options) throw new Error('no demo worktree');
    const remove = jest.fn(options.remove);
    await renderApp(
      <WorktreeDetailsScreen
        options={{ ...options, remove }}
        onRemoved={jest.fn()}
        onDone={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('worktree-remove'));
    await fireEvent.press(await screen.findByTestId('alert-cancel'));
    expect(remove).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByTestId('worktree-remove').props.accessibilityState?.disabled).toBeFalsy(),
    );
  });
});

describe('NewTerminalScreen', () => {
  it('opens a shell in the first Workspace of the only Host with the typed tab name', async () => {
    const onOpen = jest.fn();
    await renderApp(<NewTerminalScreen onOpen={onOpen} onCancel={jest.fn()} />);
    await fireEvent.changeText(screen.getByTestId('new-terminal-tab'), ' logs ');
    await fireEvent.press(screen.getByTestId('new-terminal-open'));
    expect(onOpen).toHaveBeenCalledWith({
      hostId: 'demo',
      workspaceId: 'w0',
      cwd: '/home/demo/projects/api-server',
      label: 'logs',
    });
  });
});
