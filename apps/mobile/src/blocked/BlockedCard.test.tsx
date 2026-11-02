import {
  type BlockedCardState,
  type BlockedDialog,
  makeFocus,
  makeOption,
  makeSubject,
  message,
} from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { BlockedCard, type BlockedCardProps } from './BlockedCard';
import { optionKind, stopLabel } from './dialogModel';

function bashDialog(): BlockedDialog {
  return {
    kind: 'claudeBash',
    program: 'claude',
    title: 'Bash command',
    sourceSuffix: null,
    positionLabel: null,
    body: ['Create empty file c1.txt', 'touch c1.txt'],
    progress: null,
    options: [
      makeOption({ ordinal: 1, number: 1, label: 'Yes', role: 'approve', isFocused: true }),
      makeOption({ ordinal: 2, number: 2, label: 'Yes, always', role: 'approvePersistent' }),
      makeOption({ ordinal: 3, number: 3, label: 'No', role: 'decline' }),
    ],
    rows: { lowerBound: 0, upperBound: 10 },
    fingerprint: { value: 'abc', requestLines: null, ruleLines: null },
    focus: makeFocus({ focusedOrdinal: 1 }),
    subject: { ...makeSubject(), command: 'touch c1.txt' },
    note: null,
  };
}

const base: BlockedCardState = {
  content: { kind: 'none' },
  progress: 'ready',
  notice: null,
  composerFocusRequest: 0,
  dialogGeneration: 0,
  isCollapsed: false,
};

async function renderCard(
  state: Partial<BlockedCardState>,
  handlers: Partial<BlockedCardProps> = {},
) {
  const props: BlockedCardProps = {
    state: { ...base, ...state },
    onChoose: jest.fn(),
    onStop: jest.fn(),
    onPress: jest.fn(),
    onKeys: jest.fn(),
    onCollapsedChange: jest.fn(),
    ...handlers,
  };
  await render(
    <ThemeProvider themeId="indigo">
      <BlockedCard {...props} />
    </ThemeProvider>,
  );
  return props;
}

describe('BlockedCard', () => {
  it('renders nothing while nothing is asked', async () => {
    await renderCard({});
    expect(screen.queryByTestId('blocked-card')).toBeNull();
  });

  it('offers one button per option and sends the pressed ordinal', async () => {
    const dialog = bashDialog();
    const props = await renderCard({ content: { kind: 'card', dialog } });
    for (const option of dialog.options) {
      expect(screen.getByTestId(`blocked-option-${option.ordinal}`)).toBeTruthy();
    }
    await fireEvent.press(screen.getByTestId('blocked-option-1'));
    expect(props.onChoose).toHaveBeenCalledWith(1);
  });

  it('disables every answer while keys go out or after an unconfirmed answer', async () => {
    const dialog = bashDialog();
    const props = await renderCard({ content: { kind: 'card', dialog }, progress: 'unconfirmed' });
    await fireEvent.press(screen.getByTestId('blocked-option-1'));
    expect(props.onChoose).not.toHaveBeenCalled();
  });

  it('names Stop only once an answer went unconfirmed when an option already declines', async () => {
    const dialog = bashDialog();
    expect(stopLabel(dialog, 'ready')).toBeNull();
    expect(stopLabel(dialog, 'unconfirmed')).not.toBeNull();
  });

  it('styles approvals as primary and declines as destructive', async () => {
    const { options } = bashDialog();
    const approve = options.find((option) => option.role === 'approve');
    const decline = options.find((option) => option.role === 'decline');
    if (!approve || !decline) throw new Error('fixture lacks roles');
    expect(optionKind(approve)).toBe('primary');
    expect(optionKind(decline)).toBe('destructive');
  });

  it('shows the notice, and the key pad when the screen cannot be read', async () => {
    const props = await renderCard({
      content: { kind: 'unreadable' },
      notice: message('This prompt changed. Check it before answering.'),
    });
    expect(screen.getByTestId('blocked-notice')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('↓'));
    expect(props.onKeys).toHaveBeenCalledWith(['down']);
  });

  it('folds to a bar and hides its choices', async () => {
    await renderCard({ content: { kind: 'card', dialog: bashDialog() }, isCollapsed: true });
    expect(screen.queryByTestId('blocked-option-1')).toBeNull();
  });
});
