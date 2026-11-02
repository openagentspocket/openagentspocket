import { describe, expect, it } from 'vitest';
import { renderText } from '../errors/text';
import { type TransportError, TransportFailure } from '../errors/transport-error';
import { type Clock, FakeClock } from '../hosts/cancellation';
import { nothingAnsweredDetail } from './failure';
import { DEV_SERVER, PUBLIC_SERVER, SAMPLE_REPORT, VAULTWARDEN } from './fixtures';
import { manualPort, type PortPreviewHost, type PortPreviewTunnel } from './host';
import { PortsStore } from './store';
import type { ForwardTarget, ListeningPortReport } from './types';
import { canOpen } from './types';

class FakeTunnel implements PortPreviewTunnel {
  starts = 0;
  stops = 0;
  listening = false;
  failure: TransportError | null = null;

  constructor(
    readonly target: ForwardTarget,
    readonly localPort: number,
    private readonly startError: TransportError | null,
  ) {}

  async start() {
    this.starts += 1;
    if (this.startError) throw new TransportFailure(this.startError);
    this.listening = true;
    return { url: `http://127.0.0.1:${this.localPort}/`, localPort: this.localPort };
  }

  async stop() {
    this.stops += 1;
    this.listening = false;
  }

  async lastFailure() {
    return this.failure;
  }
}

class FakeHost implements PortPreviewHost {
  listCalls = 0;
  disconnects = 0;
  closes = 0;
  tunnels: FakeTunnel[] = [];
  nextStartError: TransportError | null = null;
  private result: { report: ListeningPortReport } | { error: TransportError } = {
    report: SAMPLE_REPORT,
  };

  answer(report: ListeningPortReport) {
    this.result = { report };
  }
  fail(error: TransportError) {
    this.result = { error };
  }

  async listListeningPorts() {
    this.listCalls += 1;
    if ('error' in this.result) throw new TransportFailure(this.result.error);
    return this.result.report;
  }

  makeTunnel(target: ForwardTarget) {
    const tunnel = new FakeTunnel(target, 50_000 + this.tunnels.length, this.nextStartError);
    this.nextStartError = null;
    this.tunnels.push(tunnel);
    return tunnel;
  }

  async disconnect() {
    this.disconnects += 1;
  }
  async close() {
    this.closes += 1;
  }
}

function setup(gracePeriodMs = 60_000) {
  const host = new FakeHost();
  const clock = new FakeClock();
  const store = new PortsStore({ hostName: 'devbox', host, clock, gracePeriodMs });
  return { host, clock, store };
}

const phaseOf = (store: PortsStore) => store.getState().preview?.phase.kind;

async function opened(store: PortsStore, open: () => void) {
  open();
  await store.settle();
  expect(phaseOf(store)).toBe('open');
}

describe('listing', () => {
  it('keeps system ports behind Show All and does not ask twice', async () => {
    const { host, store } = setup();
    store.start();
    await store.settle();
    expect(store.getState().listing).toEqual({ kind: 'loaded', report: SAMPLE_REPORT });
    expect(store.visiblePorts.map((p) => p.port)).toEqual([8080, 5173, 9443]);
    expect(store.hiddenCount).toBe(1);
    store.setShowsAll(true);
    expect(store.visiblePorts.map((p) => p.port)).toEqual([8080, 5173, 9443, 22]);

    store.start();
    await store.settle();
    expect(host.listCalls).toBe(1);
  });

  it('disables a row bound to a public address and never opens it', () => {
    const { host, store } = setup();
    expect(canOpen(DEV_SERVER)).toBe(true);
    expect(canOpen(VAULTWARDEN)).toBe(true);
    expect(canOpen(PUBLIC_SERVER)).toBe(false);
    store.open(PUBLIC_SERVER);
    expect(store.getState().preview).toBeNull();
    expect(host.tunnels).toHaveLength(0);
  });

  it('says why a discovery failed and a later failure keeps the list', async () => {
    const { host, store } = setup();
    host.fail({ kind: 'timedOut' });
    store.start();
    await store.settle();
    expect(store.getState().listing).toMatchObject({
      kind: 'failed',
      message: { transport: { kind: 'timedOut' } },
    });

    host.answer(SAMPLE_REPORT);
    store.refresh();
    await store.settle();
    expect(store.getState().listing?.kind).toBe('loaded');

    host.fail({ kind: 'timedOut' });
    store.refresh();
    expect(store.getState().isRefreshing).toBe(true);
    await store.settle();
    expect(store.getState().isRefreshing).toBe(false);
    expect(store.getState().listing?.kind).toBe('loaded');
    expect(store.getState().refreshFailure).toEqual({ transport: { kind: 'timedOut' } });
  });

  it('names a native Windows Host in the failure', async () => {
    const { host, store } = setup();
    host.fail({ kind: 'hostFeatureUnavailable', feature: 'Browser preview' });
    store.start();
    await store.settle();
    expect(store.getState().listing).toMatchObject({
      kind: 'failed',
      message: { key: 'Ports are not available on native Windows Hosts.' },
    });
  });

  it('ignores a superseded refresh', async () => {
    const { host, store } = setup();
    host.answer({ ports: [DEV_SERVER], isTruncated: false, readContainers: false });
    store.refresh();
    host.answer(SAMPLE_REPORT);
    store.refresh();
    await store.settle();
    expect(store.getState().listing).toEqual({ kind: 'loaded', report: SAMPLE_REPORT });
  });
});

