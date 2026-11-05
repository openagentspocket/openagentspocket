import { hrefs } from './hrefs';

describe('hrefs', () => {
  it('starts adding a Host at Scan to Pair, as Swift does (manual form is the fallback)', () => {
    expect(hrefs.addHost()).toBe('/add-host');
    expect(hrefs.easyPair()).toBe('/hosts/pair');
    expect(hrefs.hostForm()).toEqual({ pathname: '/hosts/form', params: {} });
    expect(hrefs.hostForm({ edit: 'h1' })).toEqual({
      pathname: '/hosts/form',
      params: { edit: 'h1' },
    });
  });
});
