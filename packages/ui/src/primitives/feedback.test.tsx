import { fireEvent, screen } from '@testing-library/react-native';
import {
  Banner,
  Button,
  EmptyState,
  ErrorState,
  Meter,
  meterColor,
  ProgramMark,
  SkeletonRows,
  themes,
  withAlpha,
} from '../index';
import { renderThemed } from '../test-utils';

describe('EmptyState and ErrorState', () => {
  it('heads the empty state with its title and shows its actions', async () => {
    await renderThemed(<EmptyState title="No Agents" message="Start one." />);
    expect(screen.getByRole('header', { name: 'No Agents' })).toBeTruthy();
    expect(screen.getByText('Start one.')).toBeTruthy();
  });

  it('draws its actions under the message', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <EmptyState title="No Agents" actions={<Button title="New Agent" onPress={onPress} />} />,
    );
    await fireEvent.press(screen.getByRole('button', { name: 'New Agent' }));
    expect(onPress).toHaveBeenCalled();
  });

  it('presents summary, recovery and detail, and retries', async () => {
    const onRetry = jest.fn();
    await renderThemed(
      <ErrorState
        summary="Can't reach your Host"
        recovery="Check that it is awake."
        detail="ECONNREFUSED 22"
        onRetry={onRetry}
        retryLabel="Retry"
      />,
    );
    expect(screen.getByRole('header', { name: "Can't reach your Host" })).toBeTruthy();
    expect(screen.getByText('ECONNREFUSED 22')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });
});

describe('SkeletonRows', () => {
  it('is one busy progress element for screen readers', async () => {
    await renderThemed(<SkeletonRows rows={2} accessibilityLabel="Loading Agents" />);
    const loading = screen.getByRole('progressbar', { name: 'Loading Agents' });
    expect(loading).toBeBusy();
    expect(screen.getAllByTestId('skeleton', { includeHiddenElements: true })).toHaveLength(6);
  });
});

describe('Banner', () => {
  it('washes its tone color and runs its action and dismiss', async () => {
    const onAction = jest.fn();
    const onDismiss = jest.fn();
    await renderThemed(
      <Banner
        tone="warning"
        title="Plugin update"
        actionLabel="Update"
        onAction={onAction}
        onDismiss={onDismiss}
        dismissLabel="Hide"
      />,
      'papel',
    );
    expect(screen.getByTestId('banner')).toHaveStyle({
      backgroundColor: withAlpha(themes.papel.colors.warning, 0.15),
    });
    await fireEvent.press(screen.getByRole('button', { name: 'Update' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Hide' }));
    expect(onAction).toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('announces a danger banner as an alert', async () => {
    await renderThemed(<Banner tone="danger" title="Send failed" />);
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});

describe('Meter', () => {
  it('turns warning at 80% and danger at 95%', () => {
    expect(meterColor(0.79)).toBe('accent');
    expect(meterColor(0.8)).toBe('warning');
    expect(meterColor(0.95)).toBe('danger');
    expect(meterColor(1.4)).toBe('danger');
    expect(meterColor(Number.NaN, 'info')).toBe('info');
  });

  it('reports its percentage and draws the pace tick', async () => {
    await renderThemed(<Meter value={0.86} pace={0.5} accessibilityLabel="Weekly limit" />);
    const meter = screen.getByRole('progressbar', { name: 'Weekly limit' });
    expect(meter.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 86 });
    expect(screen.getByTestId('meter-fill', { includeHiddenElements: true })).toHaveStyle({
      backgroundColor: themes.indigo.colors.warning,
      width: '86%',
    });
    expect(screen.getByTestId('meter-pace', { includeHiddenElements: true })).toHaveStyle({
      left: '50%',
    });
  });
});

describe('ProgramMark', () => {
  it('draws the neutral glyph and a status dot ringed in the fill under it (the canvas here)', async () => {
    await renderThemed(<ProgramMark program="zsh" status="working" size={20} />, 'noche');
    expect(screen.getByText('Z', { includeHiddenElements: true })).toBeTruthy();
    expect(
      screen.getByTestId('program-mark-status-working', { includeHiddenElements: true }),
    ).toHaveStyle({
      backgroundColor: themes.noche.colors.statusWorking,
      borderColor: themes.noche.colors.canvas,
    });
  });

  it('is decorative and draws no dot without a status', async () => {
    await renderThemed(<ProgramMark program="zsh" />);
    expect(screen.queryByTestId('program-mark-zsh')).toBeNull();
    expect(
      screen.queryByTestId('program-mark-status-idle', { includeHiddenElements: true }),
    ).toBeNull();
  });
});