describe('preview lifecycle', () => {
  it('starts the tunnel for a row and stops it when the preview is left', async () => {
    const { host, store } = setup();
    await opened(store, () => store.open(DEV_SERVER));
    const preview = store.getState().preview;
    expect(renderText(preview?.title ?? '')).toBe('node');
    expect(preview?.target).toEqual({ kind: 'loopbackV4', port: 5173 });
    expect(preview?.phase).toEqual({
      kind: 'open',
      url: 'http://127.0.0.1:50000/',
      localPort: 50000,
    });
    expect(preview?.loadId).toBe(1);

    store.closePreview();
    expect(store.getState().preview).toBeNull();
    await store.settle();
    const tunnel = host.tunnels[0];
    expect(tunnel?.stops).toBe(1);
    expect(tunnel?.listening).toBe(false);
  });

  it('keeps one preview at a time', async () => {
    const { host, store } = setup();
    await opened(store, () => store.open(DEV_SERVER));
    await opened(store, () => store.open(VAULTWARDEN));
    expect(host.tunnels).toHaveLength(2);
    expect(host.tunnels[0]?.stops).toBe(1);
    expect(host.tunnels[1]?.listening).toBe(true);
    expect(renderText(store.getState().preview?.title ?? '')).toBe('vaultwarden');
  });

  it('opens a typed port on the Host loopback only', async () => {
    const { store } = setup();
    await opened(store, () => store.openPort(3000));
    expect(store.getState().preview?.target).toEqual({ kind: 'loopbackV4', port: 3000 });
    store.openPort(0);
    store.openPort(70000);
    expect(store.getState().preview?.target).toEqual({ kind: 'loopbackV4', port: 3000 });
  });

  it('accepts only whole numbers from 1 to 65535 as a typed port', () => {
    expect(manualPort(' 8080 ')).toBe(8080);
    expect(manualPort('65535')).toBe(65535);
    for (const bad of ['0', '65536', '-1', '80a', '١٢٣', '', '1e3', '+80']) {
      expect(manualPort(bad)).toBeNull();
    }
  });

  it('says why a tunnel cannot open', async () => {
    const { host, store } = setup();
    host.nextStartError = { kind: 'tcpForwardingUnavailable' };
    store.open(DEV_SERVER);
    await store.settle();
    const phase = store.getState().preview?.phase;
    expect(phase?.kind).toBe('failed');
    if (phase?.kind !== 'failed') return;
    expect(phase.failure.title).toMatchObject({ key: 'Port Forwarding Is Off' });
    expect(renderText(phase.failure.message as { key: string })).toContain('AllowTcpForwarding');
  });

  it('names the port when nothing answered, and Try Again reuses the tunnel', async () => {
    const { host, store } = setup();
    await opened(store, () => store.openPort(3000));
    const tunnel = host.tunnels[0];
    if (tunnel) tunnel.failure = { kind: 'channelFailed', detail: nothingAnsweredDetail(3000) };

    store.pageDidFail({ cancelled: false, message: 'connection lost' });
    await store.settle();
    const phase = store.getState().preview?.phase;
    expect(phase).toMatchObject({
      kind: 'failed',
      failure: {
        title: { key: 'Nothing Answered' },
        message: { key: 'Nothing on the Host answered on port %@.' },
      },
    });

    store.retry();
    await store.settle();
    expect(phaseOf(store)).toBe('open');
    expect(store.getState().preview?.loadId).toBe(2);
    expect(host.tunnels).toHaveLength(1);
  });

  it('falls back to the web view error after a second look', async () => {
    const { clock, store } = setup();
    await opened(store, () => store.openPort(3000));
    store.pageDidFail({ cancelled: false, message: 'blank page' });
    await clock.advance(200);
    await store.settle();
    expect(store.getState().preview?.phase).toMatchObject({
      kind: 'failed',
      failure: { title: { key: "Couldn't Load the Page" }, message: 'blank page' },
    });
  });

  it('ignores a cancelled load', async () => {
    const { clock, store } = setup();
    await opened(store, () => store.open(DEV_SERVER));
    store.pageDidFail({ cancelled: true, message: 'cancelled' });
    await clock.advance(300);
    await store.settle();
    expect(phaseOf(store)).toBe('open');
  });

  it('stops the tunnel and ends the connection when the screens close', async () => {
    const { host, store } = setup();
    await opened(store, () => store.open(DEV_SERVER));
    store.close();
    await store.settle();
    expect(host.tunnels[0]?.stops).toBe(1);
    expect(host.closes).toBe(1);

    store.open(VAULTWARDEN);
    store.refresh();
    expect(store.getState().preview).toBeNull();
    expect(host.tunnels).toHaveLength(1);
    expect(host.listCalls).toBe(0);
  });
});

