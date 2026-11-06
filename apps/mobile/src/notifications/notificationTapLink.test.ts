import { notificationTapLink } from './notificationTapLink';

describe('notificationTapLink', () => {
  const link = 'openagentspocket://agent/h/p';

  it('finds the link wherever expo puts it', () => {
    expect(notificationTapLink({ data: { agenticoLink: link } })).toBe(link);
    expect(notificationTapLink({ data: {}, payload: { agenticoLink: link } })).toBe(link);
  });

  it('a push without one opens nothing', () => {
    expect(notificationTapLink({ data: { agenticoLink: 3 } })).toBeNull();
    expect(notificationTapLink({})).toBeNull();
  });
});
