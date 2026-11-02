import { describe, expect, it } from 'vitest';
import { HerdrApiError } from './herdr-api-error';
import {
  explanation,
  presentation,
  presentationMessage,
  type TransportErrorPresentation,
  userFacingDescription,
} from './presentation';
import { type Message, renderText, type Text, type Translate } from './text';
import { isRetryable, type TransportError, TransportFailure } from './transport-error';

// Behavior of the Swift TransportError+Presentation, without pinning copy: which part carries
// the error's own words, which errors suggest a step, how Jump Host and route failures are
// retargeted, and how the parts compose. Catalog keys resolve through a stub translator.

const presented = 'SHA256:presented';
const mismatch: TransportError = { kind: 'hostKeyMismatch', known: 'SHA256:known', presented };

/** Renders a catalog message as `<key|args>` so composition is visible without real copy. */
const stub: Translate = (key, args) => `<${[key, ...args].join('|')}>`;

const ALL: readonly TransportError[] = [
  { kind: 'sshUnreachable', detail: 'down' },
  { kind: 'tcpForwardingUnavailable' },
  { kind: 'authenticationFailed' },
  { kind: 'deviceKeyCorrupt' },
  { kind: 'rsaKeyCorrupt' },
  { kind: 'rsaSignatureUnsupported' },
  { kind: 'keyAccessNotConfirmed' },
  { kind: 'hostKeyRejected', presented },
  mismatch,
  { kind: 'socketNotFound', path: '/tmp/herdr.sock' },
  { kind: 'herdrBinaryNotFound' },
  { kind: 'herdrLauncherNotFound', path: '/opt/example/bin/herdr' },
  { kind: 'streamLocalOpenFailed', path: '/tmp/herdr.sock' },
  { kind: 'protocolVersionMismatch', server: 18, supported: 19 },
  { kind: 'homeDirectoryUnresolvable', detail: 'echo $HOME failed' },
  { kind: 'invalidDirectoryPath', path: 'relative/path' },
  { kind: 'eventsChannelAlreadyOpen' },
  { kind: 'terminalChannelAlreadyOpen' },
  { kind: 'timedOut' },
  { kind: 'gitTimedOut' },
  { kind: 'hostFileTimedOut' },
  { kind: 'hostFileUnreadable', status: 3 },
  { kind: 'hostStoreUnreadable', detail: 'Error: disk I/O error' },
  { kind: 'cancelled' },
  { kind: 'malformedResponse', detail: '{not-json}' },
  { kind: 'apiRejected', code: 'pane_not_found', message: 'gone' },
  { kind: 'channelFailed', detail: 'reset' },
  { kind: 'attachExited', status: 1, output: 'herdr: lost connection to server' },
  { kind: 'hostFeatureUnavailable', feature: 'ports' },
];

function messages(text: Text | undefined): Message[] {
  if (text === undefined || typeof text === 'string') return [];
  if ('join' in text) return text.join.flatMap(messages);
  return [text, ...(text.args ?? []).flatMap(messages)];
}

const shown = (error: TransportError) => presentation(error);
const jump = (underlying: TransportError): TransportError => ({
  kind: 'jumpHostFailed',
  underlying,
});

