import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { SessionDrawer } from './SessionDrawer';

const workspaces = [
  {
    id: 'w1',
    title: 'api',
    items: [
      {
        id: 'a',
        kind: 'agent' as const,
        title: 'one',
        program: 'claude',
        status: 'working' as const,
      },
      {
        id: 'b',
        kind: 'agent' as const,
        title: 'two',
        program: 'codex',
        status: 'blocked' as const,
      },
      { id: 's', kind: 'shell' as const, title: 'shell' },
    ],
  },
];

describe('SessionDrawer views', () => {
  it('switches between the Workspace tree and the Agents grouped by status', async () => {
    await renderThemed(
      <SessionDrawer
        host={{ name: 'Host', summary: '3' }}
        workspaces={workspaces}
        selectedId="a"
        onSelect={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByTestId('session-drawer-fold-w1')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('session-drawer-view-agents'));
    expect(screen.queryByTestId('session-drawer-fold-w1')).toBeNull();
    expect(screen.getByTestId('session-drawer-agents-needsYou')).toBeTruthy();
    expect(screen.getByTestId('session-drawer-agents-working')).toBeTruthy();
    expect(screen.getByTestId('session-drawer-agents-shells')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('session-drawer-view-tree'));
    expect(screen.getByTestId('session-drawer-fold-w1')).toBeTruthy();
  });
});
