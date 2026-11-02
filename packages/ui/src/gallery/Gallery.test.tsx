import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Gallery, gallerySections, themes } from '../index';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

const SPECIMENS = [
  'Text variants',
  'Icon',
  'Button kinds',
  'CopyButton / CopyableValueRow',
  'Badge',
  'StatusPill / StatusDot',
  'Chip / ChipRow',
  'ProgramMark',
  'Card',
  'Section + ListRow',
  'Section collapsible',
  'TextField',
  'Form rows',
  'Banner',
  'EmptyState',
  'ErrorState',
  'Skeleton',
  'Meter',
  'BarChart',
  'confirm()',
  'Sheet',
  'ActionMenu',
  'toast() / InAppBanner',
  'Markdown + CodeBlock',
  'DiffView unified',
  'DiffView split',
  'TerminalView (text fallback)',
  'KeyboardDock',
  'Composer idle',
  'Composer busy (Stop)',
  'VirtualSectionList (FlashList v2)',
];

describe('Gallery', () => {
  // The components section renders every catalog entry in two skins; it grows with each UX3 group.
  it.each(['indigo', 'papel', 'noche'] as const)(
    'renders every specimen in %s',
    async (id) => {
      await render(<Gallery initialTheme={id} />);
      await act(async () => {});
      for (const section of gallerySections) {
        expect(screen.getByTestId(`gallery-${section.id}`)).toBeTruthy();
      }
      for (const name of SPECIMENS) expect(screen.getByTestId(`specimen-${name}`)).toBeTruthy();
      expect(screen.getByRole('button', { name: themes[id].name })).toBeSelected();
      expect(screen.getByTestId('gallery')).toHaveStyle({
        backgroundColor: themes[id].colors.canvas,
      });
    },
    60_000,
  );

  it('switches theme and filters to one section', async () => {
    await render(<Gallery initialSection="overlays" />);
    expect(screen.getByTestId('gallery-overlays')).toBeTruthy();
    expect(screen.queryByTestId('gallery-buttons')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Papel' }));
    expect(screen.getByTestId('gallery')).toHaveStyle({
      backgroundColor: themes.papel.colors.canvas,
    });
    await fireEvent.press(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('gallery-buttons')).toBeTruthy();
  });

  it('falls back to Índigo and all sections for unknown route params', async () => {
    await render(<Gallery initialTheme="sepia" initialSection="nope" />);
    expect(screen.getByRole('button', { name: 'Índigo' })).toBeSelected();
    expect(screen.getByRole('button', { name: 'All' })).toBeSelected();
  });

  it('opens a confirm() from the gallery in its own host', async () => {
    await render(<Gallery initialSection="overlays" />);
    await fireEvent.press(screen.getByRole('button', { name: 'Destructive' }));
    expect(await screen.findByRole('header', { name: 'Delete this Host?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('header', { name: 'Delete this Host?' })).toBeNull();
  });
});
