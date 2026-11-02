import { describe, expect, it } from 'vitest';
import { presentation, presentationMessage } from '../errors/presentation';
import { renderText } from '../errors/text';
import { nothingAnsweredDetail, portPreviewFailure, renderPortsMessage } from './failure';
import { decideNavigation, hostUrl, parseUrl, tunnelUrl } from './navigation';

const decide = (url: string, isMainFrame: boolean, localPort: number, remotePort: number) =>
  decideNavigation(url, { isMainFrame, localPort, remotePort });

describe('navigation policy', () => {
  it('keeps pages of the tunnel in the preview', () => {
    expect(decide('http://127.0.0.1:5173/src/main.ts', true, 5173, 5173)).toEqual({
      kind: 'allow',
    });
    expect(decide('http://localhost:50000/', true, 50000, 3000)).toEqual({ kind: 'allow' });
    expect(decide('about:blank', true, 50000, 3000)).toEqual({ kind: 'allow' });
  });

  it("points links to the Host's own port at the tunnel", () => {
    expect(decide('http://localhost:3000/login?next=%2F#form', true, 50000, 3000)).toEqual({
      kind: 'redirect',
      url: 'http://127.0.0.1:50000/login?next=%2F#form',
    });
    expect(decide('http://localhost/x', true, 50000, 80)).toEqual({
      kind: 'redirect',
      url: 'http://127.0.0.1:50000/x',
    });
  });

  it('asks before leaving the Host and refuses other loopback ports and schemes', () => {
    const external = 'https://example.com/docs';
    expect(decide(external, true, 50000, 3000)).toEqual({ kind: 'external', url: external });
    // An embedded frame loads as the page asks.
    expect(decide(external, false, 50000, 3000)).toEqual({ kind: 'allow' });
    expect(decide('http://127.0.0.1:8080/', true, 50000, 3000)).toEqual({ kind: 'cancel' });
    expect(decide('file:///etc/passwd', true, 50000, 3000)).toEqual({ kind: 'cancel' });
    expect(decide('intent://scan#Intent;end', true, 50000, 3000)).toEqual({ kind: 'cancel' });
    expect(decide('http://[::1]:3000/', true, 50000, 3000)).toMatchObject({ kind: 'redirect' });
    // Userinfo cannot disguise the host.
    expect(decide('http://localhost@example.com/', true, 50000, 3000)).toEqual({
      kind: 'external',
      url: 'http://localhost@example.com/',
    });
  });

  it('hands Share the page as the Host serves it', () => {
    expect(hostUrl('http://127.0.0.1:50000/app?tab=2', 3000)).toBe(
      'http://localhost:3000/app?tab=2',
    );
    expect(hostUrl(null, 8080)).toBe('http://localhost:8080/');
    expect(tunnelUrl('http://localhost:3000', 51000)).toBe('http://127.0.0.1:51000');
  });

  it('parses the parts it needs', () => {
    expect(parseUrl('HTTP://User@Host.Example:8080/p?q#f')).toEqual({
      scheme: 'http',
      host: 'host.example',
      port: 8080,
      rest: '/p?q#f',
    });
    expect(parseUrl('not a url')).toBeNull();
  });
});

describe('failure wording', () => {
  it('names the port when nothing answered', () => {
    const failure = portPreviewFailure(
      { kind: 'channelFailed', detail: nothingAnsweredDetail(5173) },
      5173,
    );
    expect(renderText(failure.title)).toBe('Nothing Answered');
    expect(renderPortsMessage(failure.message)).toBe('Nothing on the Host answered on port 5173.');
    // Another port's record is a plain channel failure.
    expect(
      renderText(
        portPreviewFailure({ kind: 'channelFailed', detail: nothingAnsweredDetail(80) }, 5173)
          .title,
      ),
    ).toBe("Couldn't Open the Preview");
  });

  it("blames the Host's own sshd, not a Jump Host, for refused forwarding", () => {
    const failure = portPreviewFailure({ kind: 'tcpForwardingUnavailable' }, 5173);
    const text = renderPortsMessage(failure.message);
    expect(text).toContain('AllowTcpForwarding');
    expect(text).not.toContain('Jump Host');
  });

  it('falls back to the transport presentation', () => {
    const failure = portPreviewFailure({ kind: 'timedOut' }, 5173);
    expect(renderText(failure.title)).toBe("Couldn't Open the Preview");
    expect(renderPortsMessage(failure.message)).toBe(
      presentationMessage(presentation({ kind: 'timedOut' })),
    );
  });
});
