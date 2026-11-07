import { message, type QuickWindow } from '@openagentspocket/core';
import { ThemeProvider } from '@openagentspocket/ui';
import { render, screen } from '@testing-library/react-native';
import { LimitWindowRow } from './LimitWindowRow';

const now = new Date('2026-11-07T12:00:00Z');

const quickWindow = (over: Partial<QuickWindow> = {}): QuickWindow => ({
  id: 'weekly',
  name: message('Weekly'),
  usedPercent: 62,
  isExpired: false,
  resetsAt: new Date('2026-11-09T12:00:00Z'),
  elapsedPercent: 40,
  pace: 'ahead',
  level: 'normal',
  ...over,
});

async function renderRow(window: QuickWindow, compact?: boolean) {
  await render(
    <ThemeProvider themeId="indigo">
      <LimitWindowRow window={window} now={now} compact={compact} />
    </ThemeProvider>,
  );
}

const hidden = { includeHiddenElements: true };

describe('LimitWindowRow', () => {
  it('maps a window to the bar, its pace tick and the pace line', async () => {
    await renderRow(quickWindow());
    expect(screen.getByTestId('limit-weekly')).toBeTruthy();
    expect(screen.getByTestId('meter-weekly', hidden).props.accessibilityValue.now).toBe(62);
    expect(screen.getByTestId('meter-pace', hidden)).toBeTruthy();
    expect(screen.getByTestId('pace-weekly', hidden)).toBeTruthy();
  });

  it('draws no bar while the share is unknown, and no tick without an even pace', async () => {
    await renderRow(quickWindow({ usedPercent: null }));
    expect(screen.queryByTestId('meter-weekly', hidden)).toBeNull();
    await renderRow(quickWindow({ elapsedPercent: null }));
    expect(screen.queryByTestId('meter-pace', hidden)).toBeNull();
  });

  it('compact keeps the bar on one line and drops the pace line', async () => {
    await renderRow(quickWindow(), true);
    expect(screen.getByTestId('meter-weekly', hidden)).toBeTruthy();
    expect(screen.queryByTestId('pace-weekly', hidden)).toBeNull();
  });
});
