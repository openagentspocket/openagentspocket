import { addHostHandover } from './addHostNavigation';

describe('addHostHandover', () => {
  it('replaces the sheet route from Home and navigates inside an open Hosts modal', () => {
    expect(addHostHandover(['index', 'add-host'])).toBe('replace');
    expect(addHostHandover(['index', 'hosts', 'add-host'])).toBe('navigate');
  });
});
