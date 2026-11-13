import { screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { renderThemed } from '../test-utils';
import { JsSheet } from './JsSheet';
import { NativeSheet } from './NativeSheet';
import type { SheetDetent } from './sheetDetents';

interface Seen {
  style?: unknown;
  children?: ReactNode;
  footer?: ReactElement;
  footerOptions?: { position?: string; avoidKeyboard?: boolean };
}
const seen: Seen[] = [];
function mockTrueSheet(props: Seen) {
  seen.push(props);
  return (
    <>
      {props.children}
      {props.footer}
    </>
  );
}

jest.mock('./loadTrueSheet', () => ({ loadTrueSheet: () => mockTrueSheet }));

async function contentStyle(detent: SheetDetent) {
  seen.length = 0;
  await renderThemed(
    <NativeSheet visible onClose={() => undefined} detent={detent}>
      <Text>body</Text>
    </NativeSheet>,
  );
  expect(seen.length).toBeGreaterThan(0);
  return StyleSheet.flatten(seen.at(-1)?.style as ViewStyle | undefined);
}

describe('NativeSheet content view', () => {
  // True Sheet gives `style` to its content view, auto-height otherwise: the surface and the
  // ScrollView under it are flex, and they collapse to no height inside an auto-height parent.
  it.each<SheetDetent>(['large', 'medium', { fraction: 0.65 }])(
    'fills the sheet at a fixed detent: %j',
    async (detent) => {
      expect(await contentStyle(detent)).toMatchObject({ flex: 1 });
    },
  );

  it('keeps its own height at the fit detent, which the sheet measures', async () => {
    expect((await contentStyle('fit'))?.flex).toBeUndefined();
  });
});

describe('a sheet footer and the keyboard', () => {
  const sheet = (Host: typeof NativeSheet) => (
    <Host visible onClose={() => undefined} detent="large" footer={<Text>Save</Text>} testID="s">
      <Text>body</Text>
    </Host>
  );

  it("on the native host the footer is the sheet's own absolute footer, which rises above the keyboard", async () => {
    seen.length = 0;
    await renderThemed(sheet(NativeSheet));
    expect(seen.at(-1)?.footerOptions).toEqual({ position: 'absolute', avoidKeyboard: true });
    // Drawn once (by the host), not also inline under the body where the keyboard covers it.
    expect(screen.getAllByText('Save')).toHaveLength(1);
    // True Sheet insets its plugged scroll view for the keyboard: the ScrollView must not too.
    expect(screen.getByTestId('s-scroll').props.automaticallyAdjustKeyboardInsets).toBe(false);
  });

  it('without a footer the native host passes none', async () => {
    seen.length = 0;
    await renderThemed(
      <NativeSheet visible onClose={() => undefined}>
        <Text>body</Text>
      </NativeSheet>,
    );
    expect(seen.at(-1)?.footer).toBeUndefined();
    expect(seen.at(-1)?.footerOptions).toBeUndefined();
  });

  it('on the JS host the footer stays inline: the whole panel lifts with the keyboard', async () => {
    await renderThemed(sheet(JsSheet));
    expect(screen.getAllByText('Save')).toHaveLength(1);
    expect(screen.getByTestId('s-scroll').props.automaticallyAdjustKeyboardInsets).toBe(true);
  });
});
