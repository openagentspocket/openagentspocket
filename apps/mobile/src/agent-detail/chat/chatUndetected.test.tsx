import { ThemeProvider } from '@openagentspocket/ui';
import { render, screen } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { ChatEmpty } from './ChatEmpty';

const renderThemed = (element: ReactElement) =>
  render(<ThemeProvider themeId="indigo">{element}</ThemeProvider>);

const hermes = { id: 'hermes', label: 'Hermes Agent', otherUser: false };
const phase = { type: 'unavailable', reason: { kind: 'unreadableProgram' } } as never;

describe('Chat for a program herdr does not report', () => {
  it('offers to install its integration', async () => {
    const install = jest.fn();
    await renderThemed(
      <ChatEmpty
        phase={phase}
        undetected={{ notice: { kind: 'install', program: hermes }, install, installing: false }}
      />,
    );
    expect(screen.getByText("Hermes Agent isn't reporting to herdr")).toBeTruthy();
    expect(screen.getByTestId('chat-install-integration')).toBeTruthy();
  });

  it('explains a program run as another user, with nothing to install', async () => {
    await renderThemed(
      <ChatEmpty
        phase={phase}
        undetected={{
          notice: { kind: 'otherUser', program: { ...hermes, otherUser: true } },
          installing: false,
        }}
      />,
    );
    expect(screen.queryByTestId('chat-install-integration')).toBeNull();
  });
});
