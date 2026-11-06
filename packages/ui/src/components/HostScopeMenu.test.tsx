import { screen } from '@testing-library/react-native';
import { ActionMenuButton } from '../overlay/ActionMenu';
import { renderThemed } from '../test-utils';
import { HostScopeMenu } from './HostScopeMenu';

const items = [{ key: 'all', title: 'All Hosts', onPress: () => undefined }];

describe('HostScopeMenu', () => {
  it('shows the capsule when there is a choice', async () => {
    await renderThemed(<HostScopeMenu items={items} label="Studio" accessibilityLabel="Filter" />);
    expect(screen.getByTestId('host-scope-capsule')).toBeTruthy();
  });

  it('draws the current choice on the menu trigger', async () => {
    await renderThemed(
      <ActionMenuButton items={items} label="Studio" accessibilityLabel="Filter" native={false} />,
    );
    expect(screen.getByText('Studio')).toBeTruthy();
  });

  it('is hidden when there is nothing to choose', async () => {
    await renderThemed(<HostScopeMenu items={[]} label="Studio" accessibilityLabel="Filter" />);
    expect(screen.queryByTestId('host-scope-capsule')).toBeNull();
  });
});
