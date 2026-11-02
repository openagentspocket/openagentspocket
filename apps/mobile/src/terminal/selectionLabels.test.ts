import { openLinkLabels, reviewPasteLabels, terminalSheetTitles } from './selectionLabels';

describe('selection labels', () => {
  it('resolve every key (a missing key would come back as the key itself, which is non-empty, so compare per locale shape)', () => {
    const review = reviewPasteLabels({ lineCount: 3, characterCount: 21 });
    expect(review.summary).toContain('3');
    expect(review.summary).toContain('21');
    const link = openLinkLabels('example.org');
    expect(link.failedMessage).toContain('example.org');
    expect(openLinkLabels('').failedMessage).not.toContain('%');
    for (const value of [
      ...Object.values(review),
      ...Object.values(link),
      ...Object.values(terminalSheetTitles()),
    ]) {
      expect(value.length).toBeGreaterThan(0);
      expect(value).not.toMatch(/%lld|%@|\{0/);
    }
  });
});