describe('background', () => {
  it('pauses past the grace period and reopens on foreground', async () => {
    const { host, clock, store } = setup(50);
    await opened(store, () => store.open(DEV_SERVER));

    store.sceneDidEnterBackground();
    await clock.advance(50);
    await store.settle();
    expect(phaseOf(store)).toBe('paused');
    expect(host.tunnels[0]?.stops).toBe(1);
    expect(host.disconnects).toBe(1);

    store.sceneDidBecomeActive();
    await store.settle();
    expect(phaseOf(store)).toBe('open');
    expect(store.getState().preview?.loadId).toBe(2);
    expect(host.tunnels[0]?.starts).toBe(2);
    expect(host.tunnels).toHaveLength(1);
  });

  it('keeps the tunnel through a short trip', async () => {
    const { host, clock, store } = setup(60_000);
    await opened(store, () => store.open(DEV_SERVER));
    store.sceneDidEnterBackground();
    await clock.advance(5_000);
    store.sceneDidBecomeActive();
    await clock.advance(120_000);
    await store.settle();
    expect(host.tunnels[0]?.stops).toBe(0);
    expect(host.tunnels[0]?.starts).toBe(1);
    expect(store.getState().preview?.loadId).toBe(1);
  });

  it('reopens after a suspension the timer missed', async () => {
    const host = new FakeHost();
    // The process froze: time moves, but no timer ever runs.
    const clock = { now: 0 };
    const frozen: Clock = {
      setTimeout: () => 1,
      clearTimeout: () => undefined,
      monotonicMs: () => clock.now,
    };
    const store = new PortsStore({
      hostName: 'devbox',
      host,
      clock: frozen,
      gracePeriodMs: 60_000,
    });
    await opened(store, () => store.open(DEV_SERVER));
    store.sceneDidEnterBackground();
    clock.now += 61_000;
    store.sceneDidBecomeActive();
    await store.settle();
    expect(phaseOf(store)).toBe('open');
    expect(host.tunnels[0]?.stops).toBe(1);
    expect(host.tunnels[0]?.starts).toBe(2);
    expect(host.disconnects).toBe(1);
  });

  it('stops nothing in the background without a preview', async () => {
    const { host, clock, store } = setup(10);
    store.sceneDidEnterBackground();
    await clock.advance(50);
    store.sceneDidBecomeActive();
    await store.settle();
    expect(host.disconnects).toBe(0);
    expect(store.getState().preview).toBeNull();
  });
});
