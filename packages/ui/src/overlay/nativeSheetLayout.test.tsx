import type { ReactNode } from 'react';
import { StyleSheet, Text, type ViewStyle } from 'react-native';
import { renderThemed } from '../test-utils';
import { NativeSheet } from './NativeSheet';
import type { SheetDetent } from './sheetDetents';

const seen: { style?: unknown }[] = [];
function mockTrueSheet(props: { style?: unknown; children?: ReactNode }) {
  seen.push(props);
  return <>{props.children}</>;
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
