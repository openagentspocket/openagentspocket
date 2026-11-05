import { fireEvent, screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { ChoiceSheet } from './ChoiceSheet';
import { CommandBlock } from './CommandBlock';

describe('ChoiceSheet', () => {
  it('shows every option and fires the pressed one', async () => {
    const first = jest.fn();
    const second = jest.fn();
    await renderThemed(
      <ChoiceSheet
        visible
        title="Add"
        onClose={() => {}}
        options={[
          { id: 'a', icon: 'qr', eyebrow: 'Best', title: 'A', description: 'a', onPress: first },
          { id: 'b', icon: 'terminal', title: 'B', description: 'b', meta: 'm', onPress: second },
        ]}
      />,
    );
    await fireEvent.press(screen.getByTestId('choice-sheet-b'));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});

describe('CommandBlock', () => {
  it('renders one prompt per line and a single copy control', async () => {
    await renderThemed(<CommandBlock lines={['one', 'two']} />);
    expect(screen.getAllByText('$', { includeHiddenElements: true })).toHaveLength(2);
    expect(screen.getAllByTestId('command-block-copy')).toHaveLength(1);
  });
});
