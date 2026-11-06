import { screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { renderThemed } from '../test-utils';
import { AsyncContent } from './AsyncContent';

const content = <Text>content</Text>;

describe('AsyncContent', () => {
  it('a failure wins over loading and content', async () => {
    await renderThemed(
      <AsyncContent failure={{ summary: 'failed' }} loading>
        {content}
      </AsyncContent>,
    );
    expect(screen.getByText('failed')).toBeTruthy();
    expect(screen.queryByText('content')).toBeNull();
  });

  it('empty shows only once loaded, and content when there is no empty state', async () => {
    await renderThemed(<AsyncContent empty={{ title: 'none' }}>{content}</AsyncContent>);
    expect(screen.getByText('none')).toBeTruthy();
    await renderThemed(<AsyncContent>{content}</AsyncContent>);
    expect(screen.getByText('content')).toBeTruthy();
  });
});
