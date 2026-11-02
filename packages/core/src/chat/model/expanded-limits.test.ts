import { describe, expect, it } from 'vitest';
import { capPreview, withExpandedLimits } from './preview';

const many = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');

describe('withExpandedLimits', () => {
  it('lets a default cap keep far more than a row shows, then restores the row limits', () => {
    expect(capPreview(many).isTruncated).toBe(true);
    const expanded = withExpandedLimits(() => capPreview(many));
    expect(expanded.isTruncated).toBe(false);
    expect(expanded.text).toBe(many);
    expect(capPreview(many).isTruncated).toBe(true);
  });

  it('restores the row limits when the read throws', () => {
    expect(() =>
      withExpandedLimits(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(capPreview(many).isTruncated).toBe(true);
  });
});
