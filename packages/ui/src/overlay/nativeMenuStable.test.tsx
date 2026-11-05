import { act, render } from '@testing-library/react-native';
import { useState } from 'react';
import { ThemeProvider } from '../index';
import { NativeActionMenu } from './NativeActionMenu';

const calls = { menu: 0, press: undefined as (() => void) | undefined };
const FakeHost = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
function FakeMenu({ children }: { children?: React.ReactNode }) {
  calls.menu += 1;
  return <>{children}</>;
}
function FakeButton({ onPress }: { onPress?: () => void }) {
  calls.press = onPress;
  return null;
}
const ui = {
  Host: FakeHost as never,
  Menu: FakeMenu as never,
  Button: FakeButton as never,
};

let rerender: () => void = () => {};
function Parent({ first, second }: { first: () => void; second: () => void }) {
  const [renders, setRenders] = useState(0);
  rerender = () => setRenders((count) => count + 1);
  return (
    <NativeActionMenu
      ui={ui}
      accessibilityLabel="More"
      icon="more"
      testID="nm"
      // Fresh item objects and handlers on every render, as callers build them inline.
      items={[{ key: 'pin', title: 'Pin', onPress: renders === 0 ? first : second }]}
    />
  );
}

describe('the native menu', () => {
  it('is not rebuilt when a parent re-renders with the same items, and presses reach the latest handler', async () => {
    const first = jest.fn();
    const second = jest.fn();
    await render(
      <ThemeProvider themeId="indigo">
        <Parent first={first} second={second} />
      </ThemeProvider>,
    );
    const drawn = calls.menu;
    await act(async () => rerender());
    expect(calls.menu).toBe(drawn);
    calls.press?.();
    expect(second).toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
  });
});
