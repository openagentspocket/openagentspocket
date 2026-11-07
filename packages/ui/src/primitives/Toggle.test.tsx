import { render, screen } from '@testing-library/react-native';
import { ThemeProvider } from '../theme/theme';
import { type ThemeId, themes } from '../theme/tokens.generated';
import { Toggle } from './Toggle';

const drawn = async (themeId: ThemeId, value: boolean) => {
  await render(
    <ThemeProvider themeId={themeId}>
      <Toggle value={value} onValueChange={jest.fn()} testID="toggle" />
    </ThemeProvider>,
  );
  return screen.getByTestId('toggle').props;
};

describe('Toggle', () => {
  it('darkens the thumb when the accent is near white, so "on" still shows a knob', async () => {
    const props = await drawn('negro', true);
    expect(props.thumbTintColor).toBe(themes.negro.colors.onAccent);
  });

  it('leaves the system thumb alone otherwise', async () => {
    expect((await drawn('negro', false)).thumbTintColor).toBeUndefined();
    expect((await drawn('indigo', true)).thumbTintColor).toBeUndefined();
  });
});