describe('presentation', () => {
  it('fills every catalog placeholder with exactly one argument', () => {
    const errors = [...ALL, ...ALL.map(jump)];
    for (const error of errors) {
      const parts = shown(error);
      for (const entry of [parts.summary, parts.detail, parts.recovery].flatMap(messages)) {
        const placeholders = entry.key.split('%@').length - 1;
        expect(entry.args?.length ?? 0, entry.key).toBe(placeholders);
      }
    }
  });

  it("keeps the error's own words in the detail", () => {
    expect(shown({ kind: 'sshUnreachable', detail: 'connection refused' }).detail).toBe(
      'connection refused',
    );
    expect(shown({ kind: 'socketNotFound', path: '/tmp/herdr.sock' }).detail).toBe(
      '/tmp/herdr.sock',
    );
    expect(shown({ kind: 'herdrLauncherNotFound', path: '/opt/x/herdr' }).detail).toBe(
      '/opt/x/herdr',
    );
    expect(shown({ kind: 'channelFailed', detail: 'reset' }).detail).toBe('reset');
    expect(shown({ kind: 'malformedResponse', detail: '{' }).detail).toBe('{');
    expect(shown({ kind: 'apiRejected', code: 'pane_not_found', message: 'gone' }).detail).toBe(
      'gone (pane_not_found)',
    );
    expect(
      renderText(
        shown({ kind: 'protocolVersionMismatch', server: 18, supported: 19 }).detail ?? '',
        stub,
      ),
    ).toContain('|18|19');
    expect(
      renderText(shown({ kind: 'hostFileUnreadable', status: 3 }).detail ?? '', stub),
    ).toContain('|3');
  });

  it('suggests a step only for unreachable among the retryable failures', () => {
    const retryable = [...ALL, ...ALL.map(jump)].filter(isRetryable);
    expect(retryable.length).toBeGreaterThan(0);
    for (const error of retryable) {
      const unreachable =
        error.kind === 'sshUnreachable' ||
        (error.kind === 'jumpHostFailed' && error.underlying.kind === 'sshUnreachable');
      expect(shown(error).recovery !== undefined, error.kind).toBe(unreachable);
    }
  });

  it('gives the two busy-channel failures one presentation', () => {
    expect(shown({ kind: 'eventsChannelAlreadyOpen' })).toEqual(
      shown({ kind: 'terminalChannelAlreadyOpen' }),
    );
  });

  it('lets a whole store sentence explain itself, and keeps a cut line under a summary', () => {
    const busy = shown({ kind: 'hostStoreUnreadable', detail: "OpenCode's database is busy." });
    expect(busy).toEqual({ summary: "OpenCode's database is busy" });
    expect(explanation(busy)).toBe("OpenCode's database is busy.");
    const long = `Runtime error near line 9: ${'x'.repeat(172)}…`;
    const cut = shown({ kind: 'hostStoreUnreadable', detail: long });
    expect(cut.detail).toBe(long);
    expect(typeof cut.summary).not.toBe('string');
    expect(explanation(cut, stub).endsWith('…')).toBe(true);
  });

  it("drops herdr's own trailing period from an attach exit and omits an empty one", () => {
    expect(shown({ kind: 'attachExited', status: 3, output: 'Error: no such pane.' }).detail).toBe(
      'Error: no such pane',
    );
    expect(shown({ kind: 'attachExited', status: 1 }).detail).toBeUndefined();
    expect(shown({ kind: 'attachExited', status: 1, output: '...' }).detail).toBeUndefined();
  });

  it('tells an endpoint Host to start its configured instance, and nothing else changes', () => {
    const missing: TransportError = { kind: 'socketNotFound', path: '/tmp/herdr/herdr.sock' };
    const endpoint = presentation(missing, { usesHerdrEndpoint: true });
    expect(endpoint.summary).toEqual(shown(missing).summary);
    expect(endpoint.detail).toBe('/tmp/herdr/herdr.sock');
    expect(endpoint.recovery).not.toEqual(shown(missing).recovery);
    expect(presentation(missing, { usesHerdrEndpoint: false })).toEqual(shown(missing));
    for (const error of ALL.filter((e) => e.kind !== 'socketNotFound')) {
      expect(presentation(error, { usesHerdrEndpoint: true })).toEqual(shown(error));
    }
  });
});

describe('Jump Host presentation', () => {
  it('retargets the first-hop failures at the Jump Host', () => {
    const retargeted: TransportError[] = [
      { kind: 'sshUnreachable', detail: 'refused' },
      { kind: 'authenticationFailed' },
      { kind: 'hostKeyRejected', presented },
      mismatch,
      { kind: 'tcpForwardingUnavailable' },
      { kind: 'timedOut' },
      { kind: 'cancelled' },
      { kind: 'channelFailed', detail: 'reset' },
      { kind: 'rsaSignatureUnsupported' },
    ];
    for (const error of retargeted) {
      const outer = shown(jump(error));
      expect(outer.summary, error.kind).not.toEqual(shown(error).summary);
      expect(outer.detail).toEqual(shown(error).detail);
      expect(outer.recovery === undefined).toBe(shown(error).recovery === undefined);
    }
  });

  it('never tells the user to fix the Host when the Jump Host rejected authentication', () => {
    const outer = shown(jump({ kind: 'authenticationFailed' }));
    expect(outer.recovery).not.toEqual(shown({ kind: 'authenticationFailed' }).recovery);
  });

  it('shows device-wide key failures as they are', () => {
    for (const error of [{ kind: 'deviceKeyCorrupt' }, { kind: 'rsaKeyCorrupt' }] as const) {
      expect(shown(jump(error))).toEqual(shown(error));
    }
  });

  it('prefixes any other failure and drops its Host-targeted suggestion', () => {
    const fallbacks: TransportError[] = [
      { kind: 'socketNotFound', path: '/tmp/herdr.sock' },
      { kind: 'streamLocalOpenFailed', path: '/tmp/herdr.sock' },
      { kind: 'herdrBinaryNotFound' },
      { kind: 'herdrLauncherNotFound', path: '/opt/example/bin/herdr' },
      { kind: 'protocolVersionMismatch', server: 18, supported: 19 },
      { kind: 'homeDirectoryUnresolvable', detail: 'echo $HOME failed' },
      { kind: 'malformedResponse', detail: '{' },
      { kind: 'apiRejected', code: 'busy', message: 'try later' },
      { kind: 'eventsChannelAlreadyOpen' },
      { kind: 'terminalChannelAlreadyOpen' },
    ];
    for (const error of fallbacks) {
      const outer = shown(jump(error));
      const inner = shown(error);
      expect((outer.summary as Message).args).toEqual([inner.summary]);
      expect(outer.detail).toEqual(inner.detail);
      expect(outer.recovery).toBeUndefined();
    }
  });

  it('collapses a nested Jump Host failure instead of stacking prefixes', () => {
    const inner = jump({ kind: 'authenticationFailed' });
    expect(shown(jump(inner))).toEqual(shown(inner));
  });
});

