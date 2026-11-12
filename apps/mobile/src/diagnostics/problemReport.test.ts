import type { CrashRecord } from './crashRecorder';
import {
  MAX_CRASH_CHARS,
  NEW_ISSUE_URL,
  problemReportBody,
  problemReportUrl,
} from './problemReport';

const BUILD = { version: '1.0.0', build: '42', system: 'ios 26.1' };
const CRASH: CrashRecord = { at: 0, message: 'rows is undefined', stack: 'at Home', fatal: true };

const bodyOf = (url: string) => decodeURIComponent(new URL(url).searchParams.get('body') ?? '');

describe('problem report', () => {
  it('names the version, build and system, and no crash unless one is given', () => {
    const body = problemReportBody(BUILD);
    for (const value of ['1.0.0', '42', 'ios 26.1']) expect(body).toContain(value);
    expect(body).not.toContain(CRASH.message);
    expect(problemReportBody(BUILD, CRASH)).toContain(CRASH.message);
  });

  it('opens the new-issue form with exactly the body the person saw', () => {
    const body = problemReportBody(BUILD, CRASH);
    const url = problemReportUrl(body);
    expect(url.startsWith(`${NEW_ISSUE_URL}?`)).toBe(true);
    expect(bodyOf(url)).toBe(body);
  });

  it('keeps a long crash short enough for a link GitHub accepts', () => {
    const huge: CrashRecord = { ...CRASH, stack: 'frame /path/to/file.js:1\n'.repeat(2000) };
    const body = problemReportBody(BUILD, huge);
    expect(body.length).toBeLessThan(MAX_CRASH_CHARS + 500);
    expect(problemReportUrl(body).length).toBeLessThan(8000);
  });
});
