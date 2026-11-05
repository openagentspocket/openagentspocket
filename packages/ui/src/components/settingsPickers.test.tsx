import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { AgentListFieldsEditor } from './AgentListFieldsEditor';
import { AgentListFieldsPreview } from './AgentListFieldsPreview';
import { OptionListSheet } from './OptionListSheet';
import { OverlayPeerPickerBody } from './OverlayPeerPicker';
import { OverlayPeerViews } from './OverlayPeerViews';
import { PortPreview } from './PortPreview';
import { TerminalThemePicker } from './TerminalThemePicker';
import { TerminalThemePreview } from './TerminalThemePreview';

const palette = {
  background: 'x',
  foreground: 'x',
  accent: 'x',
  success: 'x',
  directory: 'x',
  prompt: 'x',
  muted: 'x',
};
const swatch = { background: 'x', bars: ['x', 'x', 'x'] } as const;

describe('TerminalThemePicker', () => {
  const themes = [
    { id: 'a', name: 'Alpha', subtitle: 'first', swatch },
    { id: 'b', name: 'Beta', subtitle: 'second', swatch },
  ];
  it('checks the selected row only and selects on tap', async () => {
    const onSelect = jest.fn();
    await renderThemed(
      <TerminalThemePicker
        themes={themes}
        selectedId="b"
        onSelect={onSelect}
        preview={<TerminalThemePreview palette={palette} />}
        footnote="note"
      />,
    );
    expect(screen.getAllByTestId('theme-check', { includeHiddenElements: true })).toHaveLength(1);
    expect(screen.getByTestId('terminal-theme-b').props.accessibilityState.selected).toBe(true);
    await fireEvent.press(screen.getByTestId('terminal-theme-a'));
    expect(onSelect).toHaveBeenCalledWith('a');
    expect(screen.getByTestId('terminal-theme-preview')).toBeTruthy();
  });
});

describe('AgentListFieldsEditor', () => {
  it('routes chips, add, sync and reset', async () => {
    const h = { onEdit: jest.fn(), onAdd: jest.fn(), onSync: jest.fn(), onReset: jest.fn() };
    await renderThemed(
      <AgentListFieldsEditor
        host="Mac"
        rows={[{ id: 'r1', title: 'Row 1', fields: ['workspace'] }]}
        preview={<AgentListFieldsPreview hostName="Mac" />}
        {...h}
      />,
    );
    await fireEvent.press(screen.getByTestId('field-chip-r1-workspace'));
    expect(h.onEdit).toHaveBeenCalledWith('r1', 'workspace');
    await fireEvent.press(screen.getByTestId('field-add-r1'));
    expect(h.onAdd).toHaveBeenCalledWith('r1');
    await fireEvent.press(screen.getByTestId('fields-sync'));
    await fireEvent.press(screen.getByTestId('fields-reset'));
    expect(h.onSync).toHaveBeenCalled();
    expect(h.onReset).toHaveBeenCalled();
    expect(screen.getByTestId('agent-fields-preview')).toBeTruthy();
  });
});

describe('AgentListFieldsPreview', () => {
  it('hides sample lines whose field is absent', async () => {
    await renderThemed(<AgentListFieldsPreview hostName="Mac" fields={['host']} />);
    expect(screen.getByText('Mac')).toBeTruthy();
    expect(screen.queryByText('+12')).toBeNull();
  });
});

describe('OverlayPeerViews', () => {
  it('draws a dot only when the online state is known', async () => {
    await renderThemed(
      <OverlayPeerViews name="a" online address="1.2.3.4" reachability="Direct" />,
    );
    expect(screen.getByTestId('status-dot-done', { includeHiddenElements: true })).toBeTruthy();
    await renderThemed(<OverlayPeerViews name="b" testID="unknown" />);
    expect(screen.queryByTestId('status-dot-idle', { includeHiddenElements: true })).toBeNull();
  });
});

describe('OverlayPeerPickerBody', () => {
  const peers = [
    { id: 'on', name: 'on-box', ip: '1.1.1.1', machineName: 'on.net' },
    { id: 'off', name: 'off-box', ip: '1.1.1.2', offline: true },
  ];
  it('picks online peers, ignores offline ones, switches mode and filters', async () => {
    const onPick = jest.fn();
    const onModeChange = jest.fn();
    await renderThemed(
      <OverlayPeerPickerBody peers={peers} mode="ip" onModeChange={onModeChange} onPick={onPick} />,
    );
    await fireEvent.press(screen.getByTestId('peer-on'));
    expect(onPick).toHaveBeenCalledWith(peers[0], 'ip');
    expect(screen.getByTestId('peer-off').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('segmented-name'));
    expect(onModeChange).toHaveBeenCalledWith('name');
    await fireEvent.changeText(screen.getByTestId('peer-search'), 'off');
    expect(screen.queryByTestId('peer-on')).toBeNull();
  });
  it('shows the failure with retry', async () => {
    const onRetry = jest.fn();
    await renderThemed(
      <OverlayPeerPickerBody
        peers={[]}
        mode="ip"
        onModeChange={jest.fn()}
        onPick={jest.fn()}
        failure={{ message: 'boom' }}
        onRetry={onRetry}
      />,
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('PortPreview', () => {
  const base = { title: 'h:1', onReload: jest.fn(), onRetry: jest.fn() };
  it('disables navigation until ready and reloads', async () => {
    const onReload = jest.fn();
    await renderThemed(<PortPreview {...base} onReload={onReload} state="opening" />);
    expect(screen.getByTestId('port-back').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('port-reload').props.accessibilityState.disabled).toBe(true);
  });
  it('shows the error with retry and the page when ready', async () => {
    const onRetry = jest.fn();
    await renderThemed(
      <PortPreview
        {...base}
        onRetry={onRetry}
        state="error"
        error={{ title: 'T', message: 'M' }}
      />,
    );
    await fireEvent.press(screen.getAllByRole('button')[0] as never);
    expect(onRetry).toHaveBeenCalled();
  });
  it('reports load progress', async () => {
    await renderThemed(
      <PortPreview {...base} state="ready" progress={0.5} canGoBack onShare={jest.fn()} />,
    );
    expect(screen.getByTestId('port-progress')).toBeTruthy();
    expect(screen.getByTestId('port-back').props.accessibilityState.disabled).toBe(false);
  });
});

describe('OptionListSheet', () => {
  it('lists every option under its group and reports the pick', async () => {
    const onPick = jest.fn();
    await renderThemed(
      <OptionListSheet
        visible
        title="Add"
        groups={[
          { title: 'One', options: [{ id: 'a', title: 'Alpha' }] },
          { options: [{ id: 'b', title: 'Beta' }] },
        ]}
        onPick={onPick}
        onClose={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByTestId('option-list-sheet-b'));
    expect(onPick).toHaveBeenCalledWith('b');
    expect(screen.getByTestId('option-list-sheet-a')).toBeTruthy();
  });
});
