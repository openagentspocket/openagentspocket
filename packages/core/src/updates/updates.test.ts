import { describe, expect, it } from 'vitest';
import {
  channelParamValue,
  runningUpdateReportText,
  summarizeRunningUpdate,
  updateChannel,
} from './index';

describe('update channel', () => {
  it('Early Updates asks for beta; off is production, sent as no param at all', () => {
    expect(updateChannel(true)).toBe('beta');
    expect(updateChannel(false)).toBe('production');
    expect(channelParamValue('beta')).toBe('beta');
    expect(channelParamValue('production')).toBeNull();
  });
});

describe('running update', () => {
  const id = '0f6a2b3c-1d2e-4f50-8a9b-0c1d2e3f4a5b';

  it('names the embedded JS as embedded, with or without an id', () => {
    expect(summarizeRunningUpdate({ embedded: true, id, createdAt: new Date() })).toEqual({
      kind: 'embedded',
    });
    expect(summarizeRunningUpdate({ embedded: false, id: null, createdAt: null }).kind).toBe(
      'embedded',
    );
  });

  it('names a downloaded update by its short id and publish date (UTC)', () => {
    const summary = summarizeRunningUpdate({
      embedded: false,
      id,
      createdAt: new Date('2026-11-14T23:30:00.000Z'),
    });
    expect(summary).toEqual({ kind: 'update', shortId: '0f6a2b3c', date: '2026-11-14' });
    expect(runningUpdateReportText(summary)).toContain('0f6a2b3c');
    expect(runningUpdateReportText(summary)).toContain('2026-11-14');
  });

  it('drops an unusable date instead of printing it', () => {
    const summary = summarizeRunningUpdate({ embedded: false, id, createdAt: new Date('nope') });
    expect(summary).toEqual({ kind: 'update', shortId: '0f6a2b3c', date: null });
  });
});
