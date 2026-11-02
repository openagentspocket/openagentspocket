import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { NavRow, PickerRow, StepperRow, TextField, ToggleRow } from '../index';
import { renderThemed } from '../test-utils';

describe('TextField', () => {
  it('is labeled by its label and reports text changes', async () => {
    const onChangeText = jest.fn();
    await renderThemed(
      <TextField label="Name" value="" onChangeText={onChangeText} testID="name" />,
    );
    await fireEvent.changeText(screen.getByLabelText('Name'), 'my host');
    expect(onChangeText).toHaveBeenCalledWith('my host');
  });

  it('shows the error instead of the hint and colors the border with danger', async () => {
    await renderThemed(
      <TextField
        label="Port"
        value="x"
        error="Use digits only."
        hint="22 by default"
        testID="port"
      />,
    );
    expect(screen.getByTestId('port-error')).toBeTruthy();
    expect(screen.queryByText('22 by default')).toBeNull();
    expect(screen.getByTestId('port').props['aria-invalid']).toBe(true);
  });
});

describe('ToggleRow', () => {
  it('is a labeled switch that reports the new value', async () => {
    const onValueChange = jest.fn();
    await renderThemed(
      <ToggleRow title="Notifications" value={false} onValueChange={onValueChange} />,
    );
    const toggle = screen.getByRole('switch', { name: 'Notifications' });
    await fireEvent(toggle, 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});

describe('PickerRow', () => {
  const options = [
    { value: 'indigo', label: 'Índigo' },
    { value: 'papel', label: 'Papel' },
  ] as const;

  it('shows the current choice, checks it in the menu and reports a new one', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <PickerRow title="Theme" options={options} value="indigo" onChange={onChange} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Theme, Índigo' }));
    expect(await screen.findByRole('menuitem', { name: 'Índigo', selected: true })).toBeTruthy();
    expect(screen.queryByRole('menuitem', { name: 'Papel', selected: true })).toBeNull();
    await fireEvent.press(screen.getByRole('menuitem', { name: 'Papel' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('papel'));
  });
});

describe('StepperRow', () => {
  it('steps within its bounds', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <StepperRow title="Font size" value={20} min={9} max={20} onChange={onChange} testID="s" />,
    );
    expect(screen.getByTestId('s-increment')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('s-decrement'));
    expect(onChange).toHaveBeenCalledWith(19);
  });

  it('is adjustable for screen readers and clamps', async () => {
    const onChange = jest.fn();
    await renderThemed(
      <StepperRow
        title="Font size"
        value={9}
        min={9}
        max={20}
        onChange={onChange}
        format={(value) => `${value} pt`}
        testID="s"
      />,
    );
    const stepper = screen.getByRole('adjustable', { name: 'Font size' });
    expect(stepper.props.accessibilityValue).toEqual({ text: '9 pt' });
    await fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onChange).toHaveBeenLastCalledWith(9);
    await fireEvent(stepper, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onChange).toHaveBeenLastCalledWith(10);
  });
});

describe('NavRow', () => {
  it('is a row with a chevron that pushes', async () => {
    const onPress = jest.fn();
    await renderThemed(<NavRow title="Hosts" value="2" onPress={onPress} />);
    expect(screen.getByTestId('icon-chevronRight', { includeHiddenElements: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Hosts, 2' }));
    expect(onPress).toHaveBeenCalled();
  });
});
