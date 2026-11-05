import { screen } from '@testing-library/react-native';
import { renderThemed } from '../test-utils';
import { themes } from '../theme/tokens.generated';
import { ProgramMark } from './ProgramMark';
import { Spinner } from './Spinner';
import { ThemedRefreshControl } from './ThemedRefreshControl';
import { ThemedTextInput } from './ThemedTextInput';
import { Toggle } from './Toggle';

describe('platform control tints', () => {
  for (const id of ['indigo', 'papel'] as const) {
    const colors = themes[id].colors;

    it(`${id}: the switch takes its track and thumb from the tokens`, async () => {
      await renderThemed(<Toggle value onValueChange={() => {}} testID="t" />, id);
      const props = screen.getByTestId('t').props;
      expect(props.onTintColor).toBe(colors.accent);
      expect(props.tintColor).toBe(colors.control);
    });

    it(`${id}: the spinner and the text input take their colors from the tokens`, async () => {
      await renderThemed(
        <>
          <Spinner color="accent" testID="s" />
          <ThemedTextInput testID="i" />
        </>,
        id,
      );
      expect(screen.getByTestId('s').props.color).toBe(colors.accent);
      const input = screen.getByTestId('i').props;
      expect(input.selectionColor).toBe(colors.accent);
      expect(input.cursorColor).toBe(colors.accent);
      expect(input.selectionHandleColor).toBe(colors.accent);
      expect(input.placeholderTextColor).toBe(colors.textTertiary);
    });
  }

  it('the refresh control and a Working mark with a pulse render', async () => {
    await renderThemed(
      <>
        <ThemedRefreshControl refreshing={false} onRefresh={() => {}} />
        <ProgramMark program="claude" status="working" pulse />
      </>,
    );
    expect(screen.getByTestId('program-mark-status-working', { hidden: true })).toBeTruthy();
  });
});
