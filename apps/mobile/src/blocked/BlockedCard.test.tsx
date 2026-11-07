import {
  type BlockedCardState,
  type BlockedDialog,
  type GenericDialogExcerpt,
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

  it('warns under an option that saves a rule', async () => {
    await renderCard({ content: { kind: 'card', dialog: bashDialog() } });
    expect(screen.getByTestId('blocked-warning-2')).toBeTruthy();
    expect(screen.queryByTestId('blocked-warning-1')).toBeNull();
  });

  it('sends Stop once an answer went unconfirmed', async () => {
    const dialog = bashDialog();
    const props = await renderCard({ content: { kind: 'card', dialog }, progress: 'unconfirmed' });
    await fireEvent.press(screen.getByTestId('blocked-stop'));
    expect(props.onStop).toHaveBeenCalledTimes(1);
  });

  it('numbers the answers of an unknown dialog in order and sends the number', async () => {
    const excerpt = {
      rows: [],
      numbered: new Map([
        [2, 'Keep'],
        [1, 'Rebuild'],
      ]),
      reason: 'unknown',
    } as unknown as GenericDialogExcerpt;
    const props = await renderCard({ content: { kind: 'generic', excerpt } });
    expect(screen.getAllByTestId(/^blocked-generic-/).map((node) => node.props.testID)).toEqual([
      'blocked-generic-1',
      'blocked-generic-2',
    ]);
    await fireEvent.press(screen.getByTestId('blocked-generic-2'));
    expect(props.onPress).toHaveBeenCalledWith(2);
  });

  it('keeps the raw keys live after an unconfirmed answer, not while keys go out', async () => {
    const live = await renderCard({ content: { kind: 'unreadable' }, progress: 'unconfirmed' });
    await fireEvent.press(screen.getByLabelText('↓'));
    expect(live.onKeys).toHaveBeenCalledTimes(1);
    const held = await renderCard({ content: { kind: 'unreadable' }, progress: 'acting' });
    await fireEvent.press(screen.getByLabelText('↓'));
    expect(held.onKeys).not.toHaveBeenCalled();
  });

  it('asks the store to fold or unfold from the header', async () => {
    const props = await renderCard({ content: { kind: 'unreadable' } });
    await fireEvent.press(screen.getByTestId('blocked-collapse'));
    expect(props.onCollapsedChange).toHaveBeenCalledWith(true);
  });

  it('folds to a bar and hides its choices', async () => {
    await renderCard({ content: { kind: 'card', dialog: bashDialog() }, isCollapsed: true });
    expect(screen.queryByTestId('blocked-option-1')).toBeNull();
  });
});