describe('route failures', () => {
  const lan = { route: '192.168.1.5', mayNameAnotherMachine: true, routeId: null } as const;

  it('names each route with its own summary, in order', () => {
    const error: TransportError = {
      kind: 'noRouteReached',
      failures: [
        { ...lan, error: { kind: 'timedOut' } },
        {
          route: '127.0.0.1:2222 via vps.example',
          mayNameAnotherMachine: false,
          routeId: null,
          error: { kind: 'authenticationFailed' },
        },
      ],
    };
    const parts = shown(error);
    expect(renderText(parts.detail ?? '', stub)).toBe(
      `192.168.1.5: ${renderText(shown({ kind: 'timedOut' }).summary, stub)}; ` +
        `127.0.0.1:2222 via vps.example: ${renderText(shown({ kind: 'authenticationFailed' }).summary, stub)}`,
    );
    expect(parts.recovery).toBeDefined();
  });

  it('leads with a changed key that counts as a security failure', () => {
    const error: TransportError = {
      kind: 'noRouteReached',
      failures: [
        { ...lan, error: { kind: 'timedOut' } },
        { route: '100.64.0.5', mayNameAnotherMachine: false, routeId: null, error: mismatch },
      ],
    };
    expect(shown(error).summary).toEqual(shown(mismatch).summary);
    expect(shown(error).recovery).toEqual(shown(mismatch).recovery);
  });

  it('does not lead with an excused LAN key change', () => {
    const error: TransportError = {
      kind: 'noRouteReached',
      failures: [
        { ...lan, error: mismatch },
        {
          route: '100.64.0.5',
          mayNameAnotherMachine: false,
          routeId: null,
          error: { kind: 'timedOut' },
        },
      ],
    };
    expect(shown(error).summary).not.toEqual(shown(mismatch).summary);
  });
});

describe('composition', () => {
  const parts = (summary: Text, detail?: Text, recovery?: Message): TransportErrorPresentation => ({
    summary,
    ...(detail === undefined ? {} : { detail }),
    ...(recovery === undefined ? {} : { recovery }),
  });

  it('joins summary and detail into one sentence and never includes the suggestion', () => {
    expect(explanation(parts('S'))).toBe('S.');
    expect(explanation(parts('S', 'd'))).toBe('S: d.');
    expect(explanation(parts('S', 'cut…'))).toBe('S: cut…');
    expect(explanation(parts('S', 'd', { key: 'R' }))).toBe('S: d.');
    expect(presentationMessage(parts('S', 'd', { key: 'R' }))).toBe('S: d. R');
    expect(presentationMessage(parts('S'))).toBe('S.');
  });

  it('renders catalog messages through the translator, source text by default', () => {
    const shownParts = parts(
      { key: 'A %@', args: ['x'] },
      { join: ['r', { key: 'B' }], separator: ': ' },
    );
    expect(explanation(shownParts, stub)).toBe('<A %@|x>: r: <B>.');
    expect(explanation(shownParts)).toBe('A x: r: B.');
  });

  it('describes any thrown value for a person', () => {
    const failure = new TransportFailure({ kind: 'timedOut' });
    expect(userFacingDescription(failure, stub)).toBe(
      presentationMessage(shown({ kind: 'timedOut' }), stub),
    );
    expect(userFacingDescription(new HerdrApiError('x', 'nope'))).toBe('nope');
    expect(userFacingDescription(new Error('plain'))).toBe('plain');
    expect(userFacingDescription(42)).toBe('42');
  });
});
