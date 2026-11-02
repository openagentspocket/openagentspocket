import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseUsageProbe } from './probe';
import { decodeUsageReport } from './report';

// The real plugin query (packages/plugin/src/usage-query.js) run against an empty home: whatever it
// prints must decode, and the framed form the probe script produces must parse.
const query = new URL('../../../plugin/src/usage-query.js', import.meta.url).pathname;

function runQuery(): string {
  const home = mkdtempSync(join(tmpdir(), 'oap-usage-'));
  return execFileSync(process.execPath, [query, '--tz', 'UTC'], {
    env: { PATH: process.env.PATH, HOME: home, HERDR_PLUGIN_CONFIG_DIR: home },
    encoding: 'utf8',
    timeout: 20_000,
  });
}

describe('the real plugin usage query', () => {
  it('prints a report the decoder accepts', () => {
    const report = decodeUsageReport(runQuery());
    expect(report.version).toBe(1);
    expect(report.runtime === 'recorded' || report.runtime === 'missing').toBe(true);
  });

  it('survives the probe framing', () => {
    const framed = `__AGENTICO_USAGE_BEGIN_n1\n${runQuery()}\n__AGENTICO_USAGE_END_n1:0\n`;
    expect(parseUsageProbe(framed, 'n1').version).toBe(1);
  });
});
