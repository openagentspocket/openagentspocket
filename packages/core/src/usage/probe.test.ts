import { describe, expect, it } from 'vitest';
import { TransportFailure } from '../errors/transport-error';
import { isQueryableTimeZone, parseUsageProbe, usageProbeScript } from './probe';
import { UsageReportError } from './report';

const options = {
  pluginRoot: '/plugins/agentico',
  claudeLimits: false,
  nonce: 'test',
  endpoint: null,
};

describe('usageProbeScript', () => {
  it('rejects invalid arguments before building a script', () => {
    for (const bad of [
      { timeZone: "UTC'; touch /tmp/injected; '" },
      { timeZone: 'UTC', pluginRoot: 'relative' },
      { timeZone: 'UTC', nonce: '' },
      { timeZone: 'UTC', nonce: "a'b" },
    ]) {
      expect(() => usageProbeScript({ ...options, ...bad })).toThrow(TransportFailure);
    }
  });

  it.each(['Asia/Kolkata', 'US/Pacific', 'America/Argentina/Buenos_Aires', 'Etc/GMT+5', 'UTC'])(
    'passes %s to the plugin',
    (timeZone) => {
      expect(usageProbeScript({ ...options, timeZone })).toContain(`--tz '${timeZone}'`);
    },
  );

  it('caps the framed output and asks for Claude limits only when told to', () => {
    const plain = usageProbeScript({ ...options, timeZone: 'UTC' });
    expect(plain).toContain('head -c 1048576');
    expect(plain).not.toContain('--claude-limits');
    expect(usageProbeScript({ ...options, timeZone: 'UTC', claudeLimits: true })).toContain(
      "--tz 'UTC' --claude-limits",
    );
  });

  it('names a paired endpoint by absolute path instead of searching PATH', () => {
    const script = usageProbeScript({
      ...options,
      timeZone: 'UTC',
      endpoint: { socketPath: '/run/herdr.sock', executablePath: '/opt/herdr/bin/herdr' },
    });
    expect(script).toContain("export HERDR_SOCKET_PATH='/run/herdr.sock'");
    expect(script).toContain("'/opt/herdr/bin/herdr' plugin config-dir agentico");
    expect(script).not.toContain('export PATH=');
  });

  it.each(['Mars/Olympus_Mons', "Asia/Kolkata'", 'Asia//Kolkata', 'GMT+0530', '', '/UTC', 'UTC/'])(
    'refuses the time zone %j',
    (zone) => {
      expect(isQueryableTimeZone(zone)).toBe(false);
    },
  );
});

describe('parseUsageProbe', () => {
  const json = '{"version":1,"runtime":"missing"}';
  const valid = `shell noise\n__AGENTICO_USAGE_BEGIN_test\n${json}\n__AGENTICO_USAGE_END_test:0\nnoise`;

  it('decodes a complete nonce-framed response', () => {
    expect(parseUsageProbe(valid, 'test').runtime).toBe('missing');
  });

  it('never reads anything else as success', () => {
    const truncated = valid.slice(0, valid.indexOf('\n__AGENTICO_USAGE_END'));
    for (const invalid of [
      json,
      truncated,
      valid.replace('END_test', 'END_other'),
      valid.replace('END_test:0', 'END_test:1'),
      valid.replace('END_test:0\n', 'END_test:0'),
      valid.replace(json, '{"version":1,"runtime":"recorded"}'),
    ]) {
      expect(() => parseUsageProbe(invalid, 'test')).toThrow(TransportFailure);
    }
  });

  it('lets a newer plugin format through as its own error so the app can ask for an update', () => {
    const newer = valid.replace(json, '{"version":2}');
    expect(() => parseUsageProbe(newer, 'test')).toThrow(UsageReportError);
  });
});
