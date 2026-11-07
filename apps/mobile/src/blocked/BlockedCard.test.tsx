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
    onSubmitSelection: jest.fn(),
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

  it('takes a multi-select question as a set: toggles send nothing, the button sends them', async () => {
    const dialog: BlockedDialog = {
      ...bashDialog(),
      kind: 'claudeQuestion',
      options: [
        makeOption({ ordinal: 1, number: 1, label: 'Red', role: 'answer', isChecked: true }),
        makeOption({ ordinal: 2, number: 2, label: 'Green', role: 'answer', isChecked: false }),
        makeOption({ ordinal: 3, number: null, label: 'Next', role: 'next' }),
      ],
      focus: makeFocus({ focusedOrdinal: 1, checked: [1] }),
    };
    const props = await renderCard({ content: { kind: 'card', dialog } });
    await fireEvent.press(screen.getByTestId('blocked-toggle-2'));
    expect(props.onChoose).not.toHaveBeenCalled();
    expect(props.onSubmitSelection).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('blocked-submit-selection'));
    expect(props.onSubmitSelection).toHaveBeenCalledWith([1, 2]);
  });

  it('heads a question with what it asks', async () => {
    const dialog: BlockedDialog = {
      ...bashDialog(),
      kind: 'claudeQuestion',
      subject: { ...bashDialog().subject, question: 'Ship it?' },
    };
    await renderCard({ content: { kind: 'card', dialog } });
    expect(screen.getByText('Ship it?')).toBeTruthy();
  });

  it('draws nothing, and offers no keys, for a question no read shows', async () => {
    await renderCard({ content: { kind: 'questionUnread' } });
    expect(screen.queryByTestId('blocked-card')).toBeNull();
    expect(screen.queryByTestId('blocked-keypad')).toBeNull();
  });

  it('gives a dialog it cannot name its reason and a way to the terminal', async () => {
    const onShowTerminal = jest.fn();
    await renderCard(
      {
        content: {
          kind: 'generic',
          excerpt: {
            rows: [],
            numbered: new Map(),
            reason: message('Agentico does not handle questions with previews yet.'),
            fingerprint: { value: 'x', requestLines: null, ruleLines: null },
            displayLines: null,
          },
        },
      },
      { onShowTerminal },
    );
    expect(screen.getByTestId('blocked-generic-reason')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('blocked-show-terminal'));
    expect(onShowTerminal).toHaveBeenCalledTimes(1);
  });

  it('folds to a bar and hides its choices', async () => {
    await renderCard({ content: { kind: 'card', dialog: bashDialog() }, isCollapsed: true });
    expect(screen.queryByTestId('blocked-option-1')).toBeNull();
  });
});
